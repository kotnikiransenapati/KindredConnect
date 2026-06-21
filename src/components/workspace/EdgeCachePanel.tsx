import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  listZones, upsertZone, deleteZone, listPurges, createPurge, runPurges,
} from "@/lib/edge-cache.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Globe, Loader2, Play, Trash2, Waves } from "lucide-react";

export function EdgeCachePanel({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const lZones = useServerFn(listZones); const upZone = useServerFn(upsertZone);
  const dZone = useServerFn(deleteZone);
  const lPurges = useServerFn(listPurges); const cPurge = useServerFn(createPurge);
  const rPurges = useServerFn(runPurges);

  const zones = useQuery({ queryKey: ["edge-zones", projectId],
    queryFn: () => lZones({ data: { projectId } }), refetchInterval: 8000 });
  const purges = useQuery({ queryKey: ["edge-purges", projectId],
    queryFn: () => lPurges({ data: { projectId } }), refetchInterval: 6000 });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["edge-zones", projectId] });
    qc.invalidateQueries({ queryKey: ["edge-purges", projectId] });
  };

  const [name, setName] = useState(""); const [host, setHost] = useState("");
  const [ttl, setTtl] = useState(60); const [swr, setSwr] = useState(60);
  const [enabled, setEnabled] = useState(true);

  const createM = useMutation({
    mutationFn: () => upZone({ data: { projectId, name, hostname: host,
      defaultTtl: ttl, swr, enabled } }),
    onSuccess: () => { toast.success("Zone saved"); setName(""); setHost(""); invalidate(); },
    onError: (e: any) => toast.error(e.message),
  });

  const [zoneId, setZoneId] = useState<string>("");
  const [scope, setScope] = useState<"paths"|"prefix"|"tag"|"everything">("paths");
  const [targets, setTargets] = useState("");

  const purgeM = useMutation({
    mutationFn: () => cPurge({ data: { projectId, zoneId, scope,
      targets: scope === "everything" ? [] : targets.split(/\r?\n/).map(s => s.trim()).filter(Boolean) } }),
    onSuccess: () => { toast.success("Purge queued"); setTargets(""); invalidate(); },
    onError: (e: any) => toast.error(e.message),
  });

  const runM = useMutation({
    mutationFn: () => rPurges({ data: { projectId, batch: 20 } }),
    onSuccess: (r) => { toast.success(`Processed ${r.processed}`); invalidate(); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2"><Globe className="h-4 w-4 text-sky-500" />Edge Cache & CDN</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">Multi-region cache zones with auditable purge pipeline</p>
        </div>
        <Button size="sm" onClick={() => runM.mutate()} disabled={runM.isPending}>
          {runM.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
          <span className="ml-2">Run purges</span>
        </Button>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="zones">
          <TabsList>
            <TabsTrigger value="zones">Zones</TabsTrigger>
            <TabsTrigger value="purge">Purge</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
          </TabsList>

          <TabsContent value="zones" className="space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2 items-end">
              <div><Label className="text-xs">Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
              <div className="md:col-span-2"><Label className="text-xs">Hostname</Label><Input value={host} onChange={(e) => setHost(e.target.value)} placeholder="app.example.com" /></div>
              <div><Label className="text-xs">TTL (s)</Label><Input type="number" value={ttl} onChange={(e) => setTtl(Number(e.target.value) || 0)} /></div>
              <div><Label className="text-xs">SWR (s)</Label><Input type="number" value={swr} onChange={(e) => setSwr(Number(e.target.value) || 0)} /></div>
              <div className="flex items-center gap-2"><Switch checked={enabled} onCheckedChange={setEnabled} /><span className="text-xs">Enabled</span></div>
              <Button size="sm" onClick={() => createM.mutate()} disabled={createM.isPending || !name || !host}>
                {createM.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save zone"}
              </Button>
            </div>
            <div className="space-y-1">
              {(zones.data ?? []).map((z: any) => (
                <div key={z.id} className="flex items-center justify-between border rounded p-2 text-xs">
                  <div>
                    <div className="font-semibold">{z.name} <span className="font-mono text-muted-foreground">{z.hostname}</span></div>
                    <div className="text-muted-foreground">TTL {z.default_ttl_seconds}s • SWR {z.stale_while_revalidate_seconds}s</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={z.enabled ? "default" : "outline"}>{z.enabled ? "live" : "off"}</Badge>
                    <Button size="icon" variant="ghost" onClick={() => dZone({ data: { projectId, zoneId: z.id } }).then(invalidate)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
              {(zones.data ?? []).length === 0 && <p className="text-xs text-muted-foreground">No zones.</p>}
            </div>
          </TabsContent>

          <TabsContent value="purge" className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Zone</Label>
                <Select value={zoneId} onValueChange={setZoneId}>
                  <SelectTrigger><SelectValue placeholder="Select a zone" /></SelectTrigger>
                  <SelectContent>
                    {(zones.data ?? []).map((z: any) => <SelectItem key={z.id} value={z.id}>{z.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Scope</Label>
                <Select value={scope} onValueChange={(v) => setScope(v as any)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["paths","prefix","tag","everything"].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {scope !== "everything" && (
              <Textarea rows={4} placeholder={scope === "tag" ? "homepage\nproduct-list" : "/index.html\n/assets/app.js"}
                value={targets} onChange={(e) => setTargets(e.target.value)} />
            )}
            <Button size="sm" onClick={() => purgeM.mutate()} disabled={purgeM.isPending || !zoneId}>
              {purgeM.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Waves className="h-4 w-4 mr-2" />}
              Queue purge
            </Button>
          </TabsContent>

          <TabsContent value="history" className="space-y-1 max-h-80 overflow-y-auto">
            {(purges.data ?? []).map((p: any) => (
              <div key={p.id} className="flex items-center justify-between border rounded p-2 text-xs">
                <div>
                  <div className="font-semibold">{p.scope} • {p.purged_count} target(s)</div>
                  <div className="text-muted-foreground">{new Date(p.created_at).toLocaleString()}</div>
                  {p.detail && <div className="text-muted-foreground">{p.detail}</div>}
                </div>
                <Badge variant={p.status === "succeeded" ? "default" : p.status === "failed" ? "destructive" : "secondary"}>
                  {p.status}
                </Badge>
              </div>
            ))}
            {(purges.data ?? []).length === 0 && <p className="text-xs text-muted-foreground">No purges yet.</p>}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
