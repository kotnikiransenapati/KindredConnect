import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  listFlags, upsertFlag, deleteFlag, evaluateFlag,
  listExperiments, upsertExperiment, transitionExperiment,
  assignVariant, trackExposure, experimentResults,
} from "@/lib/experiments.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Slider } from "@/components/ui/slider";
import { Flag, FlaskConical, Play, Pause, CheckCircle2, Archive, Trash2, Target, BarChart3 } from "lucide-react";
import { toast } from "sonner";

export function ExperimentsPanel({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const _listFlags = useServerFn(listFlags);
  const _upFlag = useServerFn(upsertFlag);
  const _delFlag = useServerFn(deleteFlag);
  const _evalFlag = useServerFn(evaluateFlag);
  const _listExp = useServerFn(listExperiments);
  const _upExp = useServerFn(upsertExperiment);
  const _trans = useServerFn(transitionExperiment);
  const _assign = useServerFn(assignVariant);
  const _expose = useServerFn(trackExposure);
  const _results = useServerFn(experimentResults);

  const flagsQ = useQuery({ queryKey: ["flags", projectId], queryFn: () => _listFlags({ data: { projectId } }) });
  const expQ = useQuery({ queryKey: ["exps", projectId], queryFn: () => _listExp({ data: { projectId } }) });

  // Flag form
  const [fKey, setFKey] = useState("");
  const [fDesc, setFDesc] = useState("");
  const [fEnabled, setFEnabled] = useState(false);
  const [fRollout, setFRollout] = useState(0);
  const upFlagM = useMutation({
    mutationFn: (v: any) => _upFlag({ data: v }),
    onSuccess: () => { toast.success("Flag saved"); qc.invalidateQueries({ queryKey: ["flags", projectId] }); setFKey(""); setFDesc(""); },
    onError: (e: any) => toast.error(e.message),
  });
  const delFlagM = useMutation({
    mutationFn: (id: string) => _delFlag({ data: { id, projectId } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["flags", projectId] }),
  });

  // Experiment form
  const [eKey, setEKey] = useState("");
  const [eMetric, setEMetric] = useState("conversion");
  const [eHypo, setEHypo] = useState("");
  const [eTraffic, setETraffic] = useState(100);
  const [eVariants, setEVariants] = useState("control:50,treatment:50");
  const upExpM = useMutation({
    mutationFn: (v: any) => _upExp({ data: v }),
    onSuccess: () => { toast.success("Experiment saved"); qc.invalidateQueries({ queryKey: ["exps", projectId] }); setEKey(""); setEHypo(""); },
    onError: (e: any) => toast.error(e.message),
  });
  const transM = useMutation({
    mutationFn: (v: { id: string; status: any }) => _trans({ data: { ...v, projectId } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["exps", projectId] }),
    onError: (e: any) => toast.error(e.message),
  });

  // Playground
  const [subjectId, setSubjectId] = useState("user-demo-1");
  const [pgExp, setPgExp] = useState<string>("");
  const [pgResult, setPgResult] = useState<any>(null);

  function parseVariants(s: string) {
    return s.split(",").map((p) => {
      const [k, w] = p.trim().split(":");
      return { key: (k || "").trim(), weight: Math.max(0, Number(w) || 0) };
    }).filter((v) => v.key);
  }

  return (
    <Card className="mt-4">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2"><FlaskConical className="h-4 w-4" /> Experiments & Feature Flags</CardTitle>
        <div className="flex gap-2 text-xs">
          <Badge variant="outline"><Flag className="h-3 w-3 mr-1" />{flagsQ.data?.length ?? 0} flags</Badge>
          <Badge variant="outline"><FlaskConical className="h-3 w-3 mr-1" />{expQ.data?.length ?? 0} experiments</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="flags">
          <TabsList>
            <TabsTrigger value="flags">Feature flags</TabsTrigger>
            <TabsTrigger value="exp">Experiments</TabsTrigger>
            <TabsTrigger value="playground">Playground</TabsTrigger>
          </TabsList>

          <TabsContent value="flags" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-2 items-end">
              <div><Label>Key</Label><Input value={fKey} onChange={(e) => setFKey(e.target.value)} placeholder="new_checkout" /></div>
              <div className="md:col-span-2"><Label>Description</Label><Input value={fDesc} onChange={(e) => setFDesc(e.target.value)} /></div>
              <div className="flex items-center gap-2"><Switch checked={fEnabled} onCheckedChange={setFEnabled} /><span className="text-xs">Enabled</span></div>
              <div className="md:col-span-3">
                <Label className="text-xs">Rollout {fRollout}%</Label>
                <Slider min={0} max={100} step={1} value={[fRollout]} onValueChange={(v) => setFRollout(v[0])} />
              </div>
              <Button disabled={!fKey || upFlagM.isPending} onClick={() => upFlagM.mutate({
                projectId, key: fKey, description: fDesc || undefined,
                enabled: fEnabled, rolloutPercent: fRollout, rules: [],
              })}>Save flag</Button>
            </div>
            <div className="space-y-2">
              {(flagsQ.data ?? []).map((f: any) => (
                <div key={f.id} className="flex items-center justify-between border rounded p-2">
                  <div>
                    <div className="font-mono text-sm">{f.key} <Badge variant={f.enabled ? "default" : "secondary"} className="ml-1">{f.enabled ? "ON" : "OFF"}</Badge> <Badge variant="outline">{f.rollout_percent}%</Badge></div>
                    {f.description && <div className="text-xs text-muted-foreground">{f.description}</div>}
                  </div>
                  <Button size="icon" variant="ghost" onClick={() => delFlagM.mutate(f.id)}><Trash2 className="h-4 w-4" /></Button>
                </div>
              ))}
              {!flagsQ.data?.length && <div className="text-xs text-muted-foreground">No flags yet.</div>}
            </div>
          </TabsContent>

          <TabsContent value="exp" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              <div><Label>Key</Label><Input value={eKey} onChange={(e) => setEKey(e.target.value)} placeholder="onboarding_v2" /></div>
              <div><Label>Primary metric</Label><Input value={eMetric} onChange={(e) => setEMetric(e.target.value)} /></div>
              <div>
                <Label className="text-xs">Traffic {eTraffic}%</Label>
                <Slider min={0} max={100} step={1} value={[eTraffic]} onValueChange={(v) => setETraffic(v[0])} />
              </div>
              <div className="md:col-span-3"><Label>Hypothesis</Label><Textarea rows={2} value={eHypo} onChange={(e) => setEHypo(e.target.value)} /></div>
              <div className="md:col-span-3"><Label>Variants (key:weight, comma)</Label><Input value={eVariants} onChange={(e) => setEVariants(e.target.value)} /></div>
              <Button disabled={!eKey || upExpM.isPending} onClick={() => upExpM.mutate({
                projectId, key: eKey, primaryMetric: eMetric, hypothesis: eHypo || undefined,
                trafficPercent: eTraffic, variants: parseVariants(eVariants),
              })}>Save experiment</Button>
            </div>
            <div className="space-y-3">
              {(expQ.data ?? []).map((e: any) => (
                <ExperimentRow key={e.id} exp={e} onTransition={(s) => transM.mutate({ id: e.id, status: s })}
                  fetchResults={() => _results({ data: { experimentId: e.id } })} />
              ))}
              {!expQ.data?.length && <div className="text-xs text-muted-foreground">No experiments.</div>}
            </div>
          </TabsContent>

          <TabsContent value="playground" className="space-y-2">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              <div><Label>Subject ID</Label><Input value={subjectId} onChange={(e) => setSubjectId(e.target.value)} /></div>
              <div><Label>Experiment</Label>
                <select className="border rounded h-9 px-2 w-full bg-background" value={pgExp} onChange={(e) => setPgExp(e.target.value)}>
                  <option value="">— pick —</option>
                  {(expQ.data ?? []).map((e: any) => <option key={e.id} value={e.id}>{e.key} ({e.status})</option>)}
                </select>
              </div>
              <div className="flex items-end gap-2">
                <Button onClick={async () => {
                  if (!pgExp) return;
                  try { setPgResult(await _assign({ data: { experimentId: pgExp, projectId, subjectId } })); }
                  catch (e: any) { toast.error(e.message); }
                }}><Target className="h-4 w-4 mr-1" />Assign</Button>
                <Button variant="secondary" onClick={async () => {
                  if (!pgExp) return;
                  try { await _expose({ data: { experimentId: pgExp, projectId, subjectId, metricKey: "conversion", isConversion: true } }); toast.success("Exposure logged"); }
                  catch (e: any) { toast.error(e.message); }
                }}><BarChart3 className="h-4 w-4 mr-1" />Log conversion</Button>
              </div>
            </div>
            {pgResult && <pre className="text-xs p-3 bg-muted rounded overflow-auto">{JSON.stringify(pgResult, null, 2)}</pre>}
            <div className="text-xs text-muted-foreground">Use a flag key:</div>
            <div className="flex gap-2">
              <Input id="flagKey" placeholder="flag key" className="max-w-xs" />
              <Button variant="outline" onClick={async () => {
                const key = (document.getElementById("flagKey") as HTMLInputElement)?.value;
                if (!key) return;
                try { const r = await _evalFlag({ data: { projectId, key, subjectId } });
                  toast.message(`flag "${key}" → ${r.enabled ? "ON" : "OFF"} (${r.reason})`); }
                catch (e: any) { toast.error(e.message); }
              }}>Evaluate flag</Button>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

function ExperimentRow({ exp, onTransition, fetchResults }: { exp: any; onTransition: (s: string) => void; fetchResults: () => Promise<any> }) {
  const [results, setResults] = useState<any[] | null>(null);
  return (
    <div className="border rounded p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="font-mono text-sm">{exp.key} <Badge>{exp.status}</Badge> <Badge variant="outline">{exp.traffic_percent}%</Badge></div>
          <div className="text-xs text-muted-foreground">metric: {exp.primary_metric} · {exp.variants?.length ?? 0} variants</div>
        </div>
        <div className="flex gap-1">
          {exp.status === "draft" && <Button size="sm" onClick={() => onTransition("running")}><Play className="h-3 w-3 mr-1" />Start</Button>}
          {exp.status === "running" && <Button size="sm" variant="secondary" onClick={() => onTransition("paused")}><Pause className="h-3 w-3 mr-1" />Pause</Button>}
          {exp.status === "paused" && <Button size="sm" onClick={() => onTransition("running")}><Play className="h-3 w-3 mr-1" />Resume</Button>}
          {(exp.status === "running" || exp.status === "paused") && <Button size="sm" variant="secondary" onClick={() => onTransition("completed")}><CheckCircle2 className="h-3 w-3 mr-1" />Complete</Button>}
          {exp.status !== "archived" && <Button size="sm" variant="ghost" onClick={() => onTransition("archived")}><Archive className="h-3 w-3" /></Button>}
          <Button size="sm" variant="outline" onClick={async () => setResults(await fetchResults())}><BarChart3 className="h-3 w-3 mr-1" />Results</Button>
        </div>
      </div>
      {exp.hypothesis && <p className="text-xs italic text-muted-foreground">{exp.hypothesis}</p>}
      {results && (
        <div className="text-xs">
          <div className="grid grid-cols-5 gap-2 font-semibold text-muted-foreground border-b pb-1">
            <div>Variant</div><div>Exposures</div><div>Conversions</div><div>CR %</div><div>Total value</div>
          </div>
          {results.map((r) => (
            <div key={r.variant} className="grid grid-cols-5 gap-2 py-1 border-b">
              <div className="font-mono">{r.variant}</div><div>{r.exposures}</div>
              <div>{r.conversions}</div><div>{r.conversion_rate}</div><div>{r.total_value}</div>
            </div>
          ))}
          {!results.length && <div className="text-muted-foreground py-2">No data yet — log exposures in the playground.</div>}
        </div>
      )}
    </div>
  );
}
