// A8 — Accessibility & 2D fallback: keyboard-navigable semantic tree of the spatial scene.
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listSpatialNodes } from "@/lib/spatial-scene.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Accessibility, Keyboard, Eye, EyeOff } from "lucide-react";

type Node = {
  id: string; kind: string; label: string; file_path: string | null;
  pos_x: number; pos_y: number; pos_z: number; scale: number; color: string;
};

const STORAGE_KEY = "foundry:flatMode";

export function AccessibilityPanel({ projectId }: { projectId: string }) {
  const list = useServerFn(listSpatialNodes);
  const [focus, setFocus] = useState(0);
  const [flat, setFlat] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEY, flat ? "1" : "0");
    document.documentElement.dataset.flatMode = flat ? "1" : "0";
  }, [flat]);

  const q = useQuery({
    queryKey: ["spatial-nodes-a11y", projectId],
    queryFn: async () => {
      const r = (await list({ data: { projectId } })) as { nodes: Node[] };
      return r.nodes ?? [];
    },
  });

  const items = useMemo(() => (q.data ?? []).slice().sort((a, b) => a.label.localeCompare(b.label)), [q.data]);

  function onKey(e: React.KeyboardEvent<HTMLUListElement>) {
    if (items.length === 0) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setFocus((f) => Math.min(items.length - 1, f + 1)); }
    if (e.key === "ArrowUp")   { e.preventDefault(); setFocus((f) => Math.max(0, f - 1)); }
    if (e.key === "Home")      { e.preventDefault(); setFocus(0); }
    if (e.key === "End")       { e.preventDefault(); setFocus(items.length - 1); }
    if (e.key === "Enter") {
      const n = items[focus];
      if (!n) return;
      window.dispatchEvent(new CustomEvent("spatial:focus-node", { detail: { id: n.id } }));
    }
  }

  return (
    <Card className="border-border/60">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Accessibility className="size-4" /> Accessibility & Fallback
          <Badge variant="secondary" className="ml-2">{items.length} nodes</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <Keyboard className="size-3.5" />
          <span>↑/↓ to move focus, Enter to ping node, Home/End for ends.</span>
        </div>

        <div className="flex items-center justify-between rounded-md border border-border p-3">
          <div>
            <p className="text-sm font-medium">Flat (2D) editor mode</p>
            <p className="text-xs text-muted-foreground">Forces all 3D panels to render their semantic DOM fallback. Persists per device.</p>
          </div>
          <Button size="sm" variant={flat ? "default" : "outline"} onClick={() => setFlat((v) => !v)}>
            {flat ? <Eye className="size-3.5 mr-1" /> : <EyeOff className="size-3.5 mr-1" />}
            {flat ? "Flat ON" : "Flat OFF"}
          </Button>
        </div>

        <ul
          tabIndex={0}
          role="listbox"
          aria-label="Scene nodes"
          onKeyDown={onKey}
          className="max-h-[280px] overflow-auto rounded-md border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary"
        >
          {items.length === 0 ? (
            <li className="p-3 text-xs text-muted-foreground">No spatial nodes yet. Seed the scene from the Spatial Scene panel.</li>
          ) : null}
          {items.map((n, i) => (
            <li
              key={n.id}
              role="option"
              aria-selected={i === focus}
              tabIndex={-1}
              onClick={() => setFocus(i)}
              className={`flex items-center gap-2 px-3 py-2 text-sm border-l-2 ${
                i === focus ? "bg-muted border-primary" : "border-transparent"
              }`}
            >
              <span className="inline-block size-2.5 rounded-full" style={{ background: n.color }} aria-hidden />
              <span className="font-medium truncate">{n.label}</span>
              <span className="text-[11px] text-muted-foreground truncate">{n.kind}</span>
              <span className="ml-auto text-[11px] tabular-nums text-muted-foreground">
                x{n.pos_x.toFixed(1)} y{n.pos_y.toFixed(1)} z{n.pos_z.toFixed(1)}
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
