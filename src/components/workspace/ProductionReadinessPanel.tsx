import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { enableComplianceProfile, listProductionReadiness, materializeProductionReadiness, saveTelemetryConfig, upsertSecurityBaseline } from "@/lib/production-readiness.functions";
import type { ComplianceProfile, SecurityProfile, TelemetryProvider } from "@/lib/production-readiness.shared";
import { Activity, CheckCircle2, FileCheck2, Loader2, Radar, ShieldCheck, Siren, XCircle } from "lucide-react";
import { toast } from "sonner";

const SECURITY_PROFILES: SecurityProfile[] = ["standard", "strict", "regulated"];
const TELEMETRY_PROVIDERS: TelemetryProvider[] = ["otlp", "honeycomb", "datadog", "grafana-cloud", "self-hosted"];
const COMPLIANCE_PROFILES: ComplianceProfile[] = ["soc2", "hipaa", "gdpr", "pci", "iso27001", "custom"];

type ReadinessData = {
  security: unknown | null;
  telemetry: unknown | null;
  complianceProfiles: Array<unknown>;
  assessment: {
    score: number;
    grade: "A" | "B" | "C" | "D";
    checks: Array<{ key: string; label: string; status: "pass" | "warn" | "fail"; score: number; detail: string }>;
    recommendations: string[];
  };
};

export function ProductionReadinessPanel({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listProductionReadiness);
  const securityFn = useServerFn(upsertSecurityBaseline);
  const telemetryFn = useServerFn(saveTelemetryConfig);
  const complianceFn = useServerFn(enableComplianceProfile);
  const materializeFn = useServerFn(materializeProductionReadiness);
  const [securityProfile, setSecurityProfile] = useState<SecurityProfile>("strict");
  const [telemetryProvider, setTelemetryProvider] = useState<TelemetryProvider>("otlp");
  const [telemetryEndpoint, setTelemetryEndpoint] = useState("${OTEL_EXPORTER_OTLP_ENDPOINT}");
  const [serviceName, setServiceName] = useState("generated-app");
  const [sampleRate, setSampleRate] = useState("0.25");
  const [logsEnabled, setLogsEnabled] = useState(true);
  const [complianceProfile, setComplianceProfile] = useState<ComplianceProfile>("soc2");
  const [retentionDays, setRetentionDays] = useState("365");
  const [residencyRequired, setResidencyRequired] = useState(false);

  const q = useQuery({ queryKey: ["production-readiness", projectId], queryFn: () => listFn({ data: { projectId } }), refetchInterval: 25_000 });
  const readiness = q.data as ReadinessData | undefined;
  const assessment = readiness?.assessment;
  const checks = assessment?.checks ?? [];
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["production-readiness", projectId] });
    qc.invalidateQueries({ queryKey: ["project-files", projectId] });
  };
  const securityM = useMutation({ mutationFn: () => securityFn({ data: { projectId, profile: securityProfile, dependencyGateEnabled: true } }), onSuccess: () => { toast.success("Generated app security baseline saved"); invalidate(); }, onError: (e: Error) => toast.error(e.message) });
  const telemetryM = useMutation({ mutationFn: () => telemetryFn({ data: { projectId, provider: telemetryProvider, endpoint: telemetryEndpoint, serviceName, sampleRate: Math.max(0, Math.min(1, Number(sampleRate) || 0.25)), tracesEnabled: true, metricsEnabled: true, logsEnabled } }), onSuccess: () => { toast.success("OpenTelemetry pipeline saved"); invalidate(); }, onError: (e: Error) => toast.error(e.message) });
  const complianceM = useMutation({ mutationFn: () => complianceFn({ data: { projectId, profile: complianceProfile, retentionDays: Math.max(30, Number(retentionDays) || 365), residencyRequired } }), onSuccess: () => { toast.success("Compliance profile enabled"); invalidate(); }, onError: (e: Error) => toast.error(e.message) });
  const materializeM = useMutation({ mutationFn: () => materializeFn({ data: { projectId } }), onSuccess: (r) => { toast.success(`Production kit generated · ${r.files.length} files · grade ${r.assessment.grade}`); invalidate(); }, onError: (e: Error) => toast.error(e.message) });

  return (
    <Card className="border-border/60 bg-card/50">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          <Radar className="size-4" /> Production Readiness Center
          <Badge variant="outline" className="text-[10px]">F1 security</Badge>
          <Badge variant="outline" className="text-[10px]">F2 telemetry</Badge>
          <Badge variant="outline" className="text-[10px]">F3 compliance</Badge>
          <Badge variant="outline" className="text-[10px]">G1 readiness</Badge>
          <span className="ml-auto text-xs text-muted-foreground">grade {assessment?.grade ?? "—"} · score {assessment?.score ?? 0}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 lg:grid-cols-[240px_1fr]">
          <div className="rounded-lg border border-border/60 bg-background/40 p-3">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Readiness score</div>
            <div className="mt-2 flex items-end gap-2"><span className="text-4xl font-semibold">{assessment?.score ?? 0}</span><Badge variant={assessment?.grade === "A" ? "default" : "secondary"}>grade {assessment?.grade ?? "—"}</Badge></div>
            <Progress value={assessment?.score ?? 0} className="mt-3" />
            <Button className="mt-4 w-full" onClick={() => materializeM.mutate()} disabled={materializeM.isPending}>{materializeM.isPending ? <Loader2 className="mr-1 size-3 animate-spin" /> : <FileCheck2 className="mr-1 size-3" />} Generate production kit</Button>
          </div>
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
            {checks.map((check: any) => (
              <div key={check.key} className="rounded-lg border border-border/60 bg-background/40 p-3 text-xs">
                <div className="flex items-center gap-2">
                  {check.status === "pass" ? <CheckCircle2 className="size-3.5 text-emerald-500" /> : check.status === "warn" ? <Siren className="size-3.5 text-amber-500" /> : <XCircle className="size-3.5 text-destructive" />}
                  <span className="font-medium">{check.label}</span><Badge variant="outline" className="ml-auto text-[10px]">{check.score}</Badge>
                </div>
                <p className="mt-2 text-muted-foreground">{check.detail}</p>
              </div>
            ))}
            {!checks.length && <p className="text-sm text-muted-foreground">No readiness assessment yet.</p>}
          </div>
        </div>
        <div className="grid gap-3 xl:grid-cols-3">
          <Section title="F1 · Generated app security">
            <div className="space-y-2">
              <Field label="Profile"><Select value={securityProfile} onValueChange={(v) => setSecurityProfile(v as SecurityProfile)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{SECURITY_PROFILES.map((profile) => <SelectItem key={profile} value={profile}>{profile}</SelectItem>)}</SelectContent></Select></Field>
              <div className="grid gap-2 text-xs sm:grid-cols-2"><Pill label="CSP" value={securityProfile === "standard" ? "balanced" : "strict"} /><Pill label="RLS" value="required" /><Pill label="Audit" value="enabled" /><Pill label="Dependency gate" value="high+ blocked" /></div>
              <Button size="sm" variant="outline" onClick={() => securityM.mutate()} disabled={securityM.isPending}>{securityM.isPending ? <Loader2 className="mr-1 size-3 animate-spin" /> : <ShieldCheck className="mr-1 size-3" />} Save security baseline</Button>
            </div>
          </Section>
          <Section title="F2 · OpenTelemetry pipeline">
            <div className="space-y-2">
              <Field label="Provider"><Select value={telemetryProvider} onValueChange={(v) => setTelemetryProvider(v as TelemetryProvider)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{TELEMETRY_PROVIDERS.map((provider) => <SelectItem key={provider} value={provider}>{provider}</SelectItem>)}</SelectContent></Select></Field>
              <Field label="Endpoint"><Input value={telemetryEndpoint} onChange={(e) => setTelemetryEndpoint(e.target.value)} placeholder="https://collector.example.com/v1/traces" /></Field>
              <div className="grid gap-2 sm:grid-cols-2"><Field label="Service"><Input value={serviceName} onChange={(e) => setServiceName(e.target.value)} /></Field><Field label="Sample rate"><Input value={sampleRate} onChange={(e) => setSampleRate(e.target.value)} inputMode="decimal" /></Field></div>
              <div className="flex items-center justify-between rounded-md border border-border/60 p-2 text-xs"><span>Structured logs</span><Switch checked={logsEnabled} onCheckedChange={setLogsEnabled} /></div>
              <Button size="sm" variant="outline" onClick={() => telemetryM.mutate()} disabled={telemetryM.isPending}>{telemetryM.isPending ? <Loader2 className="mr-1 size-3 animate-spin" /> : <Activity className="mr-1 size-3" />} Save telemetry</Button>
            </div>
          </Section>
          <Section title="F3 · Compliance bundle">
            <div className="space-y-2">
              <Field label="Framework"><Select value={complianceProfile} onValueChange={(v) => setComplianceProfile(v as ComplianceProfile)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{COMPLIANCE_PROFILES.map((profile) => <SelectItem key={profile} value={profile}>{profile.toUpperCase()}</SelectItem>)}</SelectContent></Select></Field>
              <Field label="Retention days"><Input value={retentionDays} onChange={(e) => setRetentionDays(e.target.value)} inputMode="numeric" /></Field>
              <div className="flex items-center justify-between rounded-md border border-border/60 p-2 text-xs"><span>Require residency pin</span><Switch checked={residencyRequired} onCheckedChange={setResidencyRequired} /></div>
              <Button size="sm" variant="outline" onClick={() => complianceM.mutate()} disabled={complianceM.isPending}>{complianceM.isPending ? <Loader2 className="mr-1 size-3 animate-spin" /> : <FileCheck2 className="mr-1 size-3" />} Enable profile</Button>
            </div>
          </Section>
        </div>
        <div className="rounded-lg border border-border/60 bg-muted/20 p-3 text-xs text-muted-foreground">Production kit status: security {readiness?.security ? "configured" : "pending"} · telemetry {readiness?.telemetry ? "configured" : "pending"} · compliance {(readiness?.complianceProfiles ?? []).length} profile(s) · recommendations {(assessment?.recommendations ?? []).length}.</div>
      </CardContent>
    </Card>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="rounded-lg border border-border/60 bg-background/30 p-3"><div className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">{title}</div>{children}</div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1"><Label className="text-xs">{label}</Label>{children}</div>;
}

function Pill({ label, value }: { label: string; value: string }) {
  return <div className="rounded border border-border/60 p-2"><div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div><div>{value}</div></div>;
}