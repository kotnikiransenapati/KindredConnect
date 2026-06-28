import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Sliders, Plus, Trash2, Layers } from "lucide-react";
import { listSpatialNodes } from "@/lib/spatial-scene.functions";
import { listNodeProps, upsertNodeProp, deleteNodeProp } from "@/lib/inspector.functions";

const CATEGORIES = ["style", "a11y", "data", "layout", "event"] as const;
const TYPES = ["string", "number", "boolean", "color", "json"] as const;

export function InspectorHudPanel({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const nodesFn = useServerFn(listSpatialNodes);
  const propsFn = useServerFn(listNodeProps);
  const upsertFn = useServerFn(upsertNodeProp);
  const delFn = useServerFn(deleteNodeProp);

  const nodesQ = useQuery({
    queryKey: ["spatial-scene", projectId],
    queryFn: () => nodesFn({ data: { projectId } }),
  });

  const [nodeId, setNodeId] = useState<string>("");
  const activeId = nodeId || nodesQ.data?.nodes[0]?.id || "";

  const propsQ = useQuery({
    queryKey: ["node-props", activeId],
    queryFn: () => propsFn({ data: { nodeId: activeId } }),
    enabled: !!activeId,
  });

  const [category, setCategory] = useState<typeof CATEGORIES[number]>("style");
  const [propType, setPropType] = useState<typeof TYPES[number]>("string");
  const [propKey, setPropKey] = useState("");
  const [propValue, setPropValue] = useState("");

  const upsert = useMutation({
    mutationFn: () => {
      let v: unknown = propValue;
      if (propType === "number") v = Number(propValue);
      if (propType === "boolean") v = propValue === "true";
      if (propType === "json") { try { v = JSON.parse(propValue); } catch { throw new Error("Invalid JSON"); } }
      return upsertFn({ data: { projectId, nodeId: activeId, category, propKey, propType, propValue: v } });
    },
    onSuccess: () => {
      setPropKey(""); setPropValue("");
      toast.success("Property saved");
      qc.invalidateQueries({ queryKey: ["node-props", activeId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["node-props", activeId] }),
  });

  const nodes = nodesQ.data?.nodes ?? [];
  const props = propsQ.data?.props ?? [];
  const grouped = props.reduce<Record<string, typeof props>>((acc, p) => {
    (acc[p.category] ||= []).push(p);
    return acc;
  }, {});

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Sliders className="h-4 w-4" /> Inspector HUD</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Select value={activeId} onValueChange={setNodeId}>
          <SelectTrigger className="h-8"><SelectValue placeholder="Select a spatial node" /></SelectTrigger>
          <SelectContent>
            {nodes.map((n) => (
              <SelectItem key={n.id} value={n.id}>{n.label} <span className="ml-1 text-xs text-muted-foreground">({n.kind})</span></SelectItem>
            ))}
          </SelectContent>
        </Select>

        {activeId && (
          <>
            <div className="grid grid-cols-2 gap-2 rounded-lg border border-border/60 bg-card/40 p-3 md:grid-cols-5">
              <Select value={category} onValueChange={(v) => setCategory(v as typeof CATEGORIES[number])}>
                <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                <SelectContent>{CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
              <Input className="h-8" placeholder="key" value={propKey} onChange={(e) => setPropKey(e.target.value)} />
              <Select value={propType} onValueChange={(v) => setPropType(v as typeof TYPES[number])}>
                <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                <SelectContent>{TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
              <Input className="h-8" placeholder="value" value={propValue} onChange={(e) => setPropValue(e.target.value)} />
              <Button size="sm" onClick={() => upsert.mutate()} disabled={!propKey || upsert.isPending}>
                <Plus className="mr-1.5 h-3.5 w-3.5" /> Set
              </Button>
            </div>

            {Object.entries(grouped).map(([cat, items]) => (
              <div key={cat} className="space-y-1.5">
                <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  <Layers className="h-3 w-3" /> {cat}
                </div>
                <div className="divide-y divide-border/60 rounded-md border border-border/60">
                  {items.map((p) => (
                    <div key={p.id} className="flex items-center justify-between px-3 py-1.5 text-sm">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs">{p.prop_key}</span>
                        <Badge variant="secondary" className="text-[10px]">{p.prop_type}</Badge>
                      </div>
                      <div className="flex items-center gap-2">
                        <code className="max-w-[200px] truncate text-xs text-muted-foreground">{JSON.stringify(p.prop_value)}</code>
                        <Button size="sm" variant="ghost" className="h-6 px-1.5 text-destructive" onClick={() => del.mutate(p.id)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {props.length === 0 && (
              <div className="rounded-lg border border-dashed border-border/60 p-6 text-center text-sm text-muted-foreground">
                No properties yet. Add style, accessibility, data bindings, or events above.
              </div>
            )}
          </>
        )}
        {nodes.length === 0 && (
          <div className="rounded-lg border border-dashed border-border/60 p-6 text-center text-sm text-muted-foreground">
            No spatial nodes — seed the scene first in the Spatial Scene panel.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
