import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const Category = z.enum(["style", "a11y", "data", "layout", "event"]);
const PropType = z.enum(["string", "number", "boolean", "color", "json"]);

export const listNodeProps = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ nodeId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: props, error } = await context.supabase
      .from("node_inspector_props")
      .select("*")
      .eq("node_id", data.nodeId)
      .order("category", { ascending: true })
      .order("prop_key", { ascending: true });
    if (error) throw new Error(error.message);
    return { props: props ?? [] };
  });

const upsertSchema = z.object({
  projectId: z.string().uuid(),
  nodeId: z.string().uuid(),
  category: Category,
  propKey: z.string().min(1).max(80).regex(/^[a-zA-Z][\w-]*$/),
  propType: PropType,
  propValue: z.any(),
});

export const upsertNodeProp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => upsertSchema.parse(d))
  .handler(async ({ data, context }) => {
    // Validate type/value coherence
    const v = data.propValue;
    if (data.propType === "number" && typeof v !== "number") throw new Error("Expected number");
    if (data.propType === "boolean" && typeof v !== "boolean") throw new Error("Expected boolean");
    if (data.propType === "string" && typeof v !== "string") throw new Error("Expected string");
    if (data.propType === "color" && !(typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v))) {
      throw new Error("Expected #RRGGBB color");
    }
    const row = {
      node_id: data.nodeId,
      project_id: data.projectId,
      category: data.category,
      prop_key: data.propKey,
      prop_type: data.propType,
      prop_value: v as never,
    };
    const { data: out, error } = await context.supabase
      .from("node_inspector_props")
      .upsert(row as never, { onConflict: "node_id,category,prop_key" })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return out;
  });

export const deleteNodeProp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("node_inspector_props").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
