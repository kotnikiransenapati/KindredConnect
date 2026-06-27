import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  listPaletteBlocks,
  seedDefaultBlocks,
  createPaletteBlock,
  deletePaletteBlock,
  instantiateBlock,
} from "@/lib/palette.functions";
import { Sparkles, Plus, Trash2, Package } from "lucide-react";

export function ComponentPalettePanel({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const fetchBlocks = useServerFn(listPaletteBlocks);
  const seedFn = useServerFn(seedDefaultBlocks);
  const createFn = useServerFn(createPaletteBlock);
  const deleteFn = useServerFn(deletePaletteBlock);
  const instFn = useServerFn(instantiateBlock);

  const q = useQuery({
    queryKey: ["palette-blocks", projectId],
    queryFn: () => fetchBlocks({ data: { projectId } }),
  });

  const [name, setName] = useState("");
  const [category, setCategory] = useState("layout");

  const seed = useMutation({
    mutationFn: () => seedFn({ data: { projectId } }),
    onSuccess: (r) => { toast.success(`Seeded ${r.inserted} blocks`); qc.invalidateQueries({ queryKey: ["palette-blocks", projectId] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const create = useMutation({
    mutationFn: () => createFn({ data: { projectId, name, category, icon: "Box", color: "#6366f1" } }),
    onSuccess: () => { setName(""); toast.success("Block added"); qc.invalidateQueries({ queryKey: ["palette-blocks", projectId] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const del = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { projectId, id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["palette-blocks", projectId] }),
    onError: (e: Error) => toast.error(e.message),
  });
  const inst = useMutation({
    mutationFn: (id: string) => instFn({ data: { projectId, blockId: id, position: { x: (Math.random() - 0.5) * 6, y: 1, z: (Math.random() - 0.5) * 6 } } }),
    onSuccess: () => { toast.success("Instantiated into scene"); qc.invalidateQueries({ queryKey: ["spatial-scene", projectId] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const blocks = q.data?.blocks ?? [];
  const byCat = blocks.reduce<Record<string, typeof blocks>>((acc, b) => {
    (acc[b.category] ||= []).push(b);
    return acc;
  }, {});

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Package className="h-4 w-4" /> Component Palette</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => seed.mutate()} disabled={seed.isPending}>
            <Sparkles className="mr-1.5 h-3.5 w-3.5" /> Seed defaults
          </Button>
          <Input className="h-8 max-w-[200px]" placeholder="New block name" value={name} onChange={(e) => setName(e.target.value)} />
          <Input className="h-8 max-w-[120px]" placeholder="category" value={category} onChange={(e) => setCategory(e.target.value)} />
          <Button size="sm" onClick={() => create.mutate()} disabled={!name || create.isPending}>
            <Plus className="mr-1.5 h-3.5 w-3.5" /> Add
          </Button>
        </div>
        {Object.entries(byCat).map(([cat, items]) => (
          <div key={cat} className="space-y-2">
            <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{cat}</div>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
              {items.map((b) => (
                <div key={b.id} className="group relative rounded-lg border border-border/60 bg-card/40 p-3 transition hover:border-primary/40 hover:bg-card/60">
                  <div className="mb-2 h-12 w-full rounded-md" style={{ background: `linear-gradient(135deg, ${b.thumbnail_color}, ${b.thumbnail_color}40)` }} />
                  <div className="text-sm font-medium">{b.name}</div>
                  {b.description && <div className="line-clamp-2 text-xs text-muted-foreground">{b.description}</div>}
                  <div className="mt-2 flex items-center justify-between">
                    <Badge variant="secondary" className="text-[10px]">{b.icon}</Badge>
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => inst.mutate(b.id)}>Drop</Button>
                      <Button size="sm" variant="ghost" className="h-7 px-2 text-destructive" onClick={() => del.mutate(b.id)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
        {blocks.length === 0 && (
          <div className="rounded-lg border border-dashed border-border/60 p-6 text-center text-sm text-muted-foreground">
            No blocks yet — seed defaults to populate the palette.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
