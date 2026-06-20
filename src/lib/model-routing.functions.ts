import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { DEFAULT_ROUTE, MODEL_CATALOG, pickModelFromCatalog, type TaskKind, type QualityTier } from "./models.catalog";

const TASK_KINDS = ["chat", "code", "reasoning", "cheap", "vision", "embedding"] as const;
const QUALITY = ["low", "balanced", "high"] as const;

const RouteInput = z.object({
  projectId: z.string().uuid(),
  taskKind: z.enum(TASK_KINDS),
  preferredModel: z.string().min(2),
  fallbackModels: z.array(z.string().min(2)).max(5).default([]),
  maxCostUsd: z.number().min(0).max(100),
  qualityTier: z.enum(QUALITY),
  enabled: z.boolean().default(true),
});

export const listModelRoutes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { projectId: string }) => d)
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("model_routes").select("*").eq("project_id", data.projectId);
    if (error) throw new Error(error.message);
    return { routes: rows ?? [], catalog: MODEL_CATALOG, defaults: DEFAULT_ROUTE };
  });

export const upsertModelRoute = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.infer<typeof RouteInput>) => RouteInput.parse(d))
  .handler(async ({ data, context }) => {
    const known = new Set(MODEL_CATALOG.map((m) => m.id));
    if (!known.has(data.preferredModel)) throw new Error(`Unknown model: ${data.preferredModel}`);
    for (const f of data.fallbackModels) {
      if (!known.has(f)) throw new Error(`Unknown fallback model: ${f}`);
    }
    const { error } = await context.supabase
      .from("model_routes")
      .upsert(
        {
          project_id: data.projectId,
          task_kind: data.taskKind,
          preferred_model: data.preferredModel,
          fallback_models: data.fallbackModels,
          max_cost_usd: data.maxCostUsd,
          quality_tier: data.qualityTier,
          enabled: data.enabled,
        },
        { onConflict: "project_id,task_kind" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteModelRoute = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("model_routes").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Resolve the effective model for a (project, taskKind). Honors per-project
 * configured route, then catalog defaults, then auto-picks the cheapest model
 * that satisfies the quality tier. Returns a complete fallback chain.
 */
export const resolveModelForTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { projectId: string; taskKind: TaskKind }) => d)
  .handler(async ({ data, context }) => {
    const { data: route } = await context.supabase
      .from("model_routes")
      .select("*")
      .eq("project_id", data.projectId)
      .eq("task_kind", data.taskKind)
      .maybeSingle();

    if (route?.enabled) {
      const chain = [route.preferred_model, ...(route.fallback_models ?? [])];
      return { chosen: route.preferred_model, chain, source: "route" as const, qualityTier: route.quality_tier as QualityTier };
    }

    const auto = pickModelFromCatalog({ kind: data.taskKind, minQuality: "balanced" });
    const chosen = auto?.id ?? DEFAULT_ROUTE[data.taskKind];
    return { chosen, chain: [chosen], source: "auto" as const, qualityTier: (auto?.quality ?? "balanced") as QualityTier };
  });
