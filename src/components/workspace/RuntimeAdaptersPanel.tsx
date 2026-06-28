import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { applyRuntimeAdaptersToIr, checkRuntimeAdapterConfig, getRuntimeAdapters, saveRuntimeAdapterConfig } from "@/lib/runtime-adapters.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Database, KeyRound, Link2, RefreshCw, Shield, Smartphone, Workflow } from "lucide-react";
import { toast } from "sonner";

type Category = "auth" | "database";

export function RuntimeAdaptersPanel({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const getFn = useServerFn(getRuntimeAdapters);
  const saveFn = useServerFn(saveRuntimeAdapterConfig);
  const checkFn = useServerFn(checkRuntimeAdapterConfig);
  const applyFn = useServerFn(applyRuntimeAdaptersToIr);
  const [category, setCategory] = useState<Category>("auth");
  const [provider, setProvider] = useState("lovable-cloud-auth");
  const [secrets, setSecrets] = useState("");

  const adaptersQ = useQuery({ queryKey: ["runtime-adapters", projectId], queryFn: () => getFn({ data: { projectId } }), refetchInterval: 20_000 });
  const catalog = adaptersQ.data?.catalog ?? [];
  const options = useMemo(() => catalog.filter((adapter: any) => adapter.category === category), [catalog, category]);
  const selected = options.find((adapter: any) => adapter.provider === provider) ?? options[0];
  const configs = adaptersQ.data?.configs ?? [];

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["runtime-adapters", projectId] });
    qc.invalidateQueries({ queryKey: ["project-ir", projectId] });
  };

  const saveM = useMutation({
    mutationFn: () => saveFn({ data: { projectId, category, provider: selected?.provider ?? provider, config: selected?.configDefaults ?? {}, secretRefs: secrets.split(/[,\s]+/).map((s) => s.trim()).filter(Boolean) } }),
    onSuccess: (r) => { toast.success(`Adapter saved: ${r.status}`); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const checkM = useMutation({
    mutationFn: (cat: Category) => checkFn({ data: { projectId, category: cat } }),
    onSuccess: (r) => { toast.success(`Health: ${r.status}`); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const applyM = useMutation({
    mutationFn: () => applyFn({ data: { projectId } }),
    onSuccess: (r) => { toast.success(`Synced adapters into IR v${r.version}`); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card className="border-border/60 bg-card/50">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          <Workflow className="size-4" /> Portable Runtime Adapters
          <Badge variant="outline" className="text-[10px]">C1 auth</Badge>
          <Badge variant="outline" className="text-[10px]">C2 database</Badge>
          <Button size="sm" variant="outline" className="ml-auto" onClick={() => applyM.mutate()} disabled={applyM.isPending}>
            <Link2 className="mr-1 size-3.5" /> Sync to IR
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2 md:grid-cols-4">
          <Metric label="Configured" value={String(configs.length)} />
          <Metric label="Healthy" value={String(configs.filter((c: any) => c.status === "healthy" || c.status === "configured").length)} />
          <Metric label="Auth options" value={String(catalog.filter((c: any) => c.category === "auth").length)} />
          <Metric label="DB options" value={String(catalog.filter((c: any) => c.category === "database").length)} />
        </div>

        <Tabs value={category} onValueChange={(v) => { const next = v as Category; setCategory(next); const first = catalog.find((a: any) => a.category === next); if (first) setProvider(first.provider); }}>
          <TabsList>
            <TabsTrigger value="auth"><KeyRound className="mr-1 size-3.5" /> Auth</TabsTrigger>
            <TabsTrigger value="database"><Database className="mr-1 size-3.5" /> Database</TabsTrigger>
          </TabsList>
          <TabsContent value={category} className="space-y-3">
            <div className="grid gap-3 rounded-lg border border-border/60 bg-background/40 p-3 md:grid-cols-[240px_1fr]">
              <div className="space-y-2">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Provider</div>
                <Select value={selected?.provider ?? provider} onValueChange={setProvider}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{options.map((adapter: any) => <SelectItem key={adapter.provider} value={adapter.provider}>{adapter.displayName}</SelectItem>)}</SelectContent>
                </Select>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Secret refs</div>
                <Input value={secrets} onChange={(e) => setSecrets(e.target.value)} placeholder={(selected?.requiredSecretRefs ?? []).join(", ") || "No secrets required"} />
                <Button size="sm" onClick={() => saveM.mutate()} disabled={!selected || saveM.isPending}>Save adapter</Button>
              </div>
              {selected ? (
                <div className="space-y-3">
                  <div>
                    <div className="flex items-center gap-2"><span className="font-medium">{selected.displayName}</span><Badge variant="secondary">score {selected.score}</Badge></div>
                    <p className="mt-1 text-sm text-muted-foreground">{selected.description}</p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">{selected.capabilities.map((cap: string) => <Badge key={cap} variant="outline" className="text-[10px]">{cap}</Badge>)}</div>
                  <div className="grid gap-2 sm:grid-cols-3">
                    <Ready flag={selected.edgeReady} label="Edge" />
                    <Ready flag={selected.nativeReady} label="iOS/Android" icon="native" />
                    <Ready flag={selected.selfHostReady} label="Self-host" />
                  </div>
                </div>
              ) : <p className="text-sm text-muted-foreground">No provider available.</p>}
            </div>
          </TabsContent>
        </Tabs>

        <div className="grid gap-2 lg:grid-cols-2">
          {configs.map((config: any) => (
            <div key={config.id} className="rounded-lg border border-border/60 bg-background/40 p-3">
              <div className="flex items-center gap-2">
                <Badge variant="outline">{config.category}</Badge>
                <span className="text-sm font-medium">{config.display_name}</span>
                <Badge variant={config.status === "healthy" || config.status === "configured" ? "default" : "secondary"} className="ml-auto">{config.status}</Badge>
              </div>
              <div className="mt-2 text-xs text-muted-foreground">Provider: <code>{config.provider}</code> · score {config.score}</div>
              <div className="mt-2 flex flex-wrap gap-1">{(config.capabilities ?? []).slice(0, 7).map((cap: string) => <Badge key={cap} variant="outline" className="text-[10px]">{cap}</Badge>)}</div>
              <Button size="sm" variant="outline" className="mt-3" onClick={() => checkM.mutate(config.category)} disabled={checkM.isPending}><RefreshCw className="mr-1 size-3" /> Health check</Button>
            </div>
          ))}
          {!configs.length && <p className="text-sm text-muted-foreground">No runtime adapters configured yet.</p>}
        </div>

        <div className="rounded-lg border border-border/60 bg-muted/20 p-3 text-xs text-muted-foreground">
          Latest audits: {(adaptersQ.data?.audits ?? []).map((audit: any) => audit.summary).join(" · ") || "No adapter audit events yet."}
        </div>
      </CardContent>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border border-border/60 bg-background/40 p-2"><div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div><div className="text-lg font-semibold">{value}</div></div>;
}

function Ready({ flag, label, icon }: { flag: boolean; label: string; icon?: "native" }) {
  return <div className="flex items-center gap-2 rounded-md border border-border/60 p-2 text-xs">{icon === "native" ? <Smartphone className="size-3.5" /> : <Shield className="size-3.5" />}<span>{label}</span><Badge variant={flag ? "default" : "outline"} className="ml-auto text-[10px]">{flag ? "ready" : "limited"}</Badge></div>;
}