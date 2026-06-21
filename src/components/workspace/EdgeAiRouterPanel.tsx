// P44 — Edge AI inference router panel.
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  deleteModel, deleteRoute, invocationStats, invokeRoute,
  listModels, listRoutes, upsertModel, upsertRoute,
} from "@/lib/edge-ai-router.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Brain, Trash2, Zap } from "lucide-react";

export function EdgeAiRouterPanel({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const mFn = useServerFn(listModels);
  const upM = useServerFn(upsertModel);
  const delM = useServerFn(deleteModel);
  const rFn = useServerFn(listRoutes);
  const upR = useServerFn(upsertRoute);
  const delR = useServerFn(deleteRoute);
  const invFn = useServerFn(invokeRoute);
  const statsFn = useServerFn(invocationStats);

  const models = useQuery({ queryKey: ["eai-models", projectId], queryFn: () => mFn({ data: { projectId } }) });
  const routes = useQuery({ queryKey: ["eai-routes", projectId], queryFn: () => rFn({ data: { projectId } }) });
  const stats = useQuery({ queryKey: ["eai-stats", projectId], queryFn: () => statsFn({ data: { projectId } }), refetchInterval: 8000 });

  const [model, setModel] = useState({
    slug: "gpt4o-mini", provider: "openai" as const, modelId: "gpt-4o-mini", region: "global",
    status: "active" as const, costInput: 0.15, costOutput: 0.60, avgLatencyMs: 320, contextWindow: 128_000,
    capabilities: "chat,reasoning",
  });
  const [route, setRoute] = useState({
    name: "default-chat", capability: "chat", strategy: "cheapest" as const,
    maxCostPer1k: "", maxLatencyMs: "", enabled: true, fallbackChain: "",
  });
  const [invForm, setInv] = useState({ routeId: "", inputTokens: 800, outputTokens: 400, simulateError: false });

  const saveModel = useMutation({
    mutationFn: () => upM({ data: { projectId, ...model, capabilities: model.capabilities.split(",").map((s) => s.trim()).filter(Boolean) } }),
    onSuccess: () => { toast.success("Model saved"); qc.invalidateQueries({ queryKey: ["eai-models", projectId] }); },
    onError: (e: any) => toast.error(e.message),
  });
  const saveRoute = useMutation({
    mutationFn: () => upR({
      data: {
        projectId, name: route.name, capability: route.capability, strategy: route.strategy,
        weights: {}, fallbackChain: route.fallbackChain.split(",").map((s) => s.trim()).filter(Boolean),
        maxCostPer1k: route.maxCostPer1k ? Number(route.maxCostPer1k) : null,
        maxLatencyMs: route.maxLatencyMs ? Number(route.maxLatencyMs) : null,
        enabled: route.enabled,
      },
    }),
    onSuccess: () => { toast.success("Route saved"); qc.invalidateQueries({ queryKey: ["eai-routes", projectId] }); },
    onError: (e: any) => toast.error(e.message),
  });
  const invoke = useMutation({
    mutationFn: () => invFn({ data: { projectId, ...invForm } }),
    onSuccess: (r: any) => { toast.success(`Routed to ${r.chosen?.slug ?? "?"}`); qc.invalidateQueries({ queryKey: ["eai-stats", projectId] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const s = stats.data ?? { total: 0, success: 0, fallback: 0, errors: 0, avgLatency: 0, totalCost: 0, recent: [] };

  return (
    <Card className="border-border/60">
      <CardHeader className="flex flex-row items-center gap-2">
        <Brain className="h-4 w-4 text-primary" />
        <CardTitle className="text-base">Edge AI router</CardTitle>
        <Badge variant="outline" className="ml-2">P44</Badge>
      </CardHeader>
      <CardContent>
        <div className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-5">
          {[
            ["Invocations", s.total],
            ["Success", s.success],
            ["Fallbacks", s.fallback],
            ["Avg latency", `${s.avgLatency}ms`],
            ["30d cost", `$${s.totalCost}`],
          ].map(([k, v]) => (
            <div key={k as string} className="rounded-lg border border-border/60 bg-muted/30 p-2">
              <div className="text-[10px] uppercase text-muted-foreground">{k}</div>
              <div className="font-display text-lg">{v}</div>
            </div>
          ))}
        </div>

        <Tabs defaultValue="models">
          <TabsList>
            <TabsTrigger value="models">Models</TabsTrigger>
            <TabsTrigger value="routes">Routes</TabsTrigger>
            <TabsTrigger value="invoke">Invoke</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
          </TabsList>

          <TabsContent value="models" className="space-y-3">
            <div className="grid gap-2 md:grid-cols-3">
              <div><Label>Slug</Label><Input value={model.slug} onChange={(e) => setModel({ ...model, slug: e.target.value })} /></div>
              <div><Label>Provider</Label>
                <Select value={model.provider} onValueChange={(v) => setModel({ ...model, provider: v as any })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{["lovable", "openai", "anthropic", "google", "azure", "local", "custom"].map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Model ID</Label><Input value={model.modelId} onChange={(e) => setModel({ ...model, modelId: e.target.value })} /></div>
              <div><Label>$/1k input</Label><Input type="number" step="0.001" value={model.costInput} onChange={(e) => setModel({ ...model, costInput: Number(e.target.value) })} /></div>
              <div><Label>$/1k output</Label><Input type="number" step="0.001" value={model.costOutput} onChange={(e) => setModel({ ...model, costOutput: Number(e.target.value) })} /></div>
              <div><Label>Avg latency (ms)</Label><Input type="number" value={model.avgLatencyMs} onChange={(e) => setModel({ ...model, avgLatencyMs: Number(e.target.value) })} /></div>
              <div className="md:col-span-3"><Label>Capabilities (comma)</Label><Input value={model.capabilities} onChange={(e) => setModel({ ...model, capabilities: e.target.value })} /></div>
            </div>
            <Button onClick={() => saveModel.mutate()} disabled={saveModel.isPending} size="sm">Save model</Button>
            <div className="mt-3 space-y-2">
              {(models.data ?? []).map((m: any) => (
                <div key={m.id} className="flex items-center justify-between rounded-md border border-border/60 p-2 text-sm">
                  <div>
                    <div className="font-medium">{m.slug} <Badge variant="outline" className="ml-1">{m.provider}</Badge></div>
                    <div className="text-xs text-muted-foreground">{m.model_id} · ${m.cost_per_1k_input}/${m.cost_per_1k_output} · {m.avg_latency_ms}ms · {(m.capabilities ?? []).join(", ")}</div>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => delM({ data: { projectId, id: m.id } }).then(() => qc.invalidateQueries({ queryKey: ["eai-models", projectId] }))}><Trash2 className="h-3.5 w-3.5" /></Button>
                </div>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="routes" className="space-y-3">
            <div className="grid gap-2 md:grid-cols-3">
              <div><Label>Name</Label><Input value={route.name} onChange={(e) => setRoute({ ...route, name: e.target.value })} /></div>
              <div><Label>Capability</Label><Input value={route.capability} onChange={(e) => setRoute({ ...route, capability: e.target.value })} /></div>
              <div><Label>Strategy</Label>
                <Select value={route.strategy} onValueChange={(v) => setRoute({ ...route, strategy: v as any })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{["cheapest", "fastest", "weighted", "fallback", "round-robin"].map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Max $/1k</Label><Input value={route.maxCostPer1k} onChange={(e) => setRoute({ ...route, maxCostPer1k: e.target.value })} /></div>
              <div><Label>Max latency ms</Label><Input value={route.maxLatencyMs} onChange={(e) => setRoute({ ...route, maxLatencyMs: e.target.value })} /></div>
              <div className="flex items-center gap-2 pt-5"><Switch checked={route.enabled} onCheckedChange={(v) => setRoute({ ...route, enabled: v })} /><Label>Enabled</Label></div>
              <div className="md:col-span-3"><Label>Fallback chain (slugs, comma)</Label><Input value={route.fallbackChain} onChange={(e) => setRoute({ ...route, fallbackChain: e.target.value })} /></div>
            </div>
            <Button onClick={() => saveRoute.mutate()} disabled={saveRoute.isPending} size="sm">Save route</Button>
            <div className="mt-3 space-y-2">
              {(routes.data ?? []).map((r: any) => (
                <div key={r.id} className="flex items-center justify-between rounded-md border border-border/60 p-2 text-sm">
                  <div>
                    <div className="font-medium">{r.name} <Badge variant="outline" className="ml-1">{r.strategy}</Badge> {!r.enabled && <Badge variant="destructive" className="ml-1">off</Badge>}</div>
                    <div className="text-xs text-muted-foreground">cap: {r.capability} · maxCost: {r.max_cost_per_1k ?? "∞"} · maxLat: {r.max_latency_ms ?? "∞"}</div>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => delR({ data: { projectId, id: r.id } }).then(() => qc.invalidateQueries({ queryKey: ["eai-routes", projectId] }))}><Trash2 className="h-3.5 w-3.5" /></Button>
                </div>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="invoke" className="space-y-3">
            <div className="grid gap-2 md:grid-cols-3">
              <div><Label>Route</Label>
                <Select value={invForm.routeId} onValueChange={(v) => setInv({ ...invForm, routeId: v })}>
                  <SelectTrigger><SelectValue placeholder="Select route" /></SelectTrigger>
                  <SelectContent>{(routes.data ?? []).map((r: any) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Input tokens</Label><Input type="number" value={invForm.inputTokens} onChange={(e) => setInv({ ...invForm, inputTokens: Number(e.target.value) })} /></div>
              <div><Label>Output tokens</Label><Input type="number" value={invForm.outputTokens} onChange={(e) => setInv({ ...invForm, outputTokens: Number(e.target.value) })} /></div>
              <div className="flex items-center gap-2"><Switch checked={invForm.simulateError} onCheckedChange={(v) => setInv({ ...invForm, simulateError: v })} /><Label>Simulate primary failure</Label></div>
            </div>
            <Button onClick={() => invoke.mutate()} disabled={!invForm.routeId || invoke.isPending} size="sm"><Zap className="mr-1 h-3.5 w-3.5" />Invoke</Button>
          </TabsContent>

          <TabsContent value="history" className="space-y-2">
            {s.recent.map((r: any) => (
              <div key={r.id} className="flex items-center justify-between rounded-md border border-border/60 p-2 text-xs">
                <span><Badge variant={r.outcome === "success" ? "outline" : r.outcome === "fallback" ? "secondary" : "destructive"}>{r.outcome}</Badge> {r.capability}</span>
                <span className="text-muted-foreground">{r.latency_ms}ms · ${Number(r.cost).toFixed(4)} · {r.input_tokens}↑/{r.output_tokens}↓</span>
              </div>
            ))}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
