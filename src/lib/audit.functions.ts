// Append-only audit log for compliance: read/export server fns.
// The server-only `recordAudit` write helper lives in `audit.server.ts` and
// must be loaded via dynamic import inside server-fn handlers.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const ALLOWED_ACTIONS = [
  "secret.reveal", "secret.create", "secret.delete",
  "member.invite", "member.remove", "member.role_change",
  "deployment.publish", "deployment.rollback",
  "domain.add", "domain.verify", "domain.delete",
  "project.delete", "project.transfer",
  "billing.plan_change",
  "agent.proposal.apply",
  "data.export",
] as const;

export type AuditAction = (typeof ALLOWED_ACTIONS)[number];

export const listAuditLog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      projectId: z.string().uuid().optional(),
      orgId: z.string().uuid().optional(),
      action: z.string().optional(),
      days: z.number().int().min(1).max(365).default(30),
      limit: z.number().int().min(1).max(500).default(100),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    if (!data.projectId && !data.orgId) throw new Error("projectId or orgId required");
    const from = new Date(Date.now() - data.days * 86400_000).toISOString();
    let q = context.supabase
      .from("audit_log")
      .select("id, action, resource_type, resource_id, actor_id, ip, user_agent, metadata, created_at, project_id, org_id")
      .gte("created_at", from)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.projectId) q = q.eq("project_id", data.projectId);
    if (data.orgId) q = q.eq("org_id", data.orgId);
    if (data.action) q = q.eq("action", data.action);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    const entries = (rows ?? []).map((r: any) => ({ ...r, ip: r.ip == null ? null : String(r.ip) }));
    return { entries };
  });


export const exportAuditLog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      projectId: z.string().uuid().optional(),
      orgId: z.string().uuid().optional(),
      days: z.number().int().min(1).max(365).default(90),
      format: z.enum(["csv", "json"]).default("csv"),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    if (!data.projectId && !data.orgId) throw new Error("projectId or orgId required");

    // Rate-limit exports (data egress).
    const rl = await context.supabase.rpc("check_rate_limit", {
      _user_id: context.userId, _bucket: "audit_export", _window: "1 day", _max: 10,
    });
    if (rl.data === false) throw new Error("Daily export limit reached.");

    const from = new Date(Date.now() - data.days * 86400_000).toISOString();
    let q = context.supabase
      .from("audit_log")
      .select("*")
      .gte("created_at", from)
      .order("created_at", { ascending: false })
      .limit(50_000);
    if (data.projectId) q = q.eq("project_id", data.projectId);
    if (data.orgId) q = q.eq("org_id", data.orgId);

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    // Self-audit the export
    await recordAudit(context.supabase, context.userId, {
      action: "data.export",
      resourceType: "audit_log",
      projectId: data.projectId ?? null,
      orgId: data.orgId ?? null,
      metadata: { format: data.format, count: rows?.length ?? 0, days: data.days },
    });

    if (data.format === "json") {
      return { mime: "application/json", filename: `audit-${Date.now()}.json`, body: JSON.stringify(rows ?? [], null, 2) };
    }

    // CSV
    const cols = ["created_at","action","resource_type","resource_id","actor_id","project_id","org_id","ip","user_agent","metadata"];
    const escape = (v: unknown) => {
      const s = v == null ? "" : typeof v === "string" ? v : JSON.stringify(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv = [cols.join(",")]
      .concat((rows ?? []).map((r: any) => cols.map((c) => escape(r[c])).join(",")))
      .join("\n");
    return { mime: "text/csv", filename: `audit-${Date.now()}.csv`, body: csv };
  });
