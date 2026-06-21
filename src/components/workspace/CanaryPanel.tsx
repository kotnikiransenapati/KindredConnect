import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  listRollouts, createRollout, startRollout, recordMetric,
  evaluateRollout, transitionRollout, rolloutEvents, rolloutMetrics,
} from "@/lib/canary.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Rocket, Play, Pause, Undo2, CheckCircle2, AlertTriangle, Gauge, Activity, XCircle } from "lucide-react";
import { toast } from "sonner";

const STATUS_COLOR: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  draft: "outline", active: "default", paused: "secondary",
  promoting: "secondary", promoted: "default",
  rolled_back: "destructive", aborted: "destructive",
};

const DECISION_ICON: Record<string, any> = {
  advance: CheckCircle2, hold: Activity, rollback: Undo2, complete: Rocket, stale: AlertTriangle,
};

export function CanaryPanel({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const _list = useServerFn(listRollouts);
  const _create = useServerFn(createRollout);
  const _start = useServerFn(startRollout);
  const _rec = useServerFn(recordMetric);
  const _eval = useServerFn(evaluateRollout);
  const _trans = useServerFn(transitionRollout);
  const _events = useServerFn(rolloutEvents);
  const _metrics = useServerFn(rolloutMetrics);

  const rollsQ = useQuery({ queryKey: ["canary", projectId], queryFn: () => _list({ data: { projectId } }), refetchInterval: 15000 });

  const [name, setName] = useState("");
  const [artifact, setArtifact] = useState("");
  const [baseline, setBaseline] = useState("");
  const [stagesText, setStagesText] = useState("5:15, 25:30, 50:30, 100:0");
  const [crashBudget, setCrashBudget] = useState(5000);
  const [errorBudget, setErrorBudget] = useState(20000);

  function parseStages(s: string) {
    return s.split(",").map((p) => {
      const [pct, hold] = p.trim().split(":");
      return { percent: Math.max(1, Math.min(100, Number(pct) || 0)), hold_minutes: Math.max(0, Number(hold) || 0) };
    }).filter((v) => v.percent > 0);
  }

  const createM = useMutation({
    mutationFn: () => _create({ data: {
      projectId, name, artifactRef: artifact, baselineRef: baseline || undefined,
      stages: parseStages(stagesText), crashBudgetPpm: crashBudget, errorBudgetPpm: errorBudget,
    }}),
    onSuccess: () => { toast.success("Rollout created"); qc.invalidateQueries({ queryKey: ["canary", projectId] }); setName(""); setArtifact(""); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Card className="mt-4">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2"><Rocket className="h-4 w-4" /> Canary rollouts</CardTitle>
        <Badge variant="outline" className="text-xs">{rollsQ.data?.length ?? 0} total</Badge>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="list">
          <TabsList>
            <TabsTrigger value="list">Rollouts</TabsTrigger>
            <TabsTrigger value="new">New</TabsTrigger>
          </TabsList>

          <TabsContent value="list" className="space-y-3">
            {(rollsQ.data ?? []).map((r: any) => (
              <RolloutRow key={r.id} ro={r} projectId={projectId}
                onStart={() => _start({ data: { id: r.id, projectId } }).then(() => qc.invalidateQueries({ queryKey: ["canary", projectId] }))}
                onEval={(apply: boolean) => _eval({ data: { id: r.id, projectId, apply } })}
                onTrans={(s: string) => _trans({ data: { id: r.id, projectId, status: s as any } }).then(() => qc.invalidateQueries({ queryKey: ["canary", projectId] }))}
                fetchEvents={() => _events({ data: { rolloutId: r.id } })}
                fetchMetrics={() => _metrics({ data: { rolloutId: r.id } })}
                recMetric={(v: any) => _rec({ data: { rolloutId: r.id, projectId, ...v } })}
                invalidate={() => qc.invalidateQueries({ queryKey: ["canary", projectId] })}
              />
            ))}
            {!rollsQ.data?.length && <div className="text-xs text-muted-foreground">No rollouts.</div>}
          </TabsContent>

          <TabsContent value="new" className="space-y-2">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              <div><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="v1.4.0 → prod" /></div>
              <div><Label>Artifact ref</Label><Input value={artifact} onChange={(e) => setArtifact(e.target.value)} placeholder="build:abc123" /></div>
              <div><Label>Baseline (optional)</Label><Input value={baseline} onChange={(e) => setBaseline(e.target.value)} placeholder="build:prev" /></div>
              <div className="md:col-span-3"><Label>Stages (<code>percent:hold_min</code>, comma)</Label><Input value={stagesText} onChange={(e) => setStagesText(e.target.value)} /></div>
              <div><Label>Crash budget (PPM)</Label><Input type="number" value={crashBudget} onChange={(e) => setCrashBudget(Number(e.target.value))} /></div>
              <div><Label>Error budget (PPM)</Label><Input type="number" value={errorBudget} onChange={(e) => setErrorBudget(Number(e.target.value))} /></div>
            </div>
            <Button disabled={!name || !artifact || createM.isPending} onClick={() => createM.mutate()}>
              <Rocket className="h-4 w-4 mr-1" />Create rollout
            </Button>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

function RolloutRow({ ro, projectId, onStart, onEval, onTrans, fetchEvents, fetchMetrics, recMetric, invalidate }: any) {
  const stages = (ro.stages ?? []) as Array<{ percent: number; hold_minutes: number }>;
  const cur = stages[ro.current_stage];
  const [decision, setDecision] = useState<any>(null);
  const [open, setOpen] = useState(false);
  const evQ = useQuery({ queryKey: ["canary-ev", ro.id, open], queryFn: fetchEvents, enabled: open });
  const mQ = useQuery({ queryKey: ["canary-m", ro.id, open], queryFn: fetchMetrics, enabled: open });

  const [s, setS] = useState(100);
  const [c, setC] = useState(0);
  const [er, setEr] = useState(0);
  const DecIcon = decision ? DECISION_ICON[decision.decision] ?? Activity : null;

  return (
    <div className="border rounded p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div>
          <div className="font-mono text-sm">{ro.name} <Badge variant={STATUS_COLOR[ro.status] ?? "outline"}>{ro.status}</Badge></div>
          <div className="text-xs text-muted-foreground">artifact: {ro.artifact_ref} · stage {ro.current_stage + 1}/{stages.length} {cur ? `· ${cur.percent}% (hold ${cur.hold_minutes}m)` : ""}</div>
        </div>
        <div className="flex gap-1">
          {ro.status === "draft" && <Button size="sm" onClick={onStart}><Play className="h-3 w-3 mr-1" />Start</Button>}
          {ro.status === "active" && <Button size="sm" variant="secondary" onClick={() => onTrans("paused")}><Pause className="h-3 w-3 mr-1" />Pause</Button>}
          {ro.status === "paused" && <Button size="sm" onClick={() => onTrans("active")}><Play className="h-3 w-3 mr-1" />Resume</Button>}
          {(ro.status === "active" || ro.status === "paused") && <Button size="sm" variant="destructive" onClick={() => onTrans("rolled_back")}><Undo2 className="h-3 w-3 mr-1" />Rollback</Button>}
          {!["promoted", "rolled_back", "aborted"].includes(ro.status) && <Button size="sm" variant="ghost" onClick={() => onTrans("aborted")}><XCircle className="h-3 w-3" /></Button>}
          <Button size="sm" variant="outline" onClick={() => setOpen((o) => !o)}>{open ? "Hide" : "Details"}</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-2 items-end">
        <div><Label className="text-xs">sessions</Label><Input type="number" value={s} onChange={(e) => setS(Number(e.target.value))} /></div>
        <div><Label className="text-xs">crashes</Label><Input type="number" value={c} onChange={(e) => setC(Number(e.target.value))} /></div>
        <div><Label className="text-xs">errors</Label><Input type="number" value={er} onChange={(e) => setEr(Number(e.target.value))} /></div>
        <Button size="sm" variant="outline" onClick={async () => {
          try { await recMetric({ sessions: s, crashes: c, errors: er }); toast.success("Metric recorded"); invalidate(); }
          catch (e: any) { toast.error(e.message); }
        }}><Gauge className="h-3 w-3 mr-1" />Record</Button>
        <div className="flex gap-1">
          <Button size="sm" variant="secondary" onClick={async () => setDecision(await onEval(false))}>Evaluate</Button>
          <Button size="sm" onClick={async () => { const d = await onEval(true); setDecision(d); invalidate(); }}>Apply</Button>
        </div>
      </div>

      {decision && DecIcon && (
        <div className="text-xs flex items-center gap-2 border rounded p-2 bg-muted/40">
          <DecIcon className="h-3.5 w-3.5" />
          <span className="font-mono">{decision.decision}</span>
          <span className="text-muted-foreground">{decision.reason}</span>
          {decision.ppmCrash != null && <Badge variant="outline">crash {decision.ppmCrash}ppm</Badge>}
          {decision.ppmError != null && <Badge variant="outline">err {decision.ppmError}ppm</Badge>}
        </div>
      )}

      {open && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          <div>
            <div className="font-semibold mb-1">Metrics</div>
            {(mQ.data ?? []).slice(0, 20).map((m: any) => (
              <div key={m.id} className="border-b py-1 grid grid-cols-4 gap-1">
                <span>stage {m.stage}</span>
                <span>s={m.sessions}</span>
                <span>c={m.crashes}</span>
                <span>e={m.errors}</span>
              </div>
            ))}
            {!mQ.data?.length && <div className="text-muted-foreground">No metrics.</div>}
          </div>
          <div>
            <div className="font-semibold mb-1">Events</div>
            {(evQ.data ?? []).map((e: any) => (
              <div key={e.id} className="border-l-2 border-muted pl-2 py-0.5">
                <span className="font-mono">{e.event}</span>
                {e.status && <Badge variant="outline" className="ml-1">{e.status}</Badge>}
                {e.detail && <span className="text-muted-foreground"> — {e.detail}</span>}
              </div>
            ))}
            {!evQ.data?.length && <div className="text-muted-foreground">No events.</div>}
          </div>
        </div>
      )}
    </div>
  );
}
