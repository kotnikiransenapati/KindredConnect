// B4 — Visual page editor: pick a page, add/reorder/edit/remove blocks, live preview.
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getProjectIr } from "@/lib/ir.functions";
import { addPage, addPageBlock, movePageBlock, removePageBlock, updatePageBlock } from "@/lib/page-editor.functions";
import { materializeIr } from "@/lib/ir-materialize.functions";
import { Block, BLOCK_CATALOG, defaultsFor, type BlockKind } from "@/lib/runtime/blocks";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowDown, ArrowUp, Hammer, LayoutTemplate, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

export function PageEditorPanel({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const getIr = useServerFn(getProjectIr);
  const add = useServerFn(addPageBlock);
  const move = useServerFn(movePageBlock);
  const rm = useServerFn(removePageBlock);
  const upd = useServerFn(updatePageBlock);
  const addPg = useServerFn(addPage);
  const materialize = useServerFn(materializeIr);

  const irQ = useQuery({
    queryKey: ["project-ir", projectId],
    queryFn: () => getIr({ data: { projectId } }),
  });

  const pages = irQ.data?.ir.pages ?? [];
  const [route, setRoute] = useState<string>("/");
  const active = useMemo(() => pages.find((p) => p.route === route) ?? pages[0], [pages, route]);
  const activeRoute = active?.route ?? "/";

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["project-ir", projectId] });
    qc.invalidateQueries({ queryKey: ["ir-revs", projectId] });
  };

  const addM = useMutation({ mutationFn: (kind: BlockKind) => add({ data: { projectId, route: activeRoute, kind, props: defaultsFor(kind) } }), onSuccess: invalidate });
  const mvM = useMutation({ mutationFn: (v: { blockId: string; direction: "up" | "down" }) => move({ data: { projectId, route: activeRoute, ...v } }), onSuccess: invalidate });
  const rmM = useMutation({ mutationFn: (blockId: string) => rm({ data: { projectId, route: activeRoute, blockId } }), onSuccess: invalidate });
  const updM = useMutation({ mutationFn: (v: { blockId: string; props: Record<string, unknown> }) => upd({ data: { projectId, route: activeRoute, ...v } }), onSuccess: invalidate });

  const addPageM = useMutation({
    mutationFn: (v: { route: string; title: string }) => addPg({ data: { projectId, ...v } }),
    onSuccess: (r) => { if (r.ok) { toast.success("Page added"); invalidate(); } else { toast.error("Add page failed"); } },
  });

  const matM = useMutation({
    mutationFn: () => materialize({ data: { projectId } }),
    onSuccess: (r) => { toast.success(`Materialized: ${r.written} wrote, ${r.deleted} removed, ${r.unchanged} unchanged`); qc.invalidateQueries({ queryKey: ["project-files", projectId] }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Materialize failed"),
  });

  const [newRoute, setNewRoute] = useState("/about");
  const [newTitle, setNewTitle] = useState("About");

  return (
    <Card className="border-border/60">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <LayoutTemplate className="size-4" /> Page Editor
          <Badge variant="secondary">{pages.length} page{pages.length === 1 ? "" : "s"}</Badge>
          <Button size="sm" variant="outline" className="ml-auto" onClick={() => matM.mutate()} disabled={matM.isPending}>
            <Hammer className="mr-1 size-3.5" /> {matM.isPending ? "Building…" : "Materialize to files"}
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {pages.length === 0 ? (
          <p className="text-xs text-muted-foreground">No pages yet. Run the Planner or add one below.</p>
        ) : (
          <div className="flex items-center gap-2">
            <Select value={activeRoute} onValueChange={setRoute}>
              <SelectTrigger className="h-8 w-[260px] text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {pages.map((p) => <SelectItem key={p.route} value={p.route} className="text-xs">{p.route} — {p.title}</SelectItem>)}
              </SelectContent>
            </Select>
            <span className="text-xs text-muted-foreground">{active?.components.length ?? 0} blocks</span>
          </div>
        )}

        <div className="flex flex-wrap gap-2 rounded-md border border-border/60 bg-card/30 p-2">
          {BLOCK_CATALOG.map((b) => (
            <Button key={b.kind} size="sm" variant="outline" className="h-7 px-2 text-xs" disabled={!active || addM.isPending} onClick={() => addM.mutate(b.kind)}>
              <Plus className="mr-1 size-3" /> {b.label}
            </Button>
          ))}
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          {/* Live preview */}
          <div className="rounded-md border border-border/60 bg-background">
            <div className="border-b border-border/60 px-3 py-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">Preview</div>
            <div className="max-h-[520px] overflow-auto">
              {active?.components.length ? active.components.map((c) => <Block key={c.id} kind={c.type} props={c.props} />) : (
                <p className="p-4 text-xs text-muted-foreground">Empty page. Add a block above.</p>
              )}
            </div>
          </div>

          {/* Block list with inspectors */}
          <div className="space-y-2">
            {active?.components.map((c, idx) => {
              const meta = BLOCK_CATALOG.find((b) => b.kind === c.type as BlockKind);
              return (
                <div key={c.id} className="rounded-md border border-border/60 bg-card/40 p-2 text-xs">
                  <div className="flex items-center gap-1.5">
                    <Badge variant="outline" className="font-mono text-[10px]">{c.type}</Badge>
                    <span className="text-muted-foreground">#{idx + 1}</span>
                    <div className="ml-auto flex items-center gap-1">
                      <Button size="icon" variant="ghost" className="size-6" disabled={idx === 0 || mvM.isPending} onClick={() => mvM.mutate({ blockId: c.id, direction: "up" })}><ArrowUp className="size-3" /></Button>
                      <Button size="icon" variant="ghost" className="size-6" disabled={idx === (active!.components.length - 1) || mvM.isPending} onClick={() => mvM.mutate({ blockId: c.id, direction: "down" })}><ArrowDown className="size-3" /></Button>
                      <Button size="icon" variant="ghost" className="size-6 text-destructive" disabled={rmM.isPending} onClick={() => rmM.mutate(c.id)}><Trash2 className="size-3" /></Button>
                    </div>
                  </div>
                  {meta ? (
                    <div className="mt-2 grid gap-1.5">
                      {meta.schema.map((f) => {
                        const val = c.props[f.key];
                        const display = f.type === "list" ? (Array.isArray(val) ? val.join("\n") : String(val ?? "")) : String(val ?? "");
                        const commit = (raw: string) => {
                          const next = f.type === "list" ? raw.split(/\r?\n/).filter(Boolean)
                                      : f.type === "number" ? Number(raw) : raw;
                          updM.mutate({ blockId: c.id, props: { [f.key]: next } });
                        };
                        return (
                          <label key={f.key} className="grid gap-0.5">
                            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{f.label}</span>
                            {f.type === "textarea" || f.type === "list" ? (
                              <Textarea defaultValue={display} className="min-h-[60px] text-xs" onBlur={(e) => commit(e.target.value)} />
                            ) : (
                              <Input defaultValue={display} type={f.type === "number" ? "number" : "text"} className="h-7 text-xs" onBlur={(e) => commit(e.target.value)} />
                            )}
                          </label>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex items-end gap-2 rounded-md border border-dashed border-border/60 p-2">
          <div className="grid flex-1 gap-1">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">New page route</span>
            <Input value={newRoute} onChange={(e) => setNewRoute(e.target.value)} className="h-7 text-xs" placeholder="/about" />
          </div>
          <div className="grid flex-1 gap-1">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Title</span>
            <Input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} className="h-7 text-xs" />
          </div>
          <Button size="sm" disabled={addPageM.isPending} onClick={() => addPageM.mutate({ route: newRoute, title: newTitle })}>
            <Plus className="mr-1 size-3" /> Add page
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
