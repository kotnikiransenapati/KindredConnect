// B4 — Page editor server fns: mutate components on a single IR page atomically.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { EMPTY_IR, IrSchema, hashIr, lintIr, type Ir, type IrComponent } from "./ir.shared";

const Base = { projectId: z.string().uuid(), route: z.string().min(1) } as const;

async function loadAndSave(ctx: { supabase: any; userId: string }, projectId: string, mutate: (ir: Ir) => Ir, note: string) {
  const { data: allowed } = await ctx.supabase.rpc("has_project_role", {
    _project_id: projectId, _user_id: ctx.userId, _min_role: "editor",
  });
  if (!allowed) throw new Error("Forbidden");

  const { data: row } = await ctx.supabase
    .from("project_ir" as never).select("ir, version")
    .eq("project_id" as never, projectId as never).maybeSingle();
  const current: Ir = IrSchema.parse((row as unknown as { ir: unknown } | null)?.ir ?? EMPTY_IR);
  const next = IrSchema.parse(mutate(current));

  const blocking = lintIr(next).filter((i) => i.severity === "error");
  if (blocking.length > 0) return { ok: false as const, issues: blocking };

  const ir_hash = hashIr(next);
  const nextVersion = ((row as unknown as { version: number } | null)?.version ?? 0) + 1;

  await ctx.supabase.from("project_ir" as never).upsert({
    project_id: projectId, ir: next, ir_hash, version: nextVersion, updated_by: ctx.userId,
  } as never, { onConflict: "project_id" } as never);
  await ctx.supabase.from("ir_revisions" as never).insert({
    project_id: projectId, version: nextVersion, ir: next, ir_hash,
    source: "manual", author_id: ctx.userId, note,
  } as never);

  return { ok: true as const, version: nextVersion, ir_hash };
}

function uid(prefix: string) { return prefix + "-" + Math.random().toString(36).slice(2, 9); }

const AddInput = z.object({ ...Base, kind: z.string().min(1), props: z.record(z.string(), z.any()).default({}), index: z.number().int().nonnegative().optional() });
export const addPageBlock = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.infer<typeof AddInput>) => AddInput.parse(d))
  .handler(async ({ data, context }) => loadAndSave(context, data.projectId, (ir) => {
    const pages = ir.pages.map((p) => {
      if (p.route !== data.route) return p;
      const block: IrComponent = { id: uid("c"), type: data.kind, props: data.props };
      const next = [...p.components];
      if (typeof data.index === "number") next.splice(data.index, 0, block); else next.push(block);
      return { ...p, components: next };
    });
    return { ...ir, pages };
  }, `add ${data.kind} to ${data.route}`));

const RemoveInput = z.object({ ...Base, blockId: z.string().min(1) });
export const removePageBlock = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.infer<typeof RemoveInput>) => RemoveInput.parse(d))
  .handler(async ({ data, context }) => loadAndSave(context, data.projectId, (ir) => ({
    ...ir,
    pages: ir.pages.map((p) => p.route === data.route ? { ...p, components: p.components.filter((c) => c.id !== data.blockId) } : p),
  }), `remove block from ${data.route}`));

const MoveInput = z.object({ ...Base, blockId: z.string().min(1), direction: z.enum(["up", "down"]) });
export const movePageBlock = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.infer<typeof MoveInput>) => MoveInput.parse(d))
  .handler(async ({ data, context }) => loadAndSave(context, data.projectId, (ir) => ({
    ...ir,
    pages: ir.pages.map((p) => {
      if (p.route !== data.route) return p;
      const idx = p.components.findIndex((c) => c.id === data.blockId);
      if (idx < 0) return p;
      const swap = data.direction === "up" ? idx - 1 : idx + 1;
      if (swap < 0 || swap >= p.components.length) return p;
      const next = [...p.components];
      [next[idx], next[swap]] = [next[swap], next[idx]];
      return { ...p, components: next };
    }),
  }), `reorder block on ${data.route}`));

const UpdateInput = z.object({ ...Base, blockId: z.string().min(1), props: z.record(z.string(), z.any()) });
export const updatePageBlock = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.infer<typeof UpdateInput>) => UpdateInput.parse(d))
  .handler(async ({ data, context }) => loadAndSave(context, data.projectId, (ir) => ({
    ...ir,
    pages: ir.pages.map((p) => p.route === data.route
      ? { ...p, components: p.components.map((c) => c.id === data.blockId ? { ...c, props: { ...c.props, ...data.props } } : c) }
      : p),
  }), `edit block on ${data.route}`));

const AddPageInput = z.object({ projectId: z.string().uuid(), route: z.string().regex(/^\/[a-zA-Z0-9/_:.\-$]*$/), title: z.string().min(1) });
export const addPage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.infer<typeof AddPageInput>) => AddPageInput.parse(d))
  .handler(async ({ data, context }) => loadAndSave(context, data.projectId, (ir) => {
    if (ir.pages.some((p) => p.route === data.route)) return ir;
    return { ...ir, pages: [...ir.pages, { route: data.route, title: data.title, description: "", auth: "public" as const, layout: "default" as const, components: [] }] };
  }, `add page ${data.route}`));
