import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Film, Plus, Trash2, Play, Pause, Diamond } from "lucide-react";
import { listSpatialNodes } from "@/lib/spatial-scene.functions";
import {
  listAnimations, createAnimation, toggleAnimation, deleteAnimation,
  upsertKeyframe, deleteKeyframe,
} from "@/lib/animations.functions";
import { sampleTrack } from "@/lib/animations.shared";

const PROPERTIES = [
  "position.x", "position.y", "position.z",
  "rotation.x", "rotation.y", "rotation.z",
  "scale", "opacity", "color",
] as const;
const EASINGS = ["linear", "easeIn", "easeOut", "easeInOut", "spring", "step"] as const;
const LOOPS = ["once", "loop", "pingpong"] as const;

type Kf = { id: string; time_ms: number; value: unknown; easing: string };

export function AnimationTimelinePanel({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const nodesFn = useServerFn(listSpatialNodes);
  const listFn = useServerFn(listAnimations);
  const createFn = useServerFn(createAnimation);
  const toggleFn = useServerFn(toggleAnimation);
  const delFn = useServerFn(deleteAnimation);
  const upKfFn = useServerFn(upsertKeyframe);
  const delKfFn = useServerFn(deleteKeyframe);

  const nodesQ = useQuery({
    queryKey: ["spatial-scene", projectId],
    queryFn: () => nodesFn({ data: { projectId } }),
  });
  const animQ = useQuery({
    queryKey: ["animations", projectId],
    queryFn: () => listFn({ data: { projectId } }),
  });

  const [nodeId, setNodeId] = useState<string>("");
  const [name, setName] = useState("Pulse");
  const [property, setProperty] = useState<typeof PROPERTIES[number]>("scale");
  const [duration, setDuration] = useState(2000);
  const [loopMode, setLoopMode] = useState<typeof LOOPS[number]>("loop");

  const create = useMutation({
    mutationFn: () => createFn({ data: { projectId, nodeId, name, property, durationMs: duration, loopMode } }),
    onSuccess: () => { toast.success("Track created"); qc.invalidateQueries({ queryKey: ["animations", projectId] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const toggle = useMutation({
    mutationFn: (v: { id: string; enabled: boolean }) => toggleFn({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["animations", projectId] }),
  });
  const remove = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["animations", projectId] }),
  });

  const nodes = nodesQ.data?.nodes ?? [];
  const animations = animQ.data?.animations ?? [];
  const activeNode = nodeId || nodes[0]?.id || "";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Film className="h-4 w-4" /> Animation Timeline (3D Z-axis)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-2 rounded-lg border border-border/60 bg-card/40 p-3 md:grid-cols-6">
          <Select value={activeNode} onValueChange={setNodeId}>
            <SelectTrigger className="h-8"><SelectValue placeholder="Target node" /></SelectTrigger>
            <SelectContent>{nodes.map((n) => <SelectItem key={n.id} value={n.id}>{n.label}</SelectItem>)}</SelectContent>
          </Select>
          <Input className="h-8" placeholder="Track name" value={name} onChange={(e) => setName(e.target.value)} />
          <Select value={property} onValueChange={(v) => setProperty(v as typeof PROPERTIES[number])}>
            <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
            <SelectContent>{PROPERTIES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
          </Select>
          <Input className="h-8" type="number" min={50} step={100} value={duration} onChange={(e) => setDuration(Number(e.target.value) || 1000)} />
          <Select value={loopMode} onValueChange={(v) => setLoopMode(v as typeof LOOPS[number])}>
            <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
            <SelectContent>{LOOPS.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}</SelectContent>
          </Select>
          <Button size="sm" onClick={() => create.mutate()} disabled={!activeNode || !name || create.isPending}>
            <Plus className="mr-1.5 h-3.5 w-3.5" /> New
          </Button>
        </div>

        <div className="space-y-3">
          {animations.map((a) => (
            <TrackRow
              key={a.id}
              animation={a as never}
              onToggle={(e) => toggle.mutate({ id: a.id, enabled: e })}
              onDelete={() => remove.mutate(a.id)}
              onAddKey={async (time, value, easing) => {
                await upKfFn({ data: { projectId, animationId: a.id, timeMs: time, value, easing } });
                qc.invalidateQueries({ queryKey: ["animations", projectId] });
              }}
              onDelKey={async (id) => {
                await delKfFn({ data: { id } });
                qc.invalidateQueries({ queryKey: ["animations", projectId] });
              }}
            />
          ))}
          {animations.length === 0 && (
            <div className="rounded-lg border border-dashed border-border/60 p-6 text-center text-sm text-muted-foreground">
              No animation tracks yet. The Z-axis represents time — keyframes are scrubable nodes in 3D space.
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function TrackRow({
  animation, onToggle, onDelete, onAddKey, onDelKey,
}: {
  animation: { id: string; name: string; property: string; duration_ms: number; loop_mode: string; enabled: boolean; node_keyframes: Kf[] };
  onToggle: (e: boolean) => void;
  onDelete: () => void;
  onAddKey: (timeMs: number, value: number, easing: string) => void | Promise<void>;
  onDelKey: (id: string) => void | Promise<void>;
}) {
  const [time, setTime] = useState(0);
  const [value, setValue] = useState(1);
  const [easing, setEasing] = useState<string>("easeInOut");
  const [playing, setPlaying] = useState(false);

  const numericKfs = useMemo<Array<{ time_ms: number; value: number; easing: string }>>(
    () => (animation.node_keyframes ?? [])
      .filter((k) => typeof k.value === "number")
      .map((k) => ({ time_ms: k.time_ms, value: k.value as number, easing: k.easing })),
    [animation.node_keyframes],
  );

  const current = sampleTrack(numericKfs, time);

  return (
    <div className="rounded-lg border border-border/60 bg-card/30 p-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-[10px]">{animation.property}</Badge>
          <span className="text-sm font-medium">{animation.name}</span>
          <Badge variant="secondary" className="text-[10px]">{animation.loop_mode} · {animation.duration_ms}ms</Badge>
        </div>
        <div className="flex items-center gap-2">
          <Switch checked={animation.enabled} onCheckedChange={onToggle} />
          <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setPlaying((p) => !p)}>
            {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
          </Button>
          <Button size="sm" variant="ghost" className="h-7 px-2 text-destructive" onClick={onDelete}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div className="relative h-10 rounded-md border border-border/60 bg-gradient-to-r from-primary/5 via-transparent to-primary/5">
        {(animation.node_keyframes ?? []).map((k) => {
          const left = `${Math.min(100, (k.time_ms / animation.duration_ms) * 100)}%`;
          return (
            <button
              key={k.id}
              className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary p-1 text-primary-foreground shadow hover:scale-110"
              style={{ left }}
              title={`${k.time_ms}ms · ${JSON.stringify(k.value)} · ${k.easing}`}
              onClick={() => onDelKey(k.id)}
            >
              <Diamond className="h-2.5 w-2.5" />
            </button>
          );
        })}
        <div className="absolute top-0 h-full w-px bg-primary" style={{ left: `${(time / animation.duration_ms) * 100}%` }} />
      </div>

      <div className="mt-2">
        <Slider min={0} max={animation.duration_ms} step={10} value={[time]} onValueChange={([v]) => setTime(v)} />
        <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
          <span>t = {time}ms</span>
          <span>sample: {current.toFixed(3)}</span>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-4">
        <Input className="h-8" type="number" placeholder="time ms" value={time} onChange={(e) => setTime(Number(e.target.value) || 0)} />
        <Input className="h-8" type="number" step="0.1" placeholder="value" value={value} onChange={(e) => setValue(Number(e.target.value) || 0)} />
        <Select value={easing} onValueChange={setEasing}>
          <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
          <SelectContent>{EASINGS.map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}</SelectContent>
        </Select>
        <Button size="sm" onClick={() => onAddKey(time, value, easing)}>
          <Diamond className="mr-1.5 h-3.5 w-3.5" /> Add keyframe
        </Button>
      </div>
    </div>
  );
}
