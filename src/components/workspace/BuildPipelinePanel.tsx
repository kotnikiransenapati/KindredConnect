import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  advanceRun, attachArtifact, cancelRun, deletePipeline, listPipelines,
  listRuns, pipelineStats, runDetail, triggerRun, upsertPipeline,
} from "@/lib/build-pipeline.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Boxes, GitBranch, Pause, Play, Rocket, Trash2 } from "lucide-react";

const KINDS = ["apk", "aab", "ipa", "zip", "wasm", "image", "log", "sbom", "source-map", "other"] as const;
const TRIGGERS = ["manual", "push", "schedule", "webhook", "release"] as const;

const statusTone: Record<string, string> = {
  succeeded: "border-emerald-500/40 bg-emerald-500/10 text-emerald-600",
  running: "border-sky-500/40 bg-sky-500/10 text-sky-600",
  queued: "border-amber-500/40 bg-amber-500/10 text-amber-600",
  failed: "bg-destructive text-destructive-foreground",
  cancelled: "bg-muted text-muted-foreground",
  pending: "border-muted bg-muted/60 text-muted-foreground",
  skipped: "border-muted bg-muted/60 text-muted-foreground",
  timed_out: "bg-destructive/80 text-destructive-foreground",
};

export function BuildPipelinePanel({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listPipelines);
  const saveFn = useServerFn(upsertPipeline);
  const delFn = useServerFn(deletePipeline);
  const triggerFn = useServerFn(triggerRun);
  const runsFn = useServerFn(listRuns);
  const detailFn = useServerFn(runDetail);
  const advanceFn = useServerFn(advanceRun);
  const cancelFn = useServerFn(cancelRun);
  const artifactFn = useServerFn(attachArtifact);
  const statsFn = useServerFn(pipelineStats);

  const pipelines = useQuery({ queryKey: ["pipelines", projectId], queryFn: () => listFn({ data: { projectId } }), refetchInterval: 20_000 });
  const runs = useQuery({ queryKey: ["pipeline-runs", projectId], queryFn: () => runsFn({ data: { projectId } }), refetchInterval: 8_000 });
  const stats = useQuery({ queryKey: ["pipeline-stats", projectId], queryFn: () => statsFn({ data: { projectId } }), refetchInterval: 30_000 });

  const [form, setForm] = useState({
    name: "ios-release",
    description: "Build, sign, and ship iOS app",
    trigger: "manual" as typeof TRIGGERS[number],
    scheduleCron: "",
    enabled: true,
    concurrency: 1,
    stagesText: "checkout|Checkout|\nbuild|Build|checkout|2\nsign|Sign|build|2\nupload|Upload to TestFlight|sign|3",
  });

  const parsedStages = useMemo(() => {
    return form.stagesText.split("\n").filter(Boolean).map(line => {
      const [key, name, depends, maxAttempts] = line.split("|").map(s => s.trim());
      return {
        key, name,
        dependsOn: depends ? depends.split(",").map(s => s.trim()).filter(Boolean) : [],
        maxAttempts: maxAttempts ? Number(maxAttempts) : 1,
      };
    });
  }, [form.stagesText]);

  const save = useMutation({
    mutationFn: () => saveFn({ data: {
      projectId, name: form.name, description: form.description, trigger: form.trigger,
      scheduleCron: form.scheduleCron || undefined, enabled: form.enabled,
      concurrency: form.concurrency, stages: parsedStages,
    } }),
    onSuccess: () => { toast.success("Pipeline saved"); qc.invalidateQueries({ queryKey: ["pipelines", projectId] }); },
    onError: (e: any) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: (id: string) => delFn({ data: { id, projectId } }),
    onSuccess: () => { toast.success("Deleted"); qc.invalidateQueries({ queryKey: ["pipelines", projectId] }); },
    onError: (e: any) => toast.error(e.message),
  });
  const trigger = useMutation({
    mutationFn: (id: string) => triggerFn({ data: { pipelineId: id, projectId, trigger: "manual" } }),
    onSuccess: () => { toast.success("Run queued"); qc.invalidateQueries({ queryKey: ["pipeline-runs", projectId] }); },
    onError: (e: any) => toast.error(e.message),
  });
  const advance = useMutation({
    mutationFn: (runId: string) => advanceFn({ data: { runId, projectId } }),
    onSuccess: (r: any) => { toast.success(`Advanced ${r.advanced} stage(s)`); qc.invalidateQueries({ queryKey: ["pipeline-runs", projectId] }); },
    onError: (e: any) => toast.error(e.message),
  });
  const cancel = useMutation({
    mutationFn: (runId: string) => cancelFn({ data: { runId, projectId } }),
    onSuccess: () => { toast.success("Cancelled"); qc.invalidateQueries({ queryKey: ["pipeline-runs", projectId] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const [openRun, setOpenRun] = useState<string>("");
  const detail = useQuery({ enabled: !!openRun, queryKey: ["pipeline-run-detail", openRun], queryFn: () => detailFn({ data: { runId: openRun, projectId } }), refetchInterval: 4_000 });

  const [art, setArt] = useState({ name: "app-release.ipa", kind: "ipa" as typeof KINDS[number], sizeBytes: 18_500_000, storagePath: "/artifacts/ipa/app.ipa", checksum: "sha256:abc", retentionDays: 30 });
  const attachM = useMutation({
    mutationFn: () => artifactFn({ data: { runId: openRun, projectId, ...art } }),
    onSuccess: () => { toast.success("Artifact attached"); qc.invalidateQueries({ queryKey: ["pipeline-run-detail", openRun] }); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Boxes className="h-4 w-4" /> Build Pipeline Orchestrator</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2 sm:grid-cols-4">
          <Kpi label="Runs (30d)" value={String(stats.data?.totalRuns ?? 0)} />
          <Kpi label="Success rate" value={`${stats.data?.successRate ?? 0}%`} />
          <Kpi label="Failed" value={String(stats.data?.failed ?? 0)} />
          <Kpi label="Avg duration" value={`${Math.round((stats.data?.avgDurationMs ?? 0) / 100) / 10}s`} />
        </div>

        <Tabs defaultValue="pipelines">
          <TabsList>
            <TabsTrigger value="pipelines">Pipelines</TabsTrigger>
            <TabsTrigger value="compose">Compose</TabsTrigger>
            <TabsTrigger value="runs">Runs</TabsTrigger>
          </TabsList>

          <TabsContent value="pipelines" className="space-y-2">
            {(pipelines.data ?? []).map((p: any) => (
              <div key={p.id} className="flex items-center gap-2 rounded-md border p-2 text-sm">
                <GitBranch className="h-4 w-4 text-muted-foreground" />
                <div>
                  <div className="font-medium">{p.name}</div>
                  <div className="text-xs text-muted-foreground">{p.description ?? "—"} · {p.trigger} · {(p.stages ?? []).length} stages</div>
                </div>
                <Badge variant={p.enabled ? "default" : "outline"} className="ml-auto">{p.enabled ? "on" : "off"}</Badge>
                <Button size="sm" variant="outline" onClick={() => trigger.mutate(p.id)}><Play className="h-3 w-3" /></Button>
                <Button size="sm" variant="ghost" onClick={() => remove.mutate(p.id)}><Trash2 className="h-3 w-3" /></Button>
              </div>
            ))}
            {!pipelines.data?.length && <div className="text-sm text-muted-foreground">No pipelines yet.</div>}
          </TabsContent>

          <TabsContent value="compose" className="space-y-3">
            <div className="grid gap-2 md:grid-cols-2">
              <div className="space-y-1"><Label>Name</Label><Input value={form.name} onChange={e => setForm(s => ({ ...s, name: e.target.value }))} /></div>
              <div className="space-y-1"><Label>Trigger</Label>
                <Select value={form.trigger} onValueChange={(v: any) => setForm(s => ({ ...s, trigger: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{TRIGGERS.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1 md:col-span-2"><Label>Description</Label><Input value={form.description} onChange={e => setForm(s => ({ ...s, description: e.target.value }))} /></div>
              <div className="space-y-1"><Label>Schedule (cron)</Label><Input value={form.scheduleCron} onChange={e => setForm(s => ({ ...s, scheduleCron: e.target.value }))} placeholder="0 */4 * * *" /></div>
              <div className="space-y-1"><Label>Concurrency</Label><Input type="number" value={form.concurrency} onChange={e => setForm(s => ({ ...s, concurrency: Number(e.target.value) }))} /></div>
              <div className="flex items-center gap-2 md:col-span-2"><Switch checked={form.enabled} onCheckedChange={v => setForm(s => ({ ...s, enabled: v }))} /><Label>Enabled</Label></div>
            </div>
            <div className="space-y-1">
              <Label>Stages (one per line: <code>key|name|depends_csv|maxAttempts</code>)</Label>
              <Textarea rows={6} value={form.stagesText} onChange={e => setForm(s => ({ ...s, stagesText: e.target.value }))} className="font-mono text-xs" />
              <div className="text-xs text-muted-foreground">Parsed: {parsedStages.length} stage(s)</div>
            </div>
            <Button onClick={() => save.mutate()} disabled={save.isPending}><Rocket className="mr-1 h-3 w-3" /> Save pipeline</Button>
          </TabsContent>

          <TabsContent value="runs" className="space-y-2">
            {(runs.data ?? []).map((r: any) => (
              <div key={r.id} className="rounded-md border p-2 text-sm">
                <div className="flex items-center gap-2">
                  <span className="font-medium">#{r.run_number}</span>
                  <span className="text-xs text-muted-foreground">{r.build_pipelines?.name}</span>
                  <Badge variant="outline" className={statusTone[r.status]}>{r.status}</Badge>
                  <span className="ml-auto flex gap-1">
                    <Button size="sm" variant="outline" onClick={() => advance.mutate(r.id)}>Advance</Button>
                    <Button size="sm" variant="ghost" onClick={() => cancel.mutate(r.id)}><Pause className="h-3 w-3" /></Button>
                    <Button size="sm" variant="ghost" onClick={() => setOpenRun(openRun === r.id ? "" : r.id)}>Details</Button>
                  </span>
                </div>
                {openRun === r.id && (
                  <div className="mt-2 space-y-2 rounded-md border-t pt-2">
                    <div className="text-xs text-muted-foreground">Jobs</div>
                    {(detail.data?.jobs ?? []).map((j: any) => (
                      <div key={j.id} className="flex items-center gap-2 text-xs">
                        <Badge variant="outline" className={statusTone[j.status]}>{j.status}</Badge>
                        <span className="font-mono">{j.stage_key}</span>
                        <span>{j.stage_name}</span>
                        <span className="ml-auto text-muted-foreground">attempt {j.attempt}/{j.max_attempts} · {j.duration_ms ?? 0}ms</span>
                      </div>
                    ))}
                    <div className="text-xs text-muted-foreground">Artifacts ({detail.data?.artifacts?.length ?? 0})</div>
                    {(detail.data?.artifacts ?? []).map((a: any) => (
                      <div key={a.id} className="flex gap-2 text-xs">
                        <Badge variant="outline">{a.kind}</Badge>
                        <span className="font-mono">{a.name}</span>
                        <span className="text-muted-foreground">{(a.size_bytes / 1024 / 1024).toFixed(2)} MB</span>
                      </div>
                    ))}
                    <div className="grid gap-2 md:grid-cols-3 rounded-md border p-2">
                      <Input placeholder="name" value={art.name} onChange={e => setArt(s => ({ ...s, name: e.target.value }))} />
                      <Select value={art.kind} onValueChange={(v: any) => setArt(s => ({ ...s, kind: v }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>{KINDS.map(k => <SelectItem key={k} value={k}>{k}</SelectItem>)}</SelectContent>
                      </Select>
                      <Input type="number" placeholder="size bytes" value={art.sizeBytes} onChange={e => setArt(s => ({ ...s, sizeBytes: Number(e.target.value) }))} />
                      <Input placeholder="storage path" value={art.storagePath} onChange={e => setArt(s => ({ ...s, storagePath: e.target.value }))} className="md:col-span-2" />
                      <Button size="sm" onClick={() => attachM.mutate()}>Attach</Button>
                    </div>
                  </div>
                )}
              </div>
            ))}
            {!runs.data?.length && <div className="text-sm text-muted-foreground">No runs yet — trigger a pipeline.</div>}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border p-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  );
}
