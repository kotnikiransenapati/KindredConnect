import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  registerClient, listClients, revokeClient,
  publishBundle, listBundles, listEvents, ackReload,
} from "@/lib/hot-reload.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Zap, Smartphone, Send, RotateCw, Trash2, Apple, Monitor, Copy } from "lucide-react";
import { toast } from "sonner";

const STATUS_COLOR: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  connected: "default", reloading: "secondary", idle: "outline",
  disconnected: "outline", error: "destructive",
};

function PlatformIcon({ p }: { p: string }) {
  if (p === "ios") return <Apple className="h-3.5 w-3.5" />;
  if (p === "android") return <Smartphone className="h-3.5 w-3.5" />;
  return <Monitor className="h-3.5 w-3.5" />;
}

export function HotReloadPanel({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const _reg = useServerFn(registerClient);
  const _list = useServerFn(listClients);
  const _rev = useServerFn(revokeClient);
  const _pub = useServerFn(publishBundle);
  const _bundles = useServerFn(listBundles);
  const _events = useServerFn(listEvents);
  const _ack = useServerFn(ackReload);

  const clientsQ = useQuery({ queryKey: ["hr-clients", projectId], queryFn: () => _list({ data: { projectId } }), refetchInterval: 10000 });
  const bundlesQ = useQuery({ queryKey: ["hr-bundles", projectId], queryFn: () => _bundles({ data: { projectId } }) });
  const eventsQ = useQuery({ queryKey: ["hr-events", projectId], queryFn: () => _events({ data: { projectId } }), refetchInterval: 8000 });

  const [platform, setPlatform] = useState<"ios" | "android" | "web">("ios");
  const [label, setLabel] = useState("");
  const [revealToken, setRevealToken] = useState<string | null>(null);

  const regM = useMutation({
    mutationFn: () => _reg({ data: { projectId, platform, deviceLabel: label || undefined } }),
    onSuccess: (r: any) => {
      setRevealToken(r.token);
      setTimeout(() => setRevealToken(null), 60000);
      qc.invalidateQueries({ queryKey: ["hr-clients", projectId] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const [kind, setKind] = useState<"full" | "delta" | "asset">("delta");
  const [bundleUrl, setBundleUrl] = useState("");
  const [checksum, setChecksum] = useState("");
  const [size, setSize] = useState(0);
  const [paths, setPaths] = useState("");
  const [notes, setNotes] = useState("");

  const pubM = useMutation({
    mutationFn: () => _pub({ data: {
      projectId, kind, bundleUrl: bundleUrl || undefined,
      checksum, sizeBytes: size,
      changedPaths: paths.split(/\r?\n/).map((s) => s.trim()).filter(Boolean),
      notes: notes || undefined,
    }}),
    onSuccess: () => {
      toast.success("Bundle published");
      qc.invalidateQueries({ queryKey: ["hr-bundles", projectId] });
      qc.invalidateQueries({ queryKey: ["hr-events", projectId] });
      setChecksum(""); setSize(0); setPaths(""); setNotes("");
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Card className="mt-4">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2"><Zap className="h-4 w-4" /> Hot-reload bridge</CardTitle>
        <div className="flex gap-2 text-xs">
          <Badge variant="outline">{clientsQ.data?.filter((c: any) => c.status === "connected").length ?? 0} live</Badge>
          <Badge variant="outline">seq {bundlesQ.data?.[0]?.seq ?? 0}</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="clients">
          <TabsList>
            <TabsTrigger value="clients">Devices</TabsTrigger>
            <TabsTrigger value="push">Push bundle</TabsTrigger>
            <TabsTrigger value="bundles">Bundles</TabsTrigger>
            <TabsTrigger value="events">Events</TabsTrigger>
          </TabsList>

          <TabsContent value="clients" className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-2 items-end">
              <div>
                <Label>Platform</Label>
                <select className="border rounded h-9 px-2 w-full bg-background" value={platform} onChange={(e) => setPlatform(e.target.value as any)}>
                  <option value="ios">iOS</option><option value="android">Android</option><option value="web">Web</option>
                </select>
              </div>
              <div className="md:col-span-2"><Label>Device label</Label><Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Pixel 8 — QA" /></div>
              <Button disabled={regM.isPending} onClick={() => regM.mutate()}>Pair device</Button>
            </div>
            {revealToken && (
              <div className="border rounded p-2 text-xs bg-amber-500/10 flex items-center justify-between gap-2">
                <code className="break-all">{revealToken}</code>
                <Button size="icon" variant="ghost" onClick={() => { navigator.clipboard.writeText(revealToken); toast.success("Token copied"); }}>
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}
            <div className="space-y-1">
              {(clientsQ.data ?? []).map((c: any) => (
                <div key={c.id} className="flex items-center justify-between border rounded p-2 text-sm">
                  <div className="flex items-center gap-2">
                    <PlatformIcon p={c.platform} />
                    <span className="font-mono">{c.device_label ?? c.id.slice(0, 8)}</span>
                    <Badge variant={STATUS_COLOR[c.status] ?? "outline"}>{c.status}</Badge>
                    <span className="text-xs text-muted-foreground">seq {c.last_seq}</span>
                  </div>
                  <div className="flex gap-1">
                    {bundlesQ.data?.[0] && (
                      <Button size="sm" variant="outline" onClick={() => _ack({ data: {
                        clientId: c.id, projectId, bundleId: bundlesQ.data[0].id, status: "reloading", detail: "manual ack",
                      }}).then(() => qc.invalidateQueries({ queryKey: ["hr-clients", projectId] }))}>
                        <RotateCw className="h-3 w-3 mr-1" />Reload
                      </Button>
                    )}
                    <Button size="icon" variant="ghost" onClick={() => _rev({ data: { id: c.id, projectId } }).then(() => qc.invalidateQueries({ queryKey: ["hr-clients", projectId] }))}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
              {!clientsQ.data?.length && <div className="text-xs text-muted-foreground">No paired devices.</div>}
            </div>
          </TabsContent>

          <TabsContent value="push" className="space-y-2">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              <div>
                <Label>Kind</Label>
                <select className="border rounded h-9 px-2 w-full bg-background" value={kind} onChange={(e) => setKind(e.target.value as any)}>
                  <option value="delta">delta</option><option value="full">full</option><option value="asset">asset</option>
                </select>
              </div>
              <div className="md:col-span-2"><Label>Bundle URL (optional)</Label><Input value={bundleUrl} onChange={(e) => setBundleUrl(e.target.value)} placeholder="https://cdn/…/main.jsbundle" /></div>
              <div><Label>Checksum (hex)</Label><Input value={checksum} onChange={(e) => setChecksum(e.target.value)} placeholder="sha256 hex" /></div>
              <div><Label>Size (bytes)</Label><Input type="number" value={size} onChange={(e) => setSize(Number(e.target.value))} /></div>
              <div className="md:col-span-3"><Label>Changed paths (one per line)</Label><Textarea rows={3} value={paths} onChange={(e) => setPaths(e.target.value)} className="font-mono text-xs" /></div>
              <div className="md:col-span-3"><Label>Notes</Label><Input value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
            </div>
            <Button disabled={!checksum || pubM.isPending} onClick={() => pubM.mutate()}>
              <Send className="h-4 w-4 mr-1" />Publish bundle
            </Button>
          </TabsContent>

          <TabsContent value="bundles" className="space-y-1">
            {(bundlesQ.data ?? []).map((b: any) => (
              <div key={b.id} className="border rounded p-2 text-xs flex items-center justify-between">
                <div>
                  <span className="font-mono">#{b.seq}</span> <Badge variant="outline">{b.kind}</Badge>
                  <span className="ml-2 text-muted-foreground">{b.size_bytes} B · {b.checksum.slice(0, 12)}…</span>
                  {b.notes && <div className="text-muted-foreground">{b.notes}</div>}
                </div>
                <span className="text-muted-foreground">{new Date(b.created_at).toLocaleTimeString()}</span>
              </div>
            ))}
            {!bundlesQ.data?.length && <div className="text-xs text-muted-foreground">No bundles yet.</div>}
          </TabsContent>

          <TabsContent value="events" className="space-y-1">
            {(eventsQ.data ?? []).map((e: any) => (
              <div key={e.id} className="text-xs border-l-2 border-muted pl-2 py-1">
                <span className="font-mono">{e.event}</span>
                {e.detail && <span className="text-muted-foreground"> — {e.detail}</span>}
                <span className="text-muted-foreground"> · {new Date(e.occurred_at).toLocaleTimeString()}</span>
              </div>
            ))}
            {!eventsQ.data?.length && <div className="text-xs text-muted-foreground">No events.</div>}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
