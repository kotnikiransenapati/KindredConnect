import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Layers, Plus, Trash2, Save, Wand2, Loader2,
  Type, Heading1, Image as ImageIcon, MousePointerSquare, TextCursorInput, List as ListIcon, Square, ArrowUpDown,
} from "lucide-react";
import { toast } from "sonner";
import {
  listScreens, upsertScreen, deleteScreen, generateScreenComponent,
  type ScreenNode, type ScreenLayout, type NodeKind,
} from "@/lib/mobile-screens.functions";

const PALETTE: { kind: NodeKind; label: string; icon: typeof Type; defaults: Record<string, string | number | boolean> }[] = [
  { kind: "Header", label: "Header", icon: Heading1, defaults: { text: "Welcome" } },
  { kind: "Text", label: "Text", icon: Type, defaults: { text: "Body copy" } },
  { kind: "Button", label: "Button", icon: MousePointerSquare, defaults: { label: "Continue" } },
  { kind: "Image", label: "Image", icon: ImageIcon, defaults: { src: "https://placehold.co/600x300", alt: "" } },
  { kind: "Input", label: "Input", icon: TextCursorInput, defaults: { placeholder: "Type…" } },
  { kind: "List", label: "List", icon: ListIcon, defaults: { items: "Item one,Item two,Item three" as unknown as string } },
  { kind: "Card", label: "Card", icon: Square, defaults: {} },
  { kind: "Spacer", label: "Spacer", icon: ArrowUpDown, defaults: { size: 16 } },
];

function uid() { return Math.random().toString(36).slice(2, 10); }

function newNode(kind: NodeKind, defaults: Record<string, string | number | boolean>): ScreenNode {
  const props = { ...defaults };
  if (kind === "List" && typeof props.items === "string") {
    // store csv as-is; render splits it
  }
  return { id: uid(), kind, props, ...(kind === "Card" ? { children: [] as ScreenNode[] } : {}) };
}

export function MobileScreensPanel({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const list = useServerFn(listScreens);
  const upsert = useServerFn(upsertScreen);
  const del = useServerFn(deleteScreen);
  const gen = useServerFn(generateScreenComponent);

  const q = useQuery({ queryKey: ["mobile-screens", projectId], queryFn: () => list({ data: { projectId } }) });

  const [activeId, setActiveId] = useState<string | null>(null);
  const [name, setName] = useState("Home");
  const [slug, setSlug] = useState("home");
  const [route, setRoute] = useState("/");
  const [nodes, setNodes] = useState<ScreenNode[]>([]);

  // Sync editor state when active screen changes.
  useEffect(() => {
    const s = (q.data?.screens ?? []).find((x) => x.id === activeId);
    if (!s) return;
    setName(s.name);
    setSlug(s.slug);
    setRoute(s.route ?? "/");
    const layout = s.layout as unknown as ScreenLayout;
    setNodes(Array.isArray(layout?.nodes) ? layout.nodes : []);
  }, [activeId, q.data]);

  function add(kind: NodeKind) {
    const def = PALETTE.find((p) => p.kind === kind)!;
    setNodes((prev) => [...prev, newNode(kind, def.defaults)]);
  }
  function update(id: string, prop: string, value: string | number | boolean) {
    setNodes((prev) => prev.map((n) => n.id === id ? { ...n, props: { ...n.props, [prop]: value } } : n));
  }
  function remove(id: string) { setNodes((prev) => prev.filter((n) => n.id !== id)); }
  function move(id: string, dir: -1 | 1) {
    setNodes((prev) => {
      const i = prev.findIndex((n) => n.id === id);
      if (i < 0) return prev;
      const j = i + dir;
      if (j < 0 || j >= prev.length) return prev;
      const copy = prev.slice();
      [copy[i], copy[j]] = [copy[j], copy[i]];
      return copy;
    });
  }

  function newScreen() {
    setActiveId(null);
    setName("New screen"); setSlug(`screen-${Date.now().toString(36).slice(-4)}`);
    setRoute("/"); setNodes([]);
  }

  const saveMut = useMutation({
    mutationFn: () => upsert({ data: {
      projectId, id: activeId ?? undefined,
      name, slug, route,
      layout: { nodes: nodes.map(normalizeForSave) },
      position: (q.data?.screens?.length ?? 0),
    } }),
    onSuccess: ({ id }) => {
      toast.success("Screen saved");
      setActiveId(id);
      qc.invalidateQueries({ queryKey: ["mobile-screens", projectId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const delMut = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => {
      toast.success("Screen deleted");
      if (activeId) newScreen();
      qc.invalidateQueries({ queryKey: ["mobile-screens", projectId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const genMut = useMutation({
    mutationFn: (id: string) => gen({ data: { projectId, screenId: id } }),
    onSuccess: ({ path }) => toast.success(`Generated ${path}`),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="rounded-2xl border border-border/60 bg-card/40 p-4">
      <div className="mb-3 flex items-center gap-2">
        <Layers className="h-4 w-4 text-primary" />
        <h3 className="font-display text-sm font-semibold">Mobile Screens</h3>
        <span className="ml-auto text-xs text-muted-foreground">Visual editor → real .tsx</span>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        {(q.data?.screens ?? []).map((s) => (
          <button
            key={s.id}
            onClick={() => setActiveId(s.id)}
            className={`rounded-md border px-2 py-1 text-xs ${activeId === s.id ? "border-primary/60 bg-primary/10" : "border-border/40 hover:border-border"}`}
          >
            {s.name}
          </button>
        ))}
        <Button size="sm" variant="outline" onClick={newScreen}>
          <Plus className="mr-1 h-3 w-3" /> New
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-[1fr_260px]">
        {/* Editor */}
        <div className="space-y-2">
          <div className="grid grid-cols-3 gap-2">
            <Input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
            <Input placeholder="slug" value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase())} />
            <Input placeholder="/route" value={route} onChange={(e) => setRoute(e.target.value)} />
          </div>

          <div className="flex flex-wrap gap-1 rounded-md border border-border/40 p-1.5">
            {PALETTE.map((p) => {
              const Icon = p.icon;
              return (
                <Button key={p.kind} size="sm" variant="ghost" className="h-7 text-[11px]" onClick={() => add(p.kind)}>
                  <Icon className="mr-1 h-3 w-3" /> {p.label}
                </Button>
              );
            })}
          </div>

          <ul className="grid gap-2">
            {nodes.length === 0 && (
              <li className="rounded-md border border-dashed border-border/40 p-6 text-center text-xs text-muted-foreground">
                Add a component from the palette to start designing.
              </li>
            )}
            {nodes.map((n, i) => (
              <li key={n.id} className="rounded-md border border-border/40 bg-background/30 p-2">
                <div className="mb-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                  <span className="font-mono">{n.kind}</span>
                  <span className="ml-auto flex gap-1">
                    <Button size="sm" variant="ghost" className="h-6 w-6 p-0" disabled={i === 0} onClick={() => move(n.id, -1)}>↑</Button>
                    <Button size="sm" variant="ghost" className="h-6 w-6 p-0" disabled={i === nodes.length - 1} onClick={() => move(n.id, 1)}>↓</Button>
                    <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => remove(n.id)}><Trash2 className="h-3 w-3" /></Button>
                  </span>
                </div>
                <NodePropsEditor node={n} onChange={update} />
              </li>
            ))}
          </ul>

          <div className="flex items-center justify-between gap-2">
            <Button size="sm" disabled={saveMut.isPending} onClick={() => saveMut.mutate()}>
              {saveMut.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />} Save
            </Button>
            <Button
              size="sm" variant="outline"
              disabled={!activeId || genMut.isPending}
              onClick={() => activeId && genMut.mutate(activeId)}
            >
              {genMut.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wand2 className="h-3 w-3" />} Generate .tsx
            </Button>
            {activeId && (
              <Button size="sm" variant="ghost" onClick={() => delMut.mutate(activeId)}>
                <Trash2 className="h-3 w-3" /> Delete
              </Button>
            )}
          </div>
        </div>

        {/* Phone preview */}
        <PhonePreview nodes={nodes} />
      </div>
    </div>
  );
}

function NodePropsEditor({
  node, onChange,
}: { node: ScreenNode; onChange: (id: string, key: string, value: string | number | boolean) => void }) {
  const keys = useMemo(() => Object.keys(node.props), [node]);
  if (keys.length === 0) return <p className="text-[11px] text-muted-foreground">No properties.</p>;
  return (
    <div className="grid gap-1">
      {keys.map((k) => {
        const v = node.props[k];
        return (
          <div key={k} className="grid grid-cols-[80px_1fr] items-center gap-2">
            <label className="text-[10px] font-mono text-muted-foreground">{k}</label>
            <Input
              className="h-7 text-xs"
              type={typeof v === "number" ? "number" : "text"}
              value={String(v ?? "")}
              onChange={(e) => onChange(node.id, k, typeof v === "number" ? Number(e.target.value || 0) : e.target.value)}
            />
          </div>
        );
      })}
    </div>
  );
}

function PhonePreview({ nodes }: { nodes: ScreenNode[] }) {
  return (
    <div className="sticky top-4 self-start rounded-[2rem] border-4 border-border/70 bg-background/70 p-3 shadow-inner">
      <div className="mx-auto mb-1 h-1 w-12 rounded-full bg-border/80" />
      <div className="h-[460px] overflow-auto rounded-[1.4rem] border border-border/40 bg-background p-3 text-foreground">
        <div className="flex flex-col gap-2">
          {nodes.map((n) => <PreviewNode key={n.id} node={n} />)}
          {nodes.length === 0 && <p className="mt-12 text-center text-xs text-muted-foreground">Empty screen</p>}
        </div>
      </div>
    </div>
  );
}

function PreviewNode({ node }: { node: ScreenNode }) {
  const p = node.props;
  switch (node.kind) {
    case "Header": return <h1 className="text-xl font-semibold tracking-tight">{String(p.text ?? "")}</h1>;
    case "Text": return <p className="text-xs text-muted-foreground">{String(p.text ?? "")}</p>;
    case "Button": return <button className="rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground">{String(p.label ?? "")}</button>;
    case "Image": return <img className="w-full rounded-md" src={String(p.src ?? "")} alt={String(p.alt ?? "")} />;
    case "Input": return <input className="w-full rounded-md border bg-background px-2 py-1.5 text-xs" placeholder={String(p.placeholder ?? "")} />;
    case "Spacer": return <div style={{ height: Number(p.size ?? 12) }} />;
    case "Icon": return <span className="text-base">{String(p.symbol ?? "✦")}</span>;
    case "Card": return (
      <section className="rounded-xl border bg-card/60 p-3">
        {(node.children ?? []).map((c) => <PreviewNode key={c.id} node={c} />)}
      </section>
    );
    case "List": {
      const items = String(p.items ?? "").split(",").map((s) => s.trim()).filter(Boolean);
      return (
        <ul className="divide-y rounded-md border">
          {items.map((it, i) => <li key={i} className="px-2 py-1.5 text-xs">{it}</li>)}
        </ul>
      );
    }
  }
}

function normalizeForSave(n: ScreenNode): ScreenNode {
  // Convert the List "items" CSV string into a real array for the codegen.
  if (n.kind === "List" && typeof n.props.items === "string") {
    const arr = (n.props.items as unknown as string).split(",").map((s) => s.trim()).filter(Boolean);
    return { ...n, props: { ...n.props, items: arr as unknown as string } };
  }
  return n.children ? { ...n, children: n.children.map(normalizeForSave) } : n;
}
