import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { applyDeployPlan, createDeployPlan, deleteDeployAdapter, listDeployOrchestrator, rollbackDeployPlan, saveDeployAdapter } from "@/lib/deploy-adapters.functions";
import { createCanaryDeployPlan, exportSelfHostBundle, validateDeployCredentials } from "@/lib/deploy-extras.functions";
import type { DeployProvider } from "@/lib/deploy-adapters.shared";
import type { BuildTarget } from "@/lib/target-builds.shared";
import { CheckCircle2, CloudCog, Download, GitBranch, Globe2, KeyRound, Loader2, PlayCircle, RotateCcw, ShieldCheck, Trash2, XCircle } from "lucide-react";
import { toast } from "sonner";

const TARGET_OPTIONS: BuildTarget[] = ["web", "mobile", "desktop", "pwa", "widget"];
const ENVIRONMENTS = ["production", "staging", "preview"];

export function DeployOrchestratorPanel({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listDeployOrchestrator);
  const saveFn = useServerFn(saveDeployAdapter);
  const planFn = useServerFn(createDeployPlan);
  const applyFn = useServerFn(applyDeployPlan);
  const rollbackFn = useServerFn(rollbackDeployPlan);
  const deleteFn = useServerFn(deleteDeployAdapter);

  const dataQ = useQuery({ queryKey: ["deploy-orchestrator", projectId], queryFn: () => listFn({ data: { projectId } }), refetchInterval: 15_000 });
  const data = dataQ.data as { catalog: any[]; adapters: any[]; plans: any[]; runs: any[] } | undefined;

  const [provider, setProvider] = useState<DeployProvider>("vercel");
  const [target, setTarget] = useState<BuildTarget>("web");
  const [environment, setEnvironment] = useState("production");
  const [region, setRegion] = useState("");
  const [trafficPercent, setTrafficPercent] = useState(100);
  const [credentialsRef, setCredentialsRef] = useState("");

  const catalogEntry = useMemo(() => data?.catalog.find((entry) => entry.provider === provider), [data, provider]);
  const filteredTargets = useMemo(() => TARGET_OPTIONS.filter((t) => catalogEntry?.supportedTargets?.includes(t)), [catalogEntry]);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["deploy-orchestrator", projectId] });

  const saveM = useMutation({
    mutationFn: () => saveFn({ data: { projectId, provider, environment, region: region || undefined, credentialsRef: credentialsRef || undefined } }),
    onSuccess: () => { toast.success("Deploy adapter saved"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const planM = useMutation({
    mutationFn: () => planFn({ data: { projectId, provider, target, environment, trafficPercent, region: region || undefined } }),
    onSuccess: (r) => { toast.success(`Plan created · ${r.plan.steps.length} steps · ${Math.round(r.plan.estimatedDurationSeconds / 60)}m`); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const applyM = useMutation({
    mutationFn: (planId: string) => applyFn({ data: { projectId, planId } }),
    onSuccess: () => { toast.success("Plan applied"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const rollbackM = useMutation({
    mutationFn: (planId: string) => rollbackFn({ data: { projectId, planId, reason: "manual rollback from panel" } }),
    onSuccess: () => { toast.success("Plan rolled back"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const deleteM = useMutation({
    mutationFn: (adapterId: string) => deleteFn({ data: { projectId, adapterId } }),
    onSuccess: () => { toast.success("Adapter removed"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card className="border-border/60 bg-card/50">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          <CloudCog className="size-4" /> Deploy Orchestrator
          <Badge variant="outline" className="text-[10px]">E1 plan / apply / rollback</Badge>
          <span className="ml-auto text-xs text-muted-foreground">{data?.adapters.length ?? 0} adapter(s) · {data?.plans.length ?? 0} plan(s)</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 rounded-lg border border-border/60 bg-background/40 p-3 lg:grid-cols-[1.2fr_1fr]">
          <div className="space-y-3">
            <div className="grid gap-2 sm:grid-cols-2">
              <Field label="Provider">
                <Select value={provider} onValueChange={(v) => setProvider(v as DeployProvider)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{data?.catalog.map((entry: any) => <SelectItem key={entry.provider} value={entry.provider}>{entry.displayName}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              <Field label="Target">
                <Select value={target} onValueChange={(v) => setTarget(v as BuildTarget)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{filteredTargets.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              <Field label="Environment">
                <Select value={environment} onValueChange={setEnvironment}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{ENVIRONMENTS.map((env) => <SelectItem key={env} value={env}>{env}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              <Field label="Region (optional)"><Input value={region} onChange={(e) => setRegion(e.target.value)} placeholder="iad1" /></Field>
              <Field label="Credentials ref"><Input value={credentialsRef} onChange={(e) => setCredentialsRef(e.target.value)} placeholder="secret:VERCEL_TOKEN" /></Field>
              <Field label={`Canary traffic · ${trafficPercent}%`}>
                <Slider value={[trafficPercent]} min={0} max={100} step={5} onValueChange={(v) => setTrafficPercent(v[0] ?? 100)} />
              </Field>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => saveM.mutate()} disabled={saveM.isPending}>{saveM.isPending ? <Loader2 className="mr-1 size-3 animate-spin" /> : <ShieldCheck className="mr-1 size-3" />} Save adapter</Button>
              <Button size="sm" onClick={() => planM.mutate()} disabled={planM.isPending}>{planM.isPending ? <Loader2 className="mr-1 size-3 animate-spin" /> : <PlayCircle className="mr-1 size-3" />} Create plan</Button>
            </div>
          </div>
          <div className="rounded-lg border border-border/60 bg-muted/20 p-3 text-xs">
            {catalogEntry ? (
              <div className="space-y-2">
                <div className="font-medium text-sm">{catalogEntry.displayName}</div>
                <div className="flex flex-wrap gap-1">
                  {catalogEntry.capabilities.multiRegion && <Badge variant="outline" className="text-[10px]">multi-region</Badge>}
                  {catalogEntry.capabilities.canary && <Badge variant="outline" className="text-[10px]">canary</Badge>}
                  {catalogEntry.capabilities.previewEnvironments && <Badge variant="outline" className="text-[10px]">preview envs</Badge>}
                  {catalogEntry.capabilities.selfHost && <Badge variant="outline" className="text-[10px]">self-host</Badge>}
                  {catalogEntry.capabilities.managedTls && <Badge variant="outline" className="text-[10px]">managed TLS</Badge>}
                </div>
                <div className="text-muted-foreground">Targets: {catalogEntry.supportedTargets.join(", ")}</div>
                <div className="text-muted-foreground">Credentials: {catalogEntry.credentialKeys.length ? catalogEntry.credentialKeys.join(", ") : "none (self-host)"}</div>
                <div className="text-muted-foreground">~ ${(catalogEntry.estimatedCostPerMillionCents / 100).toFixed(2)} / 1M requests baseline</div>
              </div>
            ) : <p className="text-muted-foreground">Select a provider…</p>}
          </div>
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          <Section title="Configured adapters">
            {(data?.adapters ?? []).map((adapter: any) => (
              <div key={adapter.id} className="flex items-center gap-2 rounded-lg border border-border/60 bg-background/40 p-2 text-xs">
                <Badge variant="outline">{adapter.provider}</Badge>
                <span className="text-muted-foreground">{adapter.environment}{adapter.region ? ` · ${adapter.region}` : ""}</span>
                <Badge variant={adapter.status === "configured" ? "default" : "secondary"} className="ml-auto">{adapter.status}</Badge>
                <Button size="icon" variant="ghost" onClick={() => deleteM.mutate(adapter.id)} disabled={deleteM.isPending}><Trash2 className="size-3.5" /></Button>
              </div>
            ))}
            {!data?.adapters.length && <p className="text-xs text-muted-foreground">No adapters configured yet.</p>}
          </Section>
          <Section title="Plans">
            {(data?.plans ?? []).map((p: any) => (
              <div key={p.id} className="space-y-1 rounded-lg border border-border/60 bg-background/40 p-2 text-xs">
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{p.provider}</Badge><Badge variant="outline">{p.target}</Badge><span className="text-muted-foreground">{p.environment}</span>
                  <Badge variant={p.status === "applied" ? "default" : p.status === "rolled_back" ? "destructive" : "secondary"} className="ml-auto">{p.status}</Badge>
                </div>
                <div className="text-muted-foreground">{(p.plan?.steps?.length ?? 0)} steps · ~{Math.round((p.plan?.estimatedDurationSeconds ?? 0) / 60)}m · ${(p.estimated_cost_cents / 100).toFixed(2)}</div>
                {!!(p.plan?.warnings ?? []).length && <div className="text-amber-500">⚠ {p.plan.warnings.join(" · ")}</div>}
                <div className="flex gap-1">
                  <Button size="sm" variant="outline" disabled={p.status !== "draft" || applyM.isPending} onClick={() => applyM.mutate(p.id)}><PlayCircle className="mr-1 size-3" /> Apply</Button>
                  <Button size="sm" variant="ghost" disabled={p.status !== "applied" || rollbackM.isPending} onClick={() => rollbackM.mutate(p.id)}><RotateCcw className="mr-1 size-3" /> Rollback</Button>
                </div>
              </div>
            ))}
            {!data?.plans.length && <p className="text-xs text-muted-foreground">No plans yet.</p>}
          </Section>
        </div>

        <Section title="Recent runs">
          <div className="space-y-1">
            {(data?.runs ?? []).map((run: any) => (
              <div key={run.id} className="flex items-center gap-2 rounded border border-border/40 bg-background/30 p-2 text-xs">
                {run.status === "success" ? <CheckCircle2 className="size-3.5 text-emerald-500" /> : <XCircle className="size-3.5 text-destructive" />}
                <Badge variant="outline">{run.action}</Badge>
                <span className="truncate text-muted-foreground">{run.logs}</span>
                <span className="ml-auto text-muted-foreground">{run.duration_ms ?? 0}ms</span>
              </div>
            ))}
            {!data?.runs.length && <p className="text-xs text-muted-foreground">No deploy actions yet.</p>}
          </div>
        </Section>
      </CardContent>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1"><Label className="text-xs">{label}</Label>{children}</div>;
}
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="rounded-lg border border-border/60 bg-background/30 p-3"><div className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">{title}</div>{children}</div>;
}
