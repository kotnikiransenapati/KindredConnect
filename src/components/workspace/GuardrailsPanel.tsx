import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  listGuardrails,
  upsertGuardrail,
  deleteGuardrail,
  scanContent,
  listGuardrailViolations,
} from "@/lib/guardrails.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ShieldAlert, ShieldCheck, Loader2, Trash2, Sparkles } from "lucide-react";
import { toast } from "sonner";

const TYPES = [
  { v: "pii_redact", l: "PII redaction", defaultAction: "redact", defaultConfig: "{}" },
  { v: "secret_leak", l: "Secret leak", defaultAction: "block", defaultConfig: "{}" },
  { v: "prompt_injection", l: "Prompt injection", defaultAction: "block", defaultConfig: "{}" },
  { v: "toxicity", l: "Toxicity", defaultAction: "warn", defaultConfig: "{}" },
  { v: "topic_filter", l: "Topic filter", defaultAction: "block", defaultConfig: '{"banned":["competitor_name"]}' },
  { v: "rate_cap", l: "Rate cap (per min)", defaultAction: "warn", defaultConfig: '{"max":60}' },
];

const SEV_COLOR: Record<string, string> = {
  low: "bg-muted text-muted-foreground",
  medium: "bg-amber-500/15 text-amber-600",
  high: "bg-orange-500/15 text-orange-600",
  critical: "bg-destructive/15 text-destructive",
};

export function GuardrailsPanel({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const fetchRules = useServerFn(listGuardrails);
  const upsert = useServerFn(upsertGuardrail);
  const del = useServerFn(deleteGuardrail);
  const scan = useServerFn(scanContent);
  const fetchViolations = useServerFn(listGuardrailViolations);

  const [form, setForm] = useState({
    name: "",
    type: "pii_redact",
    action: "redact",
    config: "{}",
    enabled: true,
  });
  const [testInput, setTestInput] = useState("");

  const rulesQ = useQuery({
    queryKey: ["guardrails", projectId],
    queryFn: () => fetchRules({ data: { projectId } }),
  });
  const violationsQ = useQuery({
    queryKey: ["guardrail-violations", projectId],
    queryFn: () => fetchViolations({ data: { projectId, days: 14 } }),
    refetchInterval: 10000,
  });

  const upsertM = useMutation({
    mutationFn: (v: any) => upsert({ data: v }),
    onSuccess: () => {
      toast.success("Guardrail saved");
      setForm({ name: "", type: "pii_redact", action: "redact", config: "{}", enabled: true });
      qc.invalidateQueries({ queryKey: ["guardrails", projectId] });
    },
    onError: (e: any) => toast.error(e.message),
  });
  const delM = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["guardrails", projectId] }),
  });
  const toggleM = useMutation({
    mutationFn: (rule: any) => upsert({ data: {
      id: rule.id, projectId, name: rule.name, type: rule.type,
      action: rule.action, config: rule.config ?? {}, enabled: !rule.enabled,
    } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["guardrails", projectId] }),
  });

  const scanM = useMutation({
    mutationFn: () => scan({ data: { projectId, content: testInput, direction: "input" } }),
    onSuccess: (r: any) => {
      if (!r.allowed) toast.error(`Blocked by: ${r.blockedBy}`);
      else if (r.findings.length) toast.warning(`${r.findings.length} guardrail(s) triggered`);
      else toast.success("Clean — no findings");
      qc.invalidateQueries({ queryKey: ["guardrail-violations", projectId] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Card className="border-border/60">
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="font-display text-base flex items-center gap-2">
          <ShieldCheck className="h-4 w-4" /> AI Safety Guardrails
        </CardTitle>
        <Badge variant="outline" className="font-mono text-[10px]">
          {(rulesQ.data?.guardrails ?? []).filter((r: any) => r.enabled).length} active
        </Badge>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="rules">
          <TabsList>
            <TabsTrigger value="rules">Rules</TabsTrigger>
            <TabsTrigger value="playground">Playground</TabsTrigger>
            <TabsTrigger value="violations">Violations</TabsTrigger>
          </TabsList>

          <TabsContent value="rules" className="space-y-4 mt-3">
            <div className="rounded-lg border border-border/60 p-3 space-y-3">
              <p className="text-xs font-medium text-muted-foreground">New rule</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label className="text-xs">Name</Label>
                  <Input className="mt-1" value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="pii-strict" />
                </div>
                <div>
                  <Label className="text-xs">Type</Label>
                  <Select value={form.type} onValueChange={(v) => {
                    const t = TYPES.find((x) => x.v === v)!;
                    setForm({ ...form, type: v, action: t.defaultAction, config: t.defaultConfig });
                  }}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {TYPES.map((t) => <SelectItem key={t.v} value={t.v}>{t.l}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Action</Label>
                  <Select value={form.action} onValueChange={(v) => setForm({ ...form, action: v })}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="block">Block</SelectItem>
                      <SelectItem value="warn">Warn</SelectItem>
                      <SelectItem value="redact">Redact</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-end gap-2">
                  <div className="flex items-center gap-2">
                    <Switch checked={form.enabled}
                      onCheckedChange={(c) => setForm({ ...form, enabled: c })} />
                    <Label className="text-xs">Enabled</Label>
                  </div>
                </div>
                <div className="sm:col-span-2">
                  <Label className="text-xs">Config (JSON)</Label>
                  <Textarea className="mt-1 font-mono text-[11px] min-h-[60px]"
                    value={form.config}
                    onChange={(e) => setForm({ ...form, config: e.target.value })} />
                </div>
              </div>
              <Button size="sm" disabled={upsertM.isPending}
                onClick={() => {
                  let cfg = {};
                  try { cfg = JSON.parse(form.config || "{}"); }
                  catch { toast.error("Invalid JSON config"); return; }
                  upsertM.mutate({
                    projectId, name: form.name, type: form.type,
                    action: form.action, config: cfg, enabled: form.enabled,
                  });
                }}>
                {upsertM.isPending && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
                Save rule
              </Button>
            </div>

            <div className="space-y-2">
              {rulesQ.isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> :
                (rulesQ.data?.guardrails ?? []).length === 0 ? (
                  <p className="text-xs text-muted-foreground">No rules yet.</p>
                ) : (rulesQ.data?.guardrails ?? []).map((r: any) => (
                  <div key={r.id} className="rounded-lg border border-border/60 p-3 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">
                        {r.name} <span className="text-muted-foreground">· {r.type}</span>
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        Action: {r.action} {!r.enabled && "· disabled"}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Switch checked={r.enabled} onCheckedChange={() => toggleM.mutate(r)} />
                      <Button size="sm" variant="ghost" onClick={() => delM.mutate(r.id)}>
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </div>
                  </div>
                ))}
            </div>
          </TabsContent>

          <TabsContent value="playground" className="space-y-3 mt-3">
            <Label className="text-xs">Test content</Label>
            <Textarea value={testInput} onChange={(e) => setTestInput(e.target.value)}
              placeholder="Paste any text — emails, secrets, prompt injections, etc."
              className="min-h-[120px] font-mono text-[11px]" />
            <Button size="sm" disabled={scanM.isPending || !testInput.trim()}
              onClick={() => scanM.mutate()}>
              {scanM.isPending ? <Loader2 className="mr-2 h-3 w-3 animate-spin" /> : <Sparkles className="mr-2 h-3 w-3" />}
              Scan
            </Button>
            {scanM.data && (
              <div className="rounded-lg border border-border/60 p-3 space-y-2">
                <div className="flex items-center gap-2">
                  {scanM.data.allowed ? (
                    <ShieldCheck className="h-4 w-4 text-emerald-500" />
                  ) : (
                    <ShieldAlert className="h-4 w-4 text-destructive" />
                  )}
                  <span className="text-sm font-medium">
                    {scanM.data.allowed ? "Allowed" : `Blocked by ${scanM.data.blockedBy}`}
                  </span>
                </div>
                {scanM.data.findings.map((f: any, i: number) => (
                  <div key={i} className="text-xs flex items-center gap-2">
                    <Badge className={SEV_COLOR[f.severity]}>{f.severity}</Badge>
                    <span>{f.name} · {f.actionTaken}</span>
                    <span className="text-muted-foreground font-mono">{f.patterns.join(", ")}</span>
                  </div>
                ))}
                {scanM.data.output && scanM.data.output !== testInput && (
                  <div className="mt-2">
                    <p className="text-[11px] font-medium text-muted-foreground mb-1">After redaction:</p>
                    <pre className="text-[11px] font-mono bg-muted/40 rounded p-2 whitespace-pre-wrap">
                      {scanM.data.output}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </TabsContent>

          <TabsContent value="violations" className="space-y-2 mt-3">
            {violationsQ.isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> :
              (violationsQ.data?.violations ?? []).length === 0 ? (
                <p className="text-xs text-muted-foreground">No violations in the last 14 days.</p>
              ) : (violationsQ.data?.violations ?? []).map((v: any) => (
                <div key={v.id} className="rounded-lg border border-border/60 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Badge className={SEV_COLOR[v.severity]}>{v.severity}</Badge>
                      <span className="text-sm">{v.guardrail_type}</span>
                      <span className="text-[11px] text-muted-foreground">→ {v.action_taken}</span>
                    </div>
                    <span className="text-[10px] text-muted-foreground">
                      {new Date(v.occurred_at).toLocaleString()}
                    </span>
                  </div>
                  {v.matched_patterns?.length > 0 && (
                    <p className="mt-1 text-[11px] font-mono text-muted-foreground">
                      {v.matched_patterns.join(", ")}
                    </p>
                  )}
                  {v.snippet && (
                    <pre className="mt-2 text-[11px] font-mono bg-muted/30 rounded p-2 max-h-24 overflow-auto">
                      {v.snippet}
                    </pre>
                  )}
                </div>
              ))}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
