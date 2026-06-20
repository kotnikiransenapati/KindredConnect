import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listSiemDestinations, upsertSiemDestination, deleteSiemDestination, dispatchSiemEvent, listSiemDeliveries } from "@/lib/siem.functions";
import { listMyOrganizations } from "@/lib/organizations.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Trash2, Send, ShieldCheck, AlertCircle, Activity } from "lucide-react";

export function SiemStreamingPanel() {
  const qc = useQueryClient();
  const orgsFn = useServerFn(listMyOrganizations);
  const orgs = useQuery({ queryKey: ["orgs"], queryFn: () => orgsFn({}) });
  const [orgId, setOrgId] = useState<string>("");

  const list = useServerFn(listSiemDestinations);
  const dels = useServerFn(listSiemDeliveries);
  const upsert = useServerFn(upsertSiemDestination);
  const del = useServerFn(deleteSiemDestination);
  const dispatch = useServerFn(dispatchSiemEvent);

  const destsQ = useQuery({
    queryKey: ["siem-dests", orgId],
    queryFn: () => list({ data: { orgId } }),
    enabled: !!orgId,
  });
  const delsQ = useQuery({
    queryKey: ["siem-dels", orgId],
    queryFn: () => dels({ data: { orgId, limit: 50 } }),
    enabled: !!orgId,
    refetchInterval: 15000,
  });

  const [form, setForm] = useState({ name: "", provider: "splunk_hec" as const, endpointUrl: "", secret: "", eventFilter: "" });

  const upsertMut = useMutation({
    mutationFn: () => upsert({ data: {
      orgId, name: form.name, provider: form.provider, endpointUrl: form.endpointUrl,
      secret: form.secret, eventFilter: form.eventFilter.split(",").map((s) => s.trim()).filter(Boolean),
      enabled: true,
    } }),
    onSuccess: () => { toast.success("Destination saved"); setForm({ name: "", provider: "splunk_hec", endpointUrl: "", secret: "", eventFilter: "" }); qc.invalidateQueries({ queryKey: ["siem-dests", orgId] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const orgList = orgs.data?.organizations ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><ShieldCheck className="h-4 w-4" /> SIEM Streaming</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label>Organization</Label>
          <Select value={orgId} onValueChange={setOrgId}>
            <SelectTrigger><SelectValue placeholder="Pick an org" /></SelectTrigger>
            <SelectContent>{orgList.map((o: any) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>

        {orgId && (
          <Tabs defaultValue="destinations">
            <TabsList>
              <TabsTrigger value="destinations">Destinations</TabsTrigger>
              <TabsTrigger value="add">+ Add</TabsTrigger>
              <TabsTrigger value="deliveries">Deliveries</TabsTrigger>
            </TabsList>

            <TabsContent value="destinations" className="space-y-2">
              {(destsQ.data?.destinations ?? []).map((d: any) => (
                <div key={d.id} className="flex items-center justify-between rounded border p-2 text-sm">
                  <div>
                    <div className="font-medium">{d.name} <Badge variant="outline" className="ml-2">{d.provider}</Badge></div>
                    <div className="text-xs text-muted-foreground">{d.endpoint_url}</div>
                    <div className="text-xs">Secret: <code>{d.secret_hint}</code> · Filter: {d.event_filter?.join(", ") || "any"}</div>
                    <div className="text-xs flex items-center gap-1">
                      {d.last_status === "success" ? <ShieldCheck className="h-3 w-3 text-green-500" /> : d.last_status === "failed" ? <AlertCircle className="h-3 w-3 text-destructive" /> : <Activity className="h-3 w-3" />}
                      {d.last_status ?? "no deliveries"} {d.last_error ? `· ${d.last_error}` : ""}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch checked={d.enabled} onCheckedChange={(v) => upsert({ data: { id: d.id, orgId, name: d.name, provider: d.provider, endpointUrl: d.endpoint_url, eventFilter: d.event_filter ?? [], enabled: v } as any }).then(() => qc.invalidateQueries({ queryKey: ["siem-dests", orgId] }))} />
                    <Button size="icon" variant="ghost" onClick={async () => { await del({ data: { id: d.id } }); qc.invalidateQueries({ queryKey: ["siem-dests", orgId] }); }}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </div>
              ))}
              {(destsQ.data?.destinations?.length ?? 0) === 0 && <p className="text-sm text-muted-foreground">No destinations yet.</p>}
            </TabsContent>

            <TabsContent value="add" className="space-y-2">
              <Input placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              <Select value={form.provider} onValueChange={(v: any) => setForm({ ...form, provider: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="splunk_hec">Splunk HEC</SelectItem>
                  <SelectItem value="datadog">Datadog</SelectItem>
                  <SelectItem value="generic_webhook">Generic webhook (HMAC)</SelectItem>
                </SelectContent>
              </Select>
              <Input placeholder="https://..." value={form.endpointUrl} onChange={(e) => setForm({ ...form, endpointUrl: e.target.value })} />
              <Input type="password" placeholder="Shared secret (min 16 chars)" value={form.secret} onChange={(e) => setForm({ ...form, secret: e.target.value })} />
              <Input placeholder="Event filter (csv) — leave blank for all" value={form.eventFilter} onChange={(e) => setForm({ ...form, eventFilter: e.target.value })} />
              <Button onClick={() => upsertMut.mutate()} disabled={upsertMut.isPending}>Save destination</Button>
            </TabsContent>

            <TabsContent value="deliveries" className="space-y-1 max-h-80 overflow-auto">
              {(delsQ.data?.deliveries ?? []).map((row: any) => (
                <div key={row.id} className="flex items-center justify-between rounded border p-2 text-xs">
                  <div>
                    <span className="font-mono">{row.event_name}</span>
                    <Badge variant={row.status === "success" ? "default" : "destructive"} className="ml-2">{row.status}</Badge>
                  </div>
                  <div className="text-muted-foreground">{row.http_code ?? "—"} · {row.latency_ms}ms · {new Date(row.created_at).toLocaleTimeString()}</div>
                </div>
              ))}
              {(delsQ.data?.deliveries?.length ?? 0) === 0 && <p className="text-sm text-muted-foreground">No deliveries yet.</p>}
            </TabsContent>
          </Tabs>
        )}
      </CardContent>
    </Card>
  );
}
