// P48 — AI cost guardrails panel.
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ackAlert, deleteBudget, ledgerSummary, listAlerts, listBudgets, recordSpend, upsertBudget,
} from "@/lib/cost-guardrails.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { DollarSign, Trash2 } from "lucide-react";
import { toast } from "sonner";

const levelTone: Record<string, string> = {
  ok: "border-emerald-500/40 bg-emerald-500/10 text-emerald-600",
  soft: "border-amber-500/40 bg-amber-500/10 text-amber-600",
  hard: "bg-destructive text-destructive-foreground",
};

export function CostGuardrailsPanel({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const bFn = useServerFn(listBudgets);
  const upFn = useServerFn(upsertBudget);
  const delFn = useServerFn(deleteBudget);
  const recFn = useServerFn(recordSpend);
  const aFn = useServerFn(listAlerts);
  const ackFn = useServerFn(ackAlert);
  const sFn = useServerFn(ledgerSummary);

  const budgets = useQuery({ queryKey: ["cost-budgets", projectId], queryFn: () => bFn({ data: { projectId } }), refetchInterval: 12_000 });
  const alerts = useQuery({ queryKey: ["cost-alerts", projectId], queryFn: () => aFn({ data: { projectId } }), refetchInterval: 12_000 });
  const summary = useQuery({ queryKey: ["cost-summary", projectId], queryFn: () => sFn({ data: { projectId } }), refetchInterval: 15_000 });

  const [budget, setBudget] = useState({
    name: "Monthly AI cap", scope: "project" as const, period: "monthly" as const,
    limitUsd: 200, softPct: 80, hardPct: 100, action: "throttle" as const, enabled: true,
  });
  const [spend, setSpend] = useState({ budgetId: "", provider: "openai", model: "gpt-4o-mini", inputTokens: 1500, outputTokens: 500, costUsd: 0.12 });

  const save = useMutation({
    mutationFn: () => upFn({ data: { projectId, ...budget } }),
    onSuccess: () => { toast.success("Budget saved"); qc.invalidateQueries({ queryKey: ["cost-budgets", projectId] }); },
    onError: (e: any) => toast.error(e.message),
  });
  const record = useMutation({
    mutationFn: () => recFn({ data: { projectId, ...spend, budgetId: spend.budgetId || undefined } }),
    onSuccess: () => { toast.success("Spend recorded"); qc.invalidateQueries({ queryKey: ["cost-budgets", projectId] }); qc.invalidateQueries({ queryKey: ["cost-alerts", projectId] }); qc.invalidateQueries({ queryKey: ["cost-summary", projectId] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const s: any = summary.data ?? { total: 0, byModel: {}, recent: [] };

  return (
    <Card className="border-border/60">
      <CardHeader className="flex flex-row items-center gap-2">
        <DollarSign className="h-4 w-4 text-primary" />
        <CardTitle className="text-base">AI cost guardrails</CardTitle>
        <Badge variant="outline" className="ml-2">P48</Badge>
      </CardHeader>
      <CardContent>
        <div className="mb-3 grid grid-cols-3 gap-2">
          <div className="rounded-lg border border-border/60 bg-muted/30 p-2"><div className="text-[10px] uppercase text-muted-foreground">30d spend</div><div className="font-display text-lg">${s.total}</div></div>
          <div className="rounded-lg border border-border/60 bg-muted/30 p-2"><div className="text-[10px] uppercase text-muted-foreground">Budgets</div><div className="font-display text-lg">{(budgets.data ?? []).length}</div></div>
          <div className="rounded-lg border border-border/60 bg-muted/30 p-2"><div className="text-[10px] uppercase text-muted-foreground">Alerts</div><div className="font-display text-lg">{(alerts.data ?? []).filter((a: any) => !a.acknowledged_at).length}</div></div>
        </div>

        <Tabs defaultValue="budgets">
          <TabsList>
            <TabsTrigger value="budgets">Budgets</TabsTrigger>
            <TabsTrigger value="record">Record</TabsTrigger>
            <TabsTrigger value="alerts">Alerts</TabsTrigger>
            <TabsTrigger value="ledger">Ledger</TabsTrigger>
          </TabsList>

          <TabsContent value="budgets" className="space-y-3">
            <div className="grid gap-2 md:grid-cols-3">
              <div><Label>Name</Label><Input value={budget.name} onChange={(e) => setBudget({ ...budget, name: e.target.value })} /></div>
              <div><Label>Period</Label>
                <Select value={budget.period} onValueChange={(v) => setBudget({ ...budget, period: v as any })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{["hourly", "daily", "weekly", "monthly"].map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Action</Label>
                <Select value={budget.action} onValueChange={(v) => setBudget({ ...budget, action: v as any })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{["alert", "throttle", "block"].map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Limit (USD)</Label><Input type="number" step="0.01" value={budget.limitUsd} onChange={(e) => setBudget({ ...budget, limitUsd: Number(e.target.value) })} /></div>
              <div><Label>Soft %</Label><Input type="number" value={budget.softPct} onChange={(e) => setBudget({ ...budget, softPct: Number(e.target.value) })} /></div>
              <div><Label>Hard %</Label><Input type="number" value={budget.hardPct} onChange={(e) => setBudget({ ...budget, hardPct: Number(e.target.value) })} /></div>
              <div className="flex items-center gap-2 pt-5"><Switch checked={budget.enabled} onCheckedChange={(v) => setBudget({ ...budget, enabled: v })} /><Label>Enabled</Label></div>
            </div>
            <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending}>Save budget</Button>
            <div className="space-y-2">
              {(budgets.data ?? []).map((b: any) => (
                <div key={b.id} className="rounded-md border border-border/60 p-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-medium">{b.name}</span>
                      <span className="ml-2 text-xs text-muted-foreground">{b.period} · {b.scope} · {b.action}</span>
                      <span className={`ml-2 rounded border px-1.5 py-0.5 text-[10px] uppercase ${levelTone[b.level] ?? ""}`}>{b.level}</span>
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => delFn({ data: { projectId, id: b.id } }).then(() => qc.invalidateQueries({ queryKey: ["cost-budgets", projectId] }))}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </div>
                  <div className="mt-1.5 flex items-center gap-2 text-xs">
                    <Progress value={Math.min(100, b.pct)} className="h-2 flex-1" />
                    <span>${b.spend} / ${b.limit_usd} ({b.pct}%)</span>
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="record" className="space-y-3">
            <div className="grid gap-2 md:grid-cols-3">
              <div><Label>Budget</Label>
                <Select value={spend.budgetId} onValueChange={(v) => setSpend({ ...spend, budgetId: v })}>
                  <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                  <SelectContent>{(budgets.data ?? []).map((b: any) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Provider</Label><Input value={spend.provider} onChange={(e) => setSpend({ ...spend, provider: e.target.value })} /></div>
              <div><Label>Model</Label><Input value={spend.model} onChange={(e) => setSpend({ ...spend, model: e.target.value })} /></div>
              <div><Label>Input tokens</Label><Input type="number" value={spend.inputTokens} onChange={(e) => setSpend({ ...spend, inputTokens: Number(e.target.value) })} /></div>
              <div><Label>Output tokens</Label><Input type="number" value={spend.outputTokens} onChange={(e) => setSpend({ ...spend, outputTokens: Number(e.target.value) })} /></div>
              <div><Label>Cost (USD)</Label><Input type="number" step="0.0001" value={spend.costUsd} onChange={(e) => setSpend({ ...spend, costUsd: Number(e.target.value) })} /></div>
            </div>
            <Button size="sm" onClick={() => record.mutate()} disabled={record.isPending}>Record spend</Button>
          </TabsContent>

          <TabsContent value="alerts" className="space-y-2">
            {(alerts.data ?? []).map((a: any) => (
              <div key={a.id} className="flex items-center justify-between rounded-md border border-border/60 p-2 text-xs">
                <div>
                  <span className={`rounded border px-1.5 py-0.5 text-[10px] uppercase ${a.threshold === "hard" ? "bg-destructive text-destructive-foreground" : "border-amber-500/40 bg-amber-500/10 text-amber-600"}`}>{a.threshold}</span>
                  <span className="ml-2">${Number(a.current_spend).toFixed(2)} / ${Number(a.limit_usd).toFixed(2)}</span>
                  <span className="ml-2 text-muted-foreground">{new Date(a.created_at).toLocaleString()}</span>
                </div>
                {!a.acknowledged_at && <Button size="sm" variant="outline" onClick={() => ackFn({ data: { projectId, id: a.id } }).then(() => qc.invalidateQueries({ queryKey: ["cost-alerts", projectId] }))}>Acknowledge</Button>}
              </div>
            ))}
          </TabsContent>

          <TabsContent value="ledger" className="space-y-2">
            <div className="flex flex-wrap gap-1">
              {Object.entries(s.byModel).map(([m, v]: any) => (
                <Badge key={m} variant="outline">{m} ${v}</Badge>
              ))}
            </div>
            {s.recent.map((r: any) => (
              <div key={r.id} className="flex items-center justify-between rounded-md border border-border/60 p-2 text-xs">
                <span>{r.provider} / {r.model}</span>
                <span className="text-muted-foreground">${Number(r.cost_usd).toFixed(4)} · {r.input_tokens}↑/{r.output_tokens}↓</span>
              </div>
            ))}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
