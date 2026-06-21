// P44 — Edge AI inference router server functions.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { assertProjectRole, enforceRateLimit, estimateCost, selectModel, type ModelRow, type RouteRow } from "./edge-ai-router.server";

const db = (ctx: any) => ctx.supabase as any;

export const listModels = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ projectId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertProjectRole(context, data.projectId, "viewer");
    const { data: rows, error } = await db(context).from("edge_ai_models")
      .select("*").eq("project_id", data.projectId).order("slug");
    if (error) throw new Error(error.message);
    return (rows ?? []) as any[];
  });

export const upsertModel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    id: z.string().uuid().optional(),
    projectId: z.string().uuid(),
    slug: z.string().min(2).max(60).regex(/^[a-z0-9._-]+$/i),
    provider: z.enum(["lovable", "openai", "anthropic", "google", "azure", "local", "custom"]),
    modelId: z.string().min(1).max(120),
    region: z.string().min(2).max(40).default("global"),
    status: z.enum(["active", "disabled", "degraded"]).default("active"),
    costInput: z.number().min(0).max(100).default(0),
    costOutput: z.number().min(0).max(100).default(0),
    avgLatencyMs: z.number().int().min(0).max(60_000).default(250),
    contextWindow: z.number().int().min(512).max(2_000_000).default(8192),
    capabilities: z.array(z.string().min(1).max(40)).max(20).default([]),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertProjectRole(context, data.projectId, "editor");
    await enforceRateLimit(context, "model", 30);
    const payload: any = {
      project_id: data.projectId, slug: data.slug, provider: data.provider, model_id: data.modelId,
      region: data.region, status: data.status,
      cost_per_1k_input: data.costInput, cost_per_1k_output: data.costOutput,
      avg_latency_ms: data.avgLatencyMs, context_window: data.contextWindow, capabilities: data.capabilities,
    };
    if (data.id) payload.id = data.id;
    const { data: saved, error } = await db(context).from("edge_ai_models")
      .upsert(payload, { onConflict: data.id ? "id" : "project_id,slug" }).select("*").single();
    if (error) throw new Error(error.code === "23505" ? "Slug already exists" : error.message);
    return saved;
  });

export const deleteModel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ projectId: z.string().uuid(), id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertProjectRole(context, data.projectId, "owner");
    const { error } = await db(context).from("edge_ai_models").delete().eq("id", data.id).eq("project_id", data.projectId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listRoutes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ projectId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertProjectRole(context, data.projectId, "viewer");
    const { data: rows, error } = await db(context).from("edge_ai_routes")
      .select("*").eq("project_id", data.projectId).order("name");
    if (error) throw new Error(error.message);
    return (rows ?? []) as any[];
  });

export const upsertRoute = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    id: z.string().uuid().optional(),
    projectId: z.string().uuid(),
    name: z.string().min(2).max(80),
    capability: z.string().min(2).max(40),
    strategy: z.enum(["cheapest", "fastest", "weighted", "fallback", "round-robin"]).default("cheapest"),
    weights: z.record(z.string(), z.number().min(0).max(1000)).default({}),
    fallbackChain: z.array(z.string()).max(10).default([]),
    maxCostPer1k: z.number().min(0).max(100).nullable().optional(),
    maxLatencyMs: z.number().int().min(0).max(60_000).nullable().optional(),
    enabled: z.boolean().default(true),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertProjectRole(context, data.projectId, "editor");
    await enforceRateLimit(context, "route", 30);
    const payload: any = {
      project_id: data.projectId, name: data.name, capability: data.capability, strategy: data.strategy,
      weights: data.weights, fallback_chain: data.fallbackChain,
      max_cost_per_1k: data.maxCostPer1k ?? null, max_latency_ms: data.maxLatencyMs ?? null,
      enabled: data.enabled,
    };
    if (data.id) payload.id = data.id;
    const { data: saved, error } = await db(context).from("edge_ai_routes")
      .upsert(payload, { onConflict: data.id ? "id" : "project_id,name" }).select("*").single();
    if (error) throw new Error(error.code === "23505" ? "Route name already exists" : error.message);
    return saved;
  });

export const deleteRoute = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ projectId: z.string().uuid(), id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertProjectRole(context, data.projectId, "owner");
    const { error } = await db(context).from("edge_ai_routes").delete().eq("id", data.id).eq("project_id", data.projectId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const invokeRoute = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    projectId: z.string().uuid(),
    routeId: z.string().uuid(),
    inputTokens: z.number().int().min(0).max(2_000_000).default(500),
    outputTokens: z.number().int().min(0).max(2_000_000).default(250),
    simulateError: z.boolean().default(false),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertProjectRole(context, data.projectId, "editor");
    await enforceRateLimit(context, "invoke", 240);
    const { data: route } = await db(context).from("edge_ai_routes")
      .select("*").eq("id", data.routeId).eq("project_id", data.projectId).single();
    if (!route) throw new Error("Route not found");
    const { data: models } = await db(context).from("edge_ai_models")
      .select("*").eq("project_id", data.projectId);

    const seed = Math.floor(Math.random() * 1000);
    const { model, reason, ordered } = selectModel(route as RouteRow, (models ?? []) as ModelRow[], seed);

    if (!model) {
      await db(context).from("edge_ai_invocations").insert({
        project_id: data.projectId, route_id: data.routeId, capability: route.capability,
        outcome: "error", error_message: reason,
      });
      throw new Error(reason);
    }

    let chosen = model;
    let outcome: "success" | "fallback" | "error" | "timeout" = "success";
    let latency = chosen.avg_latency_ms + Math.floor(Math.random() * 80) - 40;
    if (data.simulateError) {
      const next = ordered[1];
      if (next) { chosen = next; outcome = "fallback"; latency = next.avg_latency_ms + 40; }
      else outcome = "error";
    }
    const cost = estimateCost(chosen, data.inputTokens, data.outputTokens);

    const { data: inv, error } = await db(context).from("edge_ai_invocations").insert({
      project_id: data.projectId, route_id: data.routeId, model_id: chosen.id,
      capability: route.capability, input_tokens: data.inputTokens, output_tokens: data.outputTokens,
      latency_ms: Math.max(1, latency), cost, outcome,
      error_message: outcome === "error" ? "Simulated failure" : null,
    }).select("*").single();
    if (error) throw new Error(error.message);
    return { invocation: inv, chosen, reason };
  });

export const invocationStats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ projectId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertProjectRole(context, data.projectId, "viewer");
    const since = new Date(Date.now() - 30 * 86400_000).toISOString();
    const { data: rows } = await db(context).from("edge_ai_invocations")
      .select("*").eq("project_id", data.projectId).gte("created_at", since).order("created_at", { ascending: false }).limit(500);
    const list = (rows ?? []) as any[];
    const total = list.length;
    const success = list.filter((r) => r.outcome === "success").length;
    const fallback = list.filter((r) => r.outcome === "fallback").length;
    const errors = list.filter((r) => r.outcome === "error" || r.outcome === "timeout").length;
    const avgLatency = total ? Math.round(list.reduce((s, r) => s + r.latency_ms, 0) / total) : 0;
    const totalCost = Number(list.reduce((s, r) => s + Number(r.cost ?? 0), 0).toFixed(4));
    return { total, success, fallback, errors, avgLatency, totalCost, recent: list.slice(0, 20) };
  });
