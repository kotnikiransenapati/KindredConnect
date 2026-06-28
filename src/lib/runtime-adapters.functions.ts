// C1-C2 — Portable auth/database adapter configuration and IR synchronization.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { EMPTY_IR, IrSchema, hashIr, type Ir } from "./ir.shared";
import { RUNTIME_ADAPTER_CATALOG, adapterFor, integrationKindForCategory, recommendedAdapters, type RuntimeAdapterCategory } from "./runtime-adapters.shared";
import { generateRuntimeContractFiles, runtimeContractSummary, type RuntimeContractAdapter } from "./runtime-contract.shared";

const CategorySchema = z.enum(["auth", "database", "storage", "functions", "ai", "payments", "email", "push"]);
const ProjectInput = z.object({ projectId: z.string().uuid() });
const SaveInput = z.object({
  projectId: z.string().uuid(),
  category: CategorySchema,
  provider: z.string().min(1),
  config: z.record(z.string(), z.any()).default({}),
  secretRefs: z.array(z.string()).default([]),
});

async function requireEditor(context: { supabase: any; userId: string }, projectId: string) {
  const { data: allowed } = await context.supabase.rpc("has_project_role", {
    _project_id: projectId,
    _user_id: context.userId,
    _min_role: "editor",
  });
  if (!allowed) throw new Error("Forbidden");
}

export const getRuntimeAdapters = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { projectId: string }) => ProjectInput.parse(d))
  .handler(async ({ data, context }) => {
    const { data: configs, error } = await context.supabase
      .from("runtime_adapter_configs" as never)
      .select("id, category, provider, display_name, status, capabilities, config, secret_refs, score, updated_at")
      .eq("project_id" as never, data.projectId as never)
      .order("category" as never, { ascending: true });
    if (error) throw new Error(error.message);

    const { data: audits } = await context.supabase
      .from("runtime_adapter_audits" as never)
      .select("id, action, summary, created_at, adapter_config_id")
      .eq("project_id" as never, data.projectId as never)
      .order("created_at" as never, { ascending: false })
      .limit(12);

    return {
      catalog: RUNTIME_ADAPTER_CATALOG.filter((adapter) => ["auth", "database", "storage", "functions", "ai"].includes(adapter.category)),
      configs: (configs ?? []) as Array<{ id: string; category: RuntimeAdapterCategory; provider: string; display_name: string; status: string; capabilities: string[]; config: Record<string, any>; secret_refs: string[]; score: number; updated_at: string }>,
      audits: (audits ?? []) as Array<{ id: string; action: string; summary: string; created_at: string; adapter_config_id: string | null }>,
      summary: runtimeContractSummary((configs ?? []) as RuntimeContractAdapter[]),
    };
  });

export const recommendRuntimeAdapters = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { projectId: string; category: RuntimeAdapterCategory }) => z.object({ projectId: z.string().uuid(), category: CategorySchema }).parse(d))
  .handler(async ({ data }) => ({ recommendations: recommendedAdapters(data.category).slice(0, 4) }));

export const saveRuntimeAdapterConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.infer<typeof SaveInput>) => SaveInput.parse(d))
  .handler(async ({ data, context }) => {
    await requireEditor(context, data.projectId);
    const adapter = adapterFor(data.category, data.provider);
    if (!adapter) throw new Error("Unknown adapter provider");
    const { data: existing } = await context.supabase
      .from("runtime_adapter_configs" as never)
      .select("id, provider, config, secret_refs, status")
      .eq("project_id" as never, data.projectId as never)
      .eq("category" as never, data.category as never)
      .maybeSingle();

    const missingSecrets = adapter.requiredSecretRefs.filter((secret) => !data.secretRefs.includes(secret));
    const status = missingSecrets.length > 0 ? "planned" : "configured";
    const score = Math.max(0, adapter.score - missingSecrets.length * 12);
    const { data: saved, error } = await context.supabase
      .from("runtime_adapter_configs" as never)
      .upsert({
        project_id: data.projectId,
        category: data.category,
        provider: data.provider,
        display_name: adapter.displayName,
        status,
        capabilities: adapter.capabilities,
        config: { ...adapter.configDefaults, ...data.config },
        secret_refs: data.secretRefs,
        score,
        created_by: context.userId,
      } as never, { onConflict: "project_id,category" } as never)
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message);

    await context.supabase.from("runtime_adapter_audits" as never).insert({
      project_id: data.projectId,
      adapter_config_id: (saved as { id?: string } | null)?.id ?? (existing as { id?: string } | null)?.id ?? null,
      action: existing ? "adapter.updated" : "adapter.created",
      summary: `${adapter.displayName} selected for ${data.category}`,
      before_state: existing ?? null,
      after_state: { provider: data.provider, status, score },
      actor_id: context.userId,
    } as never);
    return { ok: true, status, score, missingSecrets };
  });

export const checkRuntimeAdapterConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { projectId: string; category: RuntimeAdapterCategory }) => z.object({ projectId: z.string().uuid(), category: CategorySchema }).parse(d))
  .handler(async ({ data, context }) => {
    await requireEditor(context, data.projectId);
    const { data: row } = await context.supabase
      .from("runtime_adapter_configs" as never)
      .select("id, provider, secret_refs")
      .eq("project_id" as never, data.projectId as never)
      .eq("category" as never, data.category as never)
      .maybeSingle();
    if (!row) throw new Error("Adapter not configured");
    const config = row as unknown as { id: string; provider: string; secret_refs: string[] };
    const adapter = adapterFor(data.category, config.provider);
    if (!adapter) throw new Error("Unknown adapter provider");
    const missingSecrets = adapter.requiredSecretRefs.filter((secret) => !config.secret_refs.includes(secret));
    const status = missingSecrets.length > 0 ? "degraded" : "healthy";
    const score = Math.max(0, adapter.score - missingSecrets.length * 15);
    await context.supabase
      .from("runtime_adapter_configs" as never)
      .update({ status, score } as never)
      .eq("id" as never, config.id as never);
    await context.supabase.from("runtime_adapter_audits" as never).insert({
      project_id: data.projectId,
      adapter_config_id: config.id,
      action: "adapter.health_checked",
      summary: missingSecrets.length ? `${adapter.displayName} missing ${missingSecrets.length} secret reference(s)` : `${adapter.displayName} is healthy`,
      after_state: { status, score, missingSecrets },
      actor_id: context.userId,
    } as never);
    return { ok: true, status, score, missingSecrets };
  });

export const applyRuntimeAdaptersToIr = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { projectId: string }) => ProjectInput.parse(d))
  .handler(async ({ data, context }) => {
    await requireEditor(context, data.projectId);
    const { data: configs } = await context.supabase
      .from("runtime_adapter_configs" as never)
      .select("category, provider, config, status")
      .eq("project_id" as never, data.projectId as never)
      .in("category" as never, ["auth", "database", "storage", "functions", "ai"] as never);
    const { data: row } = await context.supabase
      .from("project_ir" as never)
      .select("ir, version")
      .eq("project_id" as never, data.projectId as never)
      .maybeSingle();
    const current = IrSchema.parse((row as unknown as { ir: unknown } | null)?.ir ?? EMPTY_IR);
    const replacedKinds = new Set(["auth", "db", "storage", "functions", "ai"]);
    const nextIntegrations = current.integrations.filter((integration) => !replacedKinds.has(integration.kind));
    for (const config of (configs ?? []) as Array<{ category: RuntimeAdapterCategory; provider: string; config: Record<string, any>; status: string }>) {
      nextIntegrations.push({ kind: integrationKindForCategory(config.category), provider: config.provider, config: { ...config.config, status: config.status } });
    }
    const next: Ir = IrSchema.parse({ ...current, integrations: nextIntegrations });
    const version = ((row as unknown as { version: number } | null)?.version ?? 0) + 1;
    const irHash = hashIr(next);
    await context.supabase.from("project_ir" as never).upsert({
      project_id: data.projectId,
      ir: next,
      ir_hash: irHash,
      version,
      updated_by: context.userId,
    } as never, { onConflict: "project_id" } as never);
    await context.supabase.from("ir_revisions" as never).insert({
      project_id: data.projectId,
      version,
      ir: next,
      ir_hash: irHash,
      source: "manual",
      author_id: context.userId,
      note: "Synced portable runtime adapters into IR",
    } as never);
    return { ok: true, version, ir_hash: irHash, integrations: next.integrations.length };
  });

export const syncRuntimeAdapterContractFiles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { projectId: string }) => ProjectInput.parse(d))
  .handler(async ({ data, context }) => {
    await requireEditor(context, data.projectId);
    const { data: project } = await context.supabase
      .from("projects" as never)
      .select("name")
      .eq("id" as never, data.projectId as never)
      .maybeSingle();
    const { data: configs, error } = await context.supabase
      .from("runtime_adapter_configs" as never)
      .select("category, provider, display_name, status, capabilities, config, secret_refs, score")
      .eq("project_id" as never, data.projectId as never)
      .in("category" as never, ["auth", "database", "storage", "functions", "ai"] as never)
      .order("category" as never, { ascending: true });
    if (error) throw new Error(error.message);
    const rows = (configs ?? []) as RuntimeContractAdapter[];
    const files = generateRuntimeContractFiles((project as { name?: string } | null)?.name ?? "Generated App", rows);
    const upserts = files.map((file) => ({ project_id: data.projectId, path: file.path, content: file.content, language: file.language }));
    if (upserts.length) {
      const { error: writeError } = await context.supabase
        .from("project_files" as never)
        .upsert(upserts as never, { onConflict: "project_id,path" } as never);
      if (writeError) throw new Error(writeError.message);
    }
    const summary = runtimeContractSummary(rows);
    await context.supabase.from("runtime_adapter_audits" as never).insert({
      project_id: data.projectId,
      action: "runtime.contract_synced",
      summary: `Generated ${files.length} @app/runtime contract files; ${summary.missingCategories.length} categories missing`,
      after_state: { files: files.map((file) => file.path), summary },
      actor_id: context.userId,
    } as never);
    return { ok: true, files: files.length, paths: files.map((file) => file.path), summary };
  });