// Phase-2 P2: Visual mobile layout editor. Screens are stored as a JSON
// node tree; `generateScreenComponent` materializes the tree into a real
// React component file inside the project so it deploys with everything else.

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export type NodeKind =
  | "Header" | "Text" | "Button" | "Image" | "Input"
  | "List" | "Card" | "Spacer" | "Icon";

export interface ScreenNode {
  id: string;
  kind: NodeKind;
  props: Record<string, string | number | boolean>;
  children?: ScreenNode[];
}
export interface ScreenLayout { nodes: ScreenNode[] }

const NodeSchema: z.ZodType<ScreenNode> = z.lazy(() =>
  z.object({
    id: z.string().min(1).max(64),
    kind: z.enum(["Header", "Text", "Button", "Image", "Input", "List", "Card", "Spacer", "Icon"]),
    props: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
    children: z.array(NodeSchema).optional(),
  }),
) as z.ZodType<ScreenNode>;
const LayoutSchema = z.object({ nodes: z.array(NodeSchema).max(200) });


export const listScreens = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { projectId: string }) => z.object({ projectId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("mobile_screens")
      .select("id,name,slug,route,layout,position,updated_at")
      .eq("project_id", data.projectId)
      .order("position", { ascending: true });
    if (error) throw error;
    return { screens: rows ?? [] };
  });

export const upsertScreen = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    projectId: string;
    id?: string;
    name: string;
    slug: string;
    route?: string;
    layout: ScreenLayout;
    position?: number;
  }) =>
    z
      .object({
        projectId: z.string().uuid(),
        id: z.string().uuid().optional(),
        name: z.string().min(1).max(80),
        slug: z.string().regex(/^[a-z0-9][a-z0-9-]{0,40}$/),
        route: z.string().max(120).default("/"),
        layout: LayoutSchema,
        position: z.number().int().min(0).max(1000).default(0),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const payload = {
      project_id: data.projectId,
      name: data.name,
      slug: data.slug,
      route: data.route ?? "/",
      layout: data.layout as never,
      position: data.position,
    };
    if (data.id) {
      const { error } = await context.supabase.from("mobile_screens").update(payload).eq("id", data.id);
      if (error) throw error;
      return { id: data.id };
    }
    const { data: row, error } = await context.supabase
      .from("mobile_screens")
      .insert(payload)
      .select("id")
      .single();
    if (error) throw error;
    return { id: row!.id };
  });

export const deleteScreen = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("mobile_screens").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

// ---------- code generator ----------

function escAttr(v: string | number | boolean): string {
  if (typeof v === "string") return JSON.stringify(v);
  return `{${JSON.stringify(v)}}`;
}

function renderNode(node: ScreenNode, indent = 4): string {
  const pad = " ".repeat(indent);
  const propsStr = Object.entries(node.props ?? {})
    .map(([k, v]) => ` ${k}=${escAttr(v)}`)
    .join("");
  switch (node.kind) {
    case "Header":
      return `${pad}<h1 className="text-2xl font-semibold tracking-tight"${propsStr}>{${JSON.stringify(node.props.text ?? "Untitled")}}</h1>`;
    case "Text":
      return `${pad}<p className="text-sm text-muted-foreground"${propsStr}>{${JSON.stringify(node.props.text ?? "")}}</p>`;
    case "Button":
      return `${pad}<button className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground active:opacity-80"${propsStr}>{${JSON.stringify(node.props.label ?? "Action")}}</button>`;
    case "Image":
      return `${pad}<img className="w-full rounded-lg" src=${JSON.stringify(node.props.src ?? "")} alt=${JSON.stringify(node.props.alt ?? "")} />`;
    case "Input":
      return `${pad}<input className="w-full rounded-md border bg-background px-3 py-2 text-sm" placeholder=${JSON.stringify(node.props.placeholder ?? "")} />`;
    case "Spacer":
      return `${pad}<div style={{ height: ${Number(node.props.size ?? 12)} }} />`;
    case "Icon":
      return `${pad}<span className="text-xl">{${JSON.stringify(node.props.symbol ?? "✦")}}</span>`;
    case "Card": {
      const inner = (node.children ?? []).map((c) => renderNode(c, indent + 2)).join("\n");
      return `${pad}<section className="rounded-2xl border bg-card/40 p-4 shadow-sm">\n${inner}\n${pad}</section>`;
    }
    case "List": {
      const items = Array.isArray(node.props.items) ? (node.props.items as string[]) : [];
      const itemsJson = JSON.stringify(items);
      return `${pad}<ul className="divide-y rounded-2xl border">\n${pad}  {${itemsJson}.map((it, i) => (\n${pad}    <li key={i} className="px-4 py-3 text-sm">{it}</li>\n${pad}  ))}\n${pad}</ul>`;
    }
  }
}

export function renderScreenTSX(opts: { componentName: string; layout: ScreenLayout }): string {
  const body = opts.layout.nodes.map((n) => renderNode(n, 6)).join("\n");
  return `// AUTO-GENERATED by Foundry mobile screen editor. Hand-edits will be overwritten.
import { type FC } from "react";

const ${opts.componentName}: FC = () => {
  return (
    <main className="mx-auto flex max-w-md flex-col gap-3 p-4">
${body}
    </main>
  );
};

export default ${opts.componentName};
`;
}

export const generateScreenComponent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { projectId: string; screenId: string }) =>
    z.object({ projectId: z.string().uuid(), screenId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("mobile_screens")
      .select("name,slug,layout")
      .eq("id", data.screenId)
      .eq("project_id", data.projectId)
      .single();
    if (error || !row) throw error ?? new Error("Screen not found");

    const componentName =
      row.name.replace(/[^a-zA-Z0-9]/g, " ").trim().split(/\s+/).map((w: string) => w[0].toUpperCase() + w.slice(1)).join("") ||
      "Screen";
    const layout = LayoutSchema.parse(row.layout);
    const tsx = renderScreenTSX({ componentName, layout });
    const path = `src/mobile/screens/${row.slug}.tsx`;

    const { error: upErr } = await context.supabase
      .from("project_files")
      .upsert({ project_id: data.projectId, path, content: tsx }, { onConflict: "project_id,path" });
    if (upErr) throw upErr;
    return { path, bytes: tsx.length };
  });
