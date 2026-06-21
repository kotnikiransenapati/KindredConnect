// P42 — Multi-region failover orchestrator server functions.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { assertProjectRole, enforceRateLimit, planFailover, type Region } from "./failover.server";

const db = (ctx: any) => ctx.supabase as any;
const RoleZ = z.enum(["primary", "replica", "standby", "observer"]);
const StatusZ = z.enum(["healthy", "degraded", "down", "draining"]);
const StrategyZ = z.enum(["active-active", "active-passive", "geo", "weighted"]);

export const listRegions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ projectId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertProjectRole(context, data.projectId, "viewer");
    const { data: rows, error } = await db(context).from("failover_regions")
      .select("*").eq("project_id", data.projectId).order("role", { ascending: true });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const upsertRegion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    id: z.string().uuid().optional(),
    projectId: z.string().uuid(),
    code: z.string().min(2).max(40).regex(/^[a-z0-9-]+$/i),
    displayName: z.string().min(2).max(120),
    role: RoleZ.default("replica"),
    status: StatusZ.default("healthy"),
    latencyMs: z.number().int().min(0).max(60_000).default(50),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertProjectRole(context, data.projectId, "editor");
    await enforceRateLimit(context, "region", 60);
    const payload: any = {
      project_id: data.projectId, code: data.code, display_name: data.displayName,
      role: data.role, status: data.status, latency_ms: data.latencyMs, last_check: new Date().toISOString(),
    };
    if (data.id) payload.id = data.id;
    const { data: saved, error } = await db(context).from("failover_regions")
      .upsert(payload, { onConflict: data.id ? "id" : "project_id,code" }).select("*").single();
    if (error) throw new Error(error.code === "23505" ? "Region code already exists" : error.message);
    return saved;
  });

export const recordHealthCheck = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    projectId: z.string().uuid(),
    regionId: z.string().uuid(),
    status: StatusZ,
    latencyMs: z.number().int().min(0).max(60_000),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertProjectRole(context, data.projectId, "editor");
    await enforceRateLimit(context, "health", 300);
    const { data: region } = await db(context).from("failover_regions")
      .select("code").eq("id", data.regionId).single();
    const { error } = await db(context).from("failover_regions")
      .update({ status: data.status, latency_ms: data.latencyMs, last_check: new Date().toISOString() })
      .eq("id", data.regionId).eq("project_id", data.projectId);
    if (error) throw new Error(error.message);
    await db(context).from("failover_events").insert({
      project_id: data.projectId, kind: "health-check",
      from_region: region?.code ?? null, reason: `status=${data.status} latency=${data.latencyMs}ms`,
      metadata: { latencyMs: data.latencyMs, status: data.status }, actor_id: context.userId,
    });
    return { ok: true };
  });

export const listPolicies = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ projectId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertProjectRole(context, data.projectId, "viewer");
    const { data: rows, error } = await db(context).from("failover_policies")
      .select("*").eq("project_id", data.projectId).order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const upsertPolicy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    id: z.string().uuid().optional(),
    projectId: z.string().uuid(),
    name: z.string().min(2).max(120),
    strategy: StrategyZ.default("active-passive"),
    healthThreshold: z.number().int().min(1).max(10).default(2),
    cooldownMinutes: z.number().int().min(0).max(1440).default(5),
    trafficWeights: z.record(z.string(), z.number()).default({}),
    enabled: z.boolean().default(true),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertProjectRole(context, data.projectId, "editor");
    await enforceRateLimit(context, "policy", 30);
    const payload: any = {
      project_id: data.projectId, name: data.name, strategy: data.strategy,
      health_threshold: data.healthThreshold, cooldown_minutes: data.cooldownMinutes,
      traffic_weights: data.trafficWeights, enabled: data.enabled,
    };
    if (data.id) payload.id = data.id;
    const { data: saved, error } = await db(context).from("failover_policies")
      .upsert(payload, { onConflict: data.id ? "id" : "project_id,name" }).select("*").single();
    if (error) throw new Error(error.code === "23505" ? "Policy name already exists" : error.message);
    return saved;
  });

export const evaluatePolicy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    projectId: z.string().uuid(), policyId: z.string().uuid(), apply: z.boolean().default(false),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertProjectRole(context, data.projectId, data.apply ? "editor" : "viewer");
    await enforceRateLimit(context, "evaluate", 60);
    const [{ data: policy }, { data: regions }] = await Promise.all([
      db(context).from("failover_policies").select("*").eq("id", data.policyId).eq("project_id", data.projectId).single(),
      db(context).from("failover_regions").select("*").eq("project_id", data.projectId),
    ]);
    if (!policy) throw new Error("Policy not found");
    const plan = planFailover((regions ?? []) as Region[], policy);

    if (data.apply && plan.action !== "none") {
      if (plan.action === "failover" && plan.from && plan.to) {
        await db(context).from("failover_regions").update({ role: "replica" }).eq("project_id", data.projectId).eq("code", plan.from);
        await db(context).from("failover_regions").update({ role: "primary" }).eq("project_id", data.projectId).eq("code", plan.to);
      } else if (plan.action === "promote" && plan.to) {
        await db(context).from("failover_regions").update({ role: "primary" }).eq("project_id", data.projectId).eq("code", plan.to);
      }
      await db(context).from("failover_policies")
        .update({ traffic_weights: plan.weights }).eq("id", data.policyId);
      await db(context).from("failover_events").insert({
        policy_id: data.policyId, project_id: data.projectId,
        kind: plan.action === "rebalance" ? "promotion" : plan.action,
        from_region: plan.from ?? null, to_region: plan.to ?? null,
        reason: plan.reason, metadata: { weights: plan.weights }, actor_id: context.userId,
      });
    }
    return plan;
  });

export const listEvents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ projectId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertProjectRole(context, data.projectId, "viewer");
    const { data: rows, error } = await db(context).from("failover_events")
      .select("*").eq("project_id", data.projectId).order("created_at", { ascending: false }).limit(100);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });
