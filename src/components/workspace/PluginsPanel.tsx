// P49 — Sandboxed plugin runtime panel.
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  deletePlugin, installPlugin, invokePlugin, listInstallations, listInvocations, listPlugins,
  registerPlugin, setPluginStatus, toggleInstallation, uninstallPlugin,
} from "@/lib/plugins.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Puzzle, Trash2, Play } from "lucide-react";
import { toast } from "sonner";

const statusTone: Record<string, string> = {
  draft: "border-muted bg-muted/40 text-muted-foreground",
  approved: "border-emerald-500/40 bg-emerald-500/10 text-emerald-600",
  suspended: "border-amber-500/40 bg-amber-500/10 text-amber-600",
  revoked: "bg-destructive text-destructive-foreground",
};

const ALL_PERMS = ["files:read", "files:write", "secrets:read", "deploy:trigger", "ai:invoke", "db:read", "db:write", "network:fetch", "ui:render", "analytics:read"];

export function PluginsPanel({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const pFn = useServerFn(listPlugins);
  const regFn = useServerFn(registerPlugin);
  const stFn = useServerFn(setPluginStatus);
  const dFn = useServerFn(deletePlugin);
  const iFn = useServerFn(listInstallations);
  const insFn = useServerFn(installPlugin);
  const tFn = useServerFn(toggleInstallation);
  const unFn = useServerFn(uninstallPlugin);
  const invFn = useServerFn(invokePlugin);
  const histFn = useServerFn(listInvocations);

  const plugins = useQuery({ queryKey: ["plg", projectId], queryFn: () => pFn({ data: { projectId } }) });
  const installs = useQuery({ queryKey: ["plg-i", projectId], queryFn: () => iFn({ data: { projectId } }) });
  const history = useQuery({ queryKey: ["plg-h", projectId], queryFn: () => histFn({ data: { projectId } }), refetchInterval: 10_000 });

  const [reg, setReg] = useState({
    slug: "slack-notify", name: "Slack notify", version: "0.1.0", publisher: "internal",
    entryUrl: "https://example.com/plugin.js", permissions: ["network:fetch"] as string[],
  });
  const [inst, setInst] = useState({ pluginId: "", grantedPermissions: [] as string[] });
  const [inv, setInv] = useState({ installationId: "", action: "ping", requiredPermissions: ["network:fetch"] as string[] });

  const togglePerm = (set: string[], p: string, on: boolean) => on ? Array.from(new Set([...set, p])) : set.filter((x) => x !== p);

  const register = useMutation({
    mutationFn: () => regFn({ data: { projectId, ...reg, manifest: {} } }),
    onSuccess: () => { toast.success("Plugin registered"); qc.invalidateQueries({ queryKey: ["plg", projectId] }); },
    onError: (e: any) => toast.error(e.message),
  });
  const install = useMutation({
    mutationFn: () => insFn({ data: { projectId, ...inst, config: {} } }),
    onSuccess: () => { toast.success("Installed"); qc.invalidateQueries({ queryKey: ["plg-i", projectId] }); },
    onError: (e: any) => toast.error(e.message),
  });
  const invoke = useMutation({
    mutationFn: () => invFn({ data: { projectId, ...inv } }),
    onSuccess: (r: any) => { toast.success(`Plugin ran in ${r.invocation.duration_ms}ms`); qc.invalidateQueries({ queryKey: ["plg-h", projectId] }); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Card className="border-border/60">
      <CardHeader className="flex flex-row items-center gap-2">
        <Puzzle className="h-4 w-4 text-primary" />
        <CardTitle className="text-base">Plugin runtime</CardTitle>
        <Badge variant="outline" className="ml-2">P49</Badge>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="catalog">
          <TabsList>
            <TabsTrigger value="catalog">Catalog</TabsTrigger>
            <TabsTrigger value="register">Register</TabsTrigger>
            <TabsTrigger value="install">Installed</TabsTrigger>
            <TabsTrigger value="invoke">Invoke</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
          </TabsList>

          <TabsContent value="catalog" className="space-y-2">
            {(plugins.data ?? []).map((p: any) => (
              <div key={p.id} className="rounded-md border border-border/60 p-2 text-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-medium">{p.name}</span>
                    <span className="ml-2 text-xs text-muted-foreground">{p.slug}@{p.version} · {p.publisher}</span>
                    <span className={`ml-2 rounded border px-1.5 py-0.5 text-[10px] uppercase ${statusTone[p.status]}`}>{p.status}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Select value={p.status} onValueChange={(v) => stFn({ data: { projectId, id: p.id, status: v as any } }).then(() => qc.invalidateQueries({ queryKey: ["plg", projectId] }))}>
                      <SelectTrigger className="w-[120px] h-8"><SelectValue /></SelectTrigger>
                      <SelectContent>{["draft", "approved", "suspended", "revoked"].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                    </Select>
                    <Button size="sm" variant="ghost" onClick={() => dFn({ data: { projectId, id: p.id } }).then(() => qc.invalidateQueries({ queryKey: ["plg", projectId] }))}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </div>
                </div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {(p.permissions ?? []).map((perm: string) => <Badge key={perm} variant="outline" className="text-[10px]">{perm}</Badge>)}
                </div>
              </div>
            ))}
          </TabsContent>

          <TabsContent value="register" className="space-y-3">
            <div className="grid gap-2 md:grid-cols-3">
              <div><Label>Slug</Label><Input value={reg.slug} onChange={(e) => setReg({ ...reg, slug: e.target.value })} /></div>
              <div><Label>Name</Label><Input value={reg.name} onChange={(e) => setReg({ ...reg, name: e.target.value })} /></div>
              <div><Label>Version</Label><Input value={reg.version} onChange={(e) => setReg({ ...reg, version: e.target.value })} /></div>
              <div><Label>Publisher</Label><Input value={reg.publisher} onChange={(e) => setReg({ ...reg, publisher: e.target.value })} /></div>
              <div className="md:col-span-2"><Label>Entry URL (https://)</Label><Input value={reg.entryUrl} onChange={(e) => setReg({ ...reg, entryUrl: e.target.value })} /></div>
            </div>
            <div>
              <Label>Declared permissions</Label>
              <div className="mt-1 flex flex-wrap gap-2">
                {ALL_PERMS.map((p) => (
                  <label key={p} className="flex items-center gap-1.5 text-xs">
                    <Switch checked={reg.permissions.includes(p)} onCheckedChange={(v) => setReg({ ...reg, permissions: togglePerm(reg.permissions, p, v) })} />
                    {p}
                  </label>
                ))}
              </div>
            </div>
            <Button size="sm" onClick={() => register.mutate()} disabled={register.isPending}>Register</Button>
          </TabsContent>

          <TabsContent value="install" className="space-y-3">
            <div className="grid gap-2 md:grid-cols-2">
              <div><Label>Plugin</Label>
                <Select value={inst.pluginId} onValueChange={(v) => setInst({ ...inst, pluginId: v, grantedPermissions: [] })}>
                  <SelectTrigger><SelectValue placeholder="Select plugin" /></SelectTrigger>
                  <SelectContent>{(plugins.data ?? []).filter((p: any) => p.status === "approved").map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name} @{p.version}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Grant permissions (from manifest)</Label>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {((plugins.data ?? []).find((p: any) => p.id === inst.pluginId)?.permissions ?? []).map((p: string) => (
                    <label key={p} className="flex items-center gap-1 text-xs">
                      <Switch checked={inst.grantedPermissions.includes(p)} onCheckedChange={(v) => setInst({ ...inst, grantedPermissions: togglePerm(inst.grantedPermissions, p, v) })} />
                      {p}
                    </label>
                  ))}
                </div>
              </div>
            </div>
            <Button size="sm" onClick={() => install.mutate()} disabled={!inst.pluginId || install.isPending}>Install</Button>
            <div className="space-y-2">
              {(installs.data ?? []).map((i: any) => (
                <div key={i.id} className="flex items-center justify-between rounded-md border border-border/60 p-2 text-sm">
                  <div>
                    <span className="font-medium">{i.plugin?.name}</span>
                    <span className="ml-2 text-xs text-muted-foreground">{i.plugin?.slug}@{i.plugin?.version}</span>
                    <div className="mt-0.5 flex flex-wrap gap-1">
                      {(i.granted_permissions ?? []).map((p: string) => <Badge key={p} variant="outline" className="text-[10px]">{p}</Badge>)}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch checked={i.enabled} onCheckedChange={(v) => tFn({ data: { projectId, id: i.id, enabled: v } }).then(() => qc.invalidateQueries({ queryKey: ["plg-i", projectId] }))} />
                    <Button size="sm" variant="ghost" onClick={() => unFn({ data: { projectId, id: i.id } }).then(() => qc.invalidateQueries({ queryKey: ["plg-i", projectId] }))}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="invoke" className="space-y-3">
            <div className="grid gap-2 md:grid-cols-2">
              <div><Label>Installation</Label>
                <Select value={inv.installationId} onValueChange={(v) => setInv({ ...inv, installationId: v })}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>{(installs.data ?? []).filter((i: any) => i.enabled).map((i: any) => <SelectItem key={i.id} value={i.id}>{i.plugin?.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Action</Label><Input value={inv.action} onChange={(e) => setInv({ ...inv, action: e.target.value })} /></div>
            </div>
            <div>
              <Label>Required permissions</Label>
              <div className="mt-1 flex flex-wrap gap-2">
                {ALL_PERMS.map((p) => (
                  <label key={p} className="flex items-center gap-1 text-xs">
                    <Switch checked={inv.requiredPermissions.includes(p)} onCheckedChange={(v) => setInv({ ...inv, requiredPermissions: togglePerm(inv.requiredPermissions, p, v) })} />
                    {p}
                  </label>
                ))}
              </div>
            </div>
            <Button size="sm" onClick={() => invoke.mutate()} disabled={!inv.installationId || invoke.isPending}><Play className="mr-1 h-3.5 w-3.5" />Invoke</Button>
          </TabsContent>

          <TabsContent value="history" className="space-y-2">
            {(history.data ?? []).map((h: any) => (
              <div key={h.id} className="flex items-center justify-between rounded-md border border-border/60 p-2 text-xs">
                <div>
                  <Badge variant={h.outcome === "success" ? "outline" : "destructive"}>{h.outcome}</Badge>
                  <span className="ml-2 font-medium">{h.action}</span>
                  {h.error_message && <span className="ml-2 text-destructive">{h.error_message}</span>}
                </div>
                <span className="text-muted-foreground">{h.duration_ms}ms · {new Date(h.created_at).toLocaleString()}</span>
              </div>
            ))}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
