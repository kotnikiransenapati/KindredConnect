import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  evaluatePolicy, listEvents, listPolicies, listRegions,
  recordHealthCheck, upsertPolicy, upsertRegion,
} from "@/lib/failover.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Activity, Globe2, Shuffle } from "lucide-react";

const statusTone: Record<string, string> = {
  healthy: "border-emerald-500/40 bg-emerald-500/10 text-emerald-600",
  degraded: "border-amber-500/40 bg-amber-500/10 text-amber-600",
  down: "bg-destructive text-destructive-foreground",
  draining: "border-muted bg-muted/60 text-muted-foreground",
};

export function FailoverPanel({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const rFn = useServerFn(listRegions);
  const upR = useServerFn(upsertRegion);
  const hc = useServerFn(recordHealthCheck);
  const pFn = useServerFn(listPolicies);
  const upP = useServerFn(upsertPolicy);
  const evalFn = useServerFn(evaluatePolicy);
  const evFn = useServerFn(listEvents);

  const regions = useQuery({ queryKey: ["fo-regions", projectId], queryFn: () => rFn({ data: { projectId } }), refetchInterval: 15_000 });
  const policies = useQuery({ queryKey: ["fo-policies", projectId], queryFn: () => pFn({ data: { projectId } }), refetchInterval: 30_000 });
  const events = useQuery({ queryKey: ["fo-events", projectId], queryFn: () => evFn({ data: { projectId } }), refetchInterval: 10_000 });

  const [region, setRegion] = useState({ code: "us-east-1", displayName: "US East (Virginia)", role: "primary" as const, status: "healthy" as const, latencyMs: 35 });
  const [hcForm, setHc] = useState({ regionId: "", status: "degraded" as const, latencyMs: 240 });
  const [policy, setPolicy] = useState({ name: "Global active-passive", strategy: "active-passive" as const, healthThreshold: 2, cooldownMinutes: 5, enabled: true });
  const [evalId, setEvalId] = useState("");

  const saveRegion = useMutation({
    mutationFn: () => upR({ data: { projectId, ...region } }),
    onSuccess: () => { toast.success("Region saved"); qc.invalidateQueries({ queryKey: ["fo-regions", projectId] }); },
    onError: (e: any) => toast.error(e.message),
  });
  const recordHc = useMutation({
    mutationFn: () => hc({ data: { projectId, ...hcForm } }),
    onSuccess: () => { toast.success("Health check recorded"); qc.invalidateQueries({ queryKey: ["fo-regions", projectId] }); qc.invalidateQueries({ queryKey: ["fo-events", projectId] }); },
    onError: (e: any) => toast.error(e.message),
  });
  const savePolicy = useMutation({
    mutationFn: () => upP({ data: { projectId, ...policy, trafficWeights: {} } }),
    onSuccess: () => { toast.success("Policy saved"); qc.invalidateQueries({ queryKey: ["fo-policies", projectId] }); },
    onError: (e: any) => toast.error(e.message),
  });
  const evalNow = useMutation({
    mutationFn: (apply: boolean) => evalFn({ data: { projectId, policyId: evalId, apply } }),
    onSuccess: (r: any) => { toast.success(`Plan: ${r.action} — ${r.reason}`); qc.invalidateQueries({ queryKey: ["fo-regions", projectId] }); qc.invalidateQueries({ queryKey: ["fo-events", projectId] }); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2"><Globe2 className="h-4 w-4" /> Multi-Region Failover</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <Tabs defaultValue="regions">
          <TabsList>
            <TabsTrigger value="regions">Regions</TabsTrigger>
            <TabsTrigger value="policies">Policies</TabsTrigger>
            <TabsTrigger value="events"><Activity className="mr-1 h-3 w-3" />Events</TabsTrigger>
          </TabsList>

          <TabsContent value="regions" className="space-y-2">
            <div className="grid gap-2 md:grid-cols-2">
              {(regions.data ?? []).map((r: any) => (
                <div key={r.id} className="rounded-md border p-2 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="font-mono">{r.code}</span>
                    <Badge variant="outline">{r.role}</Badge>
                    <Badge variant="outline" className={statusTone[r.status]}>{r.status}</Badge>
                    <span className="ml-auto text-xs text-muted-foreground">{r.latency_ms}ms</span>
                  </div>
                  <div className="text-xs text-muted-foreground">{r.display_name}</div>
                </div>
              ))}
            </div>
            <div className="grid gap-2 rounded-md border p-2 md:grid-cols-3">
              <Input placeholder="code" value={region.code} onChange={e => setRegion(s => ({ ...s, code: e.target.value }))} />
              <Input placeholder="display name" value={region.displayName} onChange={e => setRegion(s => ({ ...s, displayName: e.target.value }))} />
              <Select value={region.role} onValueChange={(v: any) => setRegion(s => ({ ...s, role: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{["primary","replica","standby","observer"].map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
              </Select>
              <Select value={region.status} onValueChange={(v: any) => setRegion(s => ({ ...s, status: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{["healthy","degraded","down","draining"].map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
              </Select>
              <Input type="number" value={region.latencyMs} onChange={e => setRegion(s => ({ ...s, latencyMs: Number(e.target.value) }))} />
              <Button onClick={() => saveRegion.mutate()}>Save region</Button>
            </div>
            <div className="grid gap-2 rounded-md border p-2 md:grid-cols-4">
              <Select value={hcForm.regionId} onValueChange={v => setHc(s => ({ ...s, regionId: v }))}>
                <SelectTrigger><SelectValue placeholder="region" /></SelectTrigger>
                <SelectContent>{(regions.data ?? []).map((r: any) => <SelectItem key={r.id} value={r.id}>{r.code}</SelectItem>)}</SelectContent>
              </Select>
              <Select value={hcForm.status} onValueChange={(v: any) => setHc(s => ({ ...s, status: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{["healthy","degraded","down","draining"].map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
              </Select>
              <Input type="number" value={hcForm.latencyMs} onChange={e => setHc(s => ({ ...s, latencyMs: Number(e.target.value) }))} />
              <Button variant="outline" onClick={() => recordHc.mutate()} disabled={!hcForm.regionId}><Activity className="mr-1 h-3 w-3" />Record</Button>
            </div>
          </TabsContent>

          <TabsContent value="policies" className="space-y-2">
            <div className="grid gap-2 rounded-md border p-2 md:grid-cols-3">
              <Input value={policy.name} onChange={e => setPolicy(s => ({ ...s, name: e.target.value }))} placeholder="name" />
              <Select value={policy.strategy} onValueChange={(v: any) => setPolicy(s => ({ ...s, strategy: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{["active-active","active-passive","geo","weighted"].map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
              </Select>
              <Input type="number" value={policy.healthThreshold} onChange={e => setPolicy(s => ({ ...s, healthThreshold: Number(e.target.value) }))} />
              <Input type="number" value={policy.cooldownMinutes} onChange={e => setPolicy(s => ({ ...s, cooldownMinutes: Number(e.target.value) }))} />
              <div className="flex items-center gap-2"><Switch checked={policy.enabled} onCheckedChange={v => setPolicy(s => ({ ...s, enabled: v }))} /><Label>Enabled</Label></div>
              <Button onClick={() => savePolicy.mutate()}>Save policy</Button>
            </div>
            {(policies.data ?? []).map((p: any) => (
              <div key={p.id} className="flex items-center gap-2 rounded-md border p-2 text-sm">
                <span className="font-medium">{p.name}</span>
                <Badge variant="outline">{p.strategy}</Badge>
                <Badge variant={p.enabled ? "default" : "outline"}>{p.enabled ? "on" : "off"}</Badge>
                <span className="ml-auto flex gap-1">
                  <Button size="sm" variant="outline" onClick={() => { setEvalId(p.id); evalNow.mutate(false); }}>Evaluate</Button>
                  <Button size="sm" onClick={() => { setEvalId(p.id); evalNow.mutate(true); }}><Shuffle className="mr-1 h-3 w-3" />Apply</Button>
                </span>
              </div>
            ))}
          </TabsContent>

          <TabsContent value="events" className="space-y-1">
            {(events.data ?? []).map((e: any) => (
              <div key={e.id} className="rounded-md border p-2 text-xs">
                <div className="flex gap-2">
                  <Badge variant="outline">{e.kind}</Badge>
                  <span className="text-muted-foreground">{new Date(e.created_at).toLocaleString()}</span>
                  {e.from_region && <span>{e.from_region} → {e.to_region ?? "—"}</span>}
                </div>
                <div className="text-muted-foreground">{e.reason}</div>
              </div>
            ))}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
