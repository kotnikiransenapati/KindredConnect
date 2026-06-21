// P49 — Sandboxed plugin runtime server functions.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { assertProjectRole, enforceRateLimit } from "./_phase22.shared";
import { authorize, isHttpsUrl, sha256Hex, validatePermissions } from "./plugins.server";

const db = (ctx: any) => ctx.supabase as any;
const StatusZ = z.enum(["draft", "approved", "suspended", "revoked"]);

export const listPlugins = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ projectId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertProjectRole(context, data.projectId, "viewer");
    const { data: rows, error } = await db(context).from("plugins")
      .select("*").eq("project_id", data.projectId).order("name");
    if (error) throw new Error(error.message);
    return (rows ?? []) as any[];
  });

export const registerPlugin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    id: z.string().uuid().optional(),
    projectId: z.string().uuid(),
    slug: z.string().min(2).max(60).regex(/^[a-z0-9._-]+$/i),
    name: z.string().min(2).max(120),
    version: z.string().regex(/^\d+\.\d+\.\d+$/).default("0.1.0"),
    publisher: z.string().min(1).max(120).default("self"),
    entryUrl: z.string().url(),
    manifest: z.record(z.string(), z.any()).default({}),
    permissions: z.array(z.string().min(1).max(40)).max(20).default([]),
    status: StatusZ.default("draft"),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertProjectRole(context, data.projectId, "owner");
    await enforceRateLimit(context, "plugin:register", 20);
    if (!isHttpsUrl(data.entryUrl)) throw new Error("Plugin entry URL must use HTTPS");
    const v = validatePermissions(data.permissions);
    if (!v.ok) throw new Error(v.reason);
    const payload: any = {
      project_id: data.projectId, slug: data.slug, name: data.name, version: data.version,
      publisher: data.publisher, entry_url: data.entryUrl, manifest: data.manifest,
      permissions: data.permissions, status: data.status,
    };
    if (data.id) payload.id = data.id;
    const { data: saved, error } = await db(context).from("plugins")
      .upsert(payload, { onConflict: data.id ? "id" : "project_id,slug,version" }).select("*").single();
    if (error) throw new Error(error.code === "23505" ? "Plugin slug+version already exists" : error.message);
    return saved;
  });

export const setPluginStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ projectId: z.string().uuid(), id: z.string().uuid(), status: StatusZ }).parse(d))
  .handler(async ({ data, context }) => {
    await assertProjectRole(context, data.projectId, "owner");
    const { error } = await db(context).from("plugins").update({ status: data.status }).eq("id", data.id).eq("project_id", data.projectId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deletePlugin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ projectId: z.string().uuid(), id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertProjectRole(context, data.projectId, "owner");
    const { error } = await db(context).from("plugins").delete().eq("id", data.id).eq("project_id", data.projectId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listInstallations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ projectId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertProjectRole(context, data.projectId, "viewer");
    const { data: rows, error } = await db(context).from("plugin_installations")
      .select("*, plugin:plugins(*)").eq("project_id", data.projectId).order("installed_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (rows ?? []) as any[];
  });

export const installPlugin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    projectId: z.string().uuid(),
    pluginId: z.string().uuid(),
    grantedPermissions: z.array(z.string()).default([]),
    config: z.record(z.string(), z.any()).default({}),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertProjectRole(context, data.projectId, "editor");
    await enforceRateLimit(context, "plugin:install", 30);
    const { data: plugin } = await db(context).from("plugins").select("*").eq("id", data.pluginId).eq("project_id", data.projectId).single();
    if (!plugin) throw new Error("Plugin not found");
    if (plugin.status === "revoked" || plugin.status === "suspended") throw new Error(`Cannot install ${plugin.status} plugin`);

    const declared = new Set(plugin.permissions ?? []);
    const extra = data.grantedPermissions.filter((p) => !declared.has(p));
    if (extra.length) throw new Error(`Granted permission not declared in manifest: ${extra.join(", ")}`);

    const { data: saved, error } = await db(context).from("plugin_installations").upsert({
      project_id: data.projectId, plugin_id: data.pluginId,
      enabled: true, config: data.config, granted_permissions: data.grantedPermissions,
    }, { onConflict: "project_id,plugin_id" }).select("*").single();
    if (error) throw new Error(error.message);
    return saved;
  });

export const toggleInstallation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ projectId: z.string().uuid(), id: z.string().uuid(), enabled: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertProjectRole(context, data.projectId, "editor");
    const { error } = await db(context).from("plugin_installations")
      .update({ enabled: data.enabled }).eq("id", data.id).eq("project_id", data.projectId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const uninstallPlugin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ projectId: z.string().uuid(), id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertProjectRole(context, data.projectId, "owner");
    const { error } = await db(context).from("plugin_installations").delete().eq("id", data.id).eq("project_id", data.projectId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const invokePlugin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    projectId: z.string().uuid(),
    installationId: z.string().uuid(),
    action: z.string().min(1).max(80),
    input: z.record(z.string(), z.any()).default({}),
    requiredPermissions: z.array(z.string()).default([]),
    simulateOutput: z.record(z.string(), z.any()).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertProjectRole(context, data.projectId, "editor");
    await enforceRateLimit(context, "plugin:invoke", 120);
    const t0 = Date.now();
    const { data: install } = await db(context).from("plugin_installations")
      .select("*, plugin:plugins(*)").eq("id", data.installationId).eq("project_id", data.projectId).single();
    if (!install) throw new Error("Installation not found");
    if (!install.enabled) throw new Error("Plugin disabled");
    if (install.plugin?.status !== "approved") throw new Error(`Plugin is ${install.plugin?.status ?? "unknown"}; only approved plugins may run`);

    const auth = authorize(install.granted_permissions ?? [], data.requiredPermissions);
    const inputHash = await sha256Hex(JSON.stringify(data.input));

    if (!auth.ok) {
      await db(context).from("plugin_invocations").insert({
        project_id: data.projectId, installation_id: data.installationId, action: data.action,
        input_hash: inputHash, duration_ms: Date.now() - t0, outcome: "denied",
        error_message: `Missing permissions: ${auth.missing.join(", ")}`, invoked_by: context.userId,
      });
      throw new Error(`Plugin denied: missing permissions ${auth.missing.join(", ")}`);
    }

    const output = data.simulateOutput ?? { ok: true, action: data.action };
    const outputHash = await sha256Hex(JSON.stringify(output));
    const { data: inv, error } = await db(context).from("plugin_invocations").insert({
      project_id: data.projectId, installation_id: data.installationId, action: data.action,
      input_hash: inputHash, output_hash: outputHash, duration_ms: Date.now() - t0,
      outcome: "success", invoked_by: context.userId,
    }).select("*").single();
    if (error) throw new Error(error.message);
    return { invocation: inv, output, sensitiveUsed: auth.sensitiveUsed };
  });

export const listInvocations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ projectId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertProjectRole(context, data.projectId, "viewer");
    const { data: rows, error } = await db(context).from("plugin_invocations")
      .select("*").eq("project_id", data.projectId).order("created_at", { ascending: false }).limit(50);
    if (error) throw new Error(error.message);
    return (rows ?? []) as any[];
  });
