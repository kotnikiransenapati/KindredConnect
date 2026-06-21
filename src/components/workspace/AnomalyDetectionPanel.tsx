import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  anomalyOverview,
  deleteDetector,
  ingestMetric,
  listDetectors,
  listIncidents,
  runDetections,
  setIncidentState,
  upsertDetector,
} from "@/lib/anomaly-detection.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Activity, AlertTriangle, BrainCircuit, Loader2, Radar, ShieldCheck, Trash2 } from "lucide-react";

const SOURCES = ["analytics", "crashes", "builds", "security", "performance", "custom"] as const;
const SENSITIVITY = ["low", "medium", "high"] as const;
const STATE = ["open", "acknowledged", "resolved", "suppressed"] as const;

const severityTone: Record<string, string> = {
  critical: "bg-destructive text-destructive-foreground",
  high: "border-destructive/40 bg-destructive/10 text-destructive",
  medium: "border-amber-500/40 bg-amber-500/10 text-amber-600",
  low: "border-muted bg-muted text-muted-foreground",
};

export function AnomalyDetectionPanel({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const overviewFn = useServerFn(anomalyOverview);
  const listFn = useServerFn(listDetectors);
  const incidentsFn = useServerFn(listIncidents);
  const saveFn = useServerFn(upsertDetector);
  const deleteFn = useServerFn(deleteDetector);
  const ingestFn = useServerFn(ingestMetric);
  const scanFn = useServerFn(runDetections);
  const stateFn = useServerFn(setIncidentState);

  const overview = useQuery({ queryKey: ["anomaly-overview", projectId], queryFn: () => overviewFn({ data: { projectId } }), refetchInterval: 20_000 });
  const detectors = useQuery({ queryKey: ["anomaly-detectors", projectId], queryFn: () => listFn({ data: { projectId } }), refetchInterval: 20_000 });
  const incidents = useQuery({ queryKey: ["anomaly-incidents", projectId], queryFn: () => incidentsFn({ data: { projectId } }), refetchInterval: 12_000 });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["anomaly-overview", projectId] });
    qc.invalidateQueries({ queryKey: ["anomaly-detectors", projectId] });
    qc.invalidateQueries({ queryKey: ["anomaly-incidents", projectId] });
  };

  const [form, setForm] = useState({
    name: "Error-rate guard",
    metricKey: "errors.rate",
    source: "performance",
    sensitivity: "medium",
    windowMinutes: 60,
    minSamples: 12,
    enabled: true,
    notifyChannels: "slack,oncall",
  });
  const [sim, setSim] = useState({ detectorId: "", value: 100, dimension: "global" });

  const save = useMutation({
    mutationFn: () => saveFn({ data: { ...form, projectId, notifyChannels: form.notifyChannels.split(",") } }),
    onSuccess: () => { toast.success("Detector saved"); invalidate(); },
    onError: (e: any) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id, projectId } }),
    onSuccess: () => { toast.success("Detector deleted"); invalidate(); },
    onError: (e: any) => toast.error(e.message),
  });
  const ingest = useMutation({
    mutationFn: () => ingestFn({ data: { projectId, detectorId: sim.detectorId, value: sim.value, dimension: sim.dimension, context: { source: "manual" } } }),
    onSuccess: (r) => { toast.success(r.incident ? "Anomaly detected" : "Sample ingested"); invalidate(); },
    onError: (e: any) => toast.error(e.message),
  });
  const scan = useMutation({
    mutationFn: () => scanFn({ data: { projectId } }),
    onSuccess: (r) => toast.success(`Checked ${r.checked} detector${r.checked === 1 ? "" : "s"}`),
    onError: (e: any) => toast.error(e.message),
  });
  const triage = useMutation({
    mutationFn: (v: { id: string; state: string }) => stateFn({ data: { id: v.id, projectId, state: v.state as any } }),
    onSuccess: () => { toast.success("Incident updated"); invalidate(); },
    onError: (e: any) => toast.error(e.message),
  });

  const detectorList = detectors.data ?? [];
  const stats = overview.data;

  return (
    <Card className="border-border/50">
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle className="flex items-center gap-2"><BrainCircuit className="size-5 text-primary" /> ML anomaly detection</CardTitle>
        <Button size="sm" variant="outline" disabled={scan.isPending} onClick={() => scan.mutate()}>
          {scan.isPending ? <Loader2 className="mr-1 size-3.5 animate-spin" /> : <Radar className="mr-1 size-3.5" />} Scan
        </Button>
      </CardHeader>
      <CardContent>
        <div className="mb-3 grid grid-cols-2 gap-2 md:grid-cols-6">
          <Kpi label="Detectors" value={stats?.detectors ?? 0} />
          <Kpi label="Enabled" value={stats?.enabled ?? 0} />
          <Kpi label="Samples" value={stats?.samples30d ?? 0} />
          <Kpi label="Incidents" value={stats?.incidents30d ?? 0} />
          <Kpi label="Open" value={stats?.open ?? 0} />
          <Kpi label="Critical" value={stats?.critical ?? 0} danger />
        </div>

        <Tabs defaultValue="detectors">
          <TabsList>
            <TabsTrigger value="detectors"><Activity className="mr-1 size-4" />Detectors</TabsTrigger>
            <TabsTrigger value="simulate"><Radar className="mr-1 size-4" />Simulate</TabsTrigger>
            <TabsTrigger value="incidents"><AlertTriangle className="mr-1 size-4" />Incidents</TabsTrigger>
            <TabsTrigger value="overview"><ShieldCheck className="mr-1 size-4" />Overview</TabsTrigger>
          </TabsList>

          <TabsContent value="detectors" className="mt-3 space-y-3">
            <div className="grid gap-2 rounded-md border p-3 md:grid-cols-4">
              <Field label="Name"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
              <Field label="Metric key"><Input value={form.metricKey} onChange={(e) => setForm({ ...form, metricKey: e.target.value })} /></Field>
              <Field label="Source"><Select value={form.source} onValueChange={(v) => setForm({ ...form, source: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{SOURCES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select></Field>
              <Field label="Sensitivity"><Select value={form.sensitivity} onValueChange={(v) => setForm({ ...form, sensitivity: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{SENSITIVITY.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select></Field>
              <Field label="Window minutes"><Input type="number" value={form.windowMinutes} onChange={(e) => setForm({ ...form, windowMinutes: Number(e.target.value) })} /></Field>
              <Field label="Min samples"><Input type="number" value={form.minSamples} onChange={(e) => setForm({ ...form, minSamples: Number(e.target.value) })} /></Field>
              <Field label="Channels"><Input value={form.notifyChannels} onChange={(e) => setForm({ ...form, notifyChannels: e.target.value })} /></Field>
              <div className="flex items-end gap-2"><Switch checked={form.enabled} onCheckedChange={(enabled) => setForm({ ...form, enabled })} /><Button disabled={save.isPending || !form.name || !form.metricKey} onClick={() => save.mutate()}>Save detector</Button></div>
            </div>

            <div className="space-y-2">
              {detectors.isLoading && <Loader2 className="size-4 animate-spin" />}
              {detectorList.map((d: any) => (
                <div key={d.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2"><span className="font-medium">{d.name}</span><Badge variant="outline">{d.metric_key}</Badge><Badge variant="secondary">{d.source}</Badge><Badge>{d.sensitivity}</Badge>{!d.enabled && <Badge variant="outline">disabled</Badge>}</div>
                    <p className="mt-1 text-xs text-muted-foreground">window {d.window_minutes}m · min {d.min_samples} samples · baseline μ {(Number(d.baseline?.mean ?? 0)).toFixed(1)} / σ {(Number(d.baseline?.stdDev ?? 0)).toFixed(1)}</p>
                  </div>
                  <Button size="icon" variant="ghost" className="size-8" onClick={() => remove.mutate(d.id)}><Trash2 className="size-4 text-destructive" /></Button>
                </div>
              ))}
              {!detectors.isLoading && detectorList.length === 0 && <p className="text-sm text-muted-foreground">No detectors configured.</p>}
            </div>
          </TabsContent>

          <TabsContent value="simulate" className="mt-3 space-y-3">
            <div className="grid gap-2 rounded-md border p-3 md:grid-cols-4">
              <Field label="Detector"><Select value={sim.detectorId} onValueChange={(detectorId) => setSim({ ...sim, detectorId })}><SelectTrigger><SelectValue placeholder="Select detector" /></SelectTrigger><SelectContent>{detectorList.map((d: any) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent></Select></Field>
              <Field label="Metric value"><Input type="number" value={sim.value} onChange={(e) => setSim({ ...sim, value: Number(e.target.value) })} /></Field>
              <Field label="Dimension"><Input value={sim.dimension} onChange={(e) => setSim({ ...sim, dimension: e.target.value })} /></Field>
              <div className="flex items-end"><Button disabled={!sim.detectorId || ingest.isPending} onClick={() => ingest.mutate()}>{ingest.isPending && <Loader2 className="mr-1 size-4 animate-spin" />}Ingest sample</Button></div>
            </div>
            {ingest.data?.evaluation && <EvaluationBox evaluation={ingest.data.evaluation} />}
          </TabsContent>

          <TabsContent value="incidents" className="mt-3 space-y-2">
            {(incidents.data ?? []).map((i: any) => (
              <div key={i.id} className="rounded-md border p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><Badge className={severityTone[i.severity] ?? ""}>{i.severity}</Badge><Badge variant="outline">{i.state}</Badge><span className="font-medium">{i.anomaly_detectors?.name ?? "Detector"}</span><code className="text-xs text-muted-foreground">{i.anomaly_detectors?.metric_key}</code></div><p className="mt-1 text-sm">{i.summary}</p><p className="mt-1 text-xs text-muted-foreground">{i.recommendation}</p></div>
                  <Select value={i.state} onValueChange={(state) => triage.mutate({ id: i.id, state })}><SelectTrigger className="h-8 w-36 text-xs"><SelectValue /></SelectTrigger><SelectContent>{STATE.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select>
                </div>
              </div>
            ))}
            {incidents.isLoading && <Loader2 className="size-4 animate-spin" />}
            {!incidents.isLoading && !(incidents.data ?? []).length && <p className="text-sm text-muted-foreground">No incidents in the last 30 days.</p>}
          </TabsContent>

          <TabsContent value="overview" className="mt-3 grid gap-3 md:grid-cols-2">
            <Breakdown title="By severity" rows={stats?.bySeverity ?? []} />
            <Breakdown title="By source" rows={stats?.bySource ?? []} />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

function Kpi({ label, value, danger }: { label: string; value: number; danger?: boolean }) {
  return <div className="rounded-md border p-2"><p className="text-[10px] uppercase text-muted-foreground">{label}</p><p className={danger ? "text-lg font-semibold text-destructive" : "text-lg font-semibold"}>{value.toLocaleString()}</p></div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1"><Label className="text-xs">{label}</Label>{children}</div>;
}

function EvaluationBox({ evaluation }: { evaluation: any }) {
  return <div className="rounded-md border bg-muted/30 p-3 text-sm"><div className="flex flex-wrap items-center gap-2"><Badge className={severityTone[evaluation.severity] ?? ""}>{evaluation.severity}</Badge><Badge variant="outline">score {evaluation.score}</Badge><Badge variant="outline">z {evaluation.zScore.toFixed(2)}</Badge>{evaluation.isAnomaly && <Badge variant="destructive">incident</Badge>}</div><p className="mt-2">{evaluation.summary}</p><p className="mt-1 text-xs text-muted-foreground">{evaluation.recommendation}</p></div>;
}

function Breakdown({ title, rows }: { title: string; rows: Array<[string, number]> }) {
  const max = Math.max(1, ...rows.map(([, v]) => v));
  return <div className="rounded-md border p-3"><p className="mb-2 text-xs font-medium uppercase text-muted-foreground">{title}</p><div className="space-y-2">{rows.length === 0 && <p className="text-xs text-muted-foreground">No data</p>}{rows.map(([k, v]) => <div key={k}><div className="flex justify-between text-xs"><span>{k}</span><span>{v}</span></div><div className="mt-1 h-1.5 overflow-hidden rounded bg-muted"><div className="h-full bg-primary" style={{ width: `${(v / max) * 100}%` }} /></div></div>)}</div></div>;
}