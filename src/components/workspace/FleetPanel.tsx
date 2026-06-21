// P46 — Fleet device management panel.
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  advanceCommand, deleteDevice, enrollDevice, fleetStats,
  heartbeatDevice, issueCommand, listCommands, listDevices,
} from "@/lib/fleet.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Smartphone, Trash2, Send } from "lucide-react";

const statusTone: Record<string, string> = {
  active: "border-emerald-500/40 bg-emerald-500/10 text-emerald-600",
  idle: "border-sky-500/40 bg-sky-500/10 text-sky-600",
  offline: "border-muted bg-muted/60 text-muted-foreground",
  quarantined: "border-amber-500/40 bg-amber-500/10 text-amber-600",
  retired: "bg-destructive text-destructive-foreground",
};
const cmdTone: Record<string, string> = {
  queued: "border-muted bg-muted/40 text-muted-foreground",
  dispatched: "border-sky-500/40 bg-sky-500/10 text-sky-600",
  acknowledged: "border-amber-500/40 bg-amber-500/10 text-amber-600",
  succeeded: "border-emerald-500/40 bg-emerald-500/10 text-emerald-600",
  failed: "bg-destructive text-destructive-foreground",
  expired: "border-muted bg-muted/60 text-muted-foreground",
  cancelled: "border-muted bg-muted/60 text-muted-foreground",
};

const DESTRUCTIVE = new Set(["wipe", "lock", "quarantine"]);

export function FleetPanel({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const dFn = useServerFn(listDevices);
  const eFn = useServerFn(enrollDevice);
  const hFn = useServerFn(heartbeatDevice);
  const delFn = useServerFn(deleteDevice);
  const iFn = useServerFn(issueCommand);
  const aFn = useServerFn(advanceCommand);
  const cFn = useServerFn(listCommands);
  const sFn = useServerFn(fleetStats);

  const devices = useQuery({ queryKey: ["fleet-devices", projectId], queryFn: () => dFn({ data: { projectId } }), refetchInterval: 15_000 });
  const commands = useQuery({ queryKey: ["fleet-commands", projectId], queryFn: () => cFn({ data: { projectId } }), refetchInterval: 10_000 });
  const stats = useQuery({ queryKey: ["fleet-stats", projectId], queryFn: () => sFn({ data: { projectId } }), refetchInterval: 15_000 });

  const [device, setDevice] = useState({
    deviceId: "ios-abc-123", label: "QA iPhone 15", platform: "ios" as const,
    osVersion: "17.4", appVersion: "1.2.0", channel: "beta" as const, userLabel: "qa@team",
  });
  const [cmd, setCmd] = useState({ deviceId: "", kind: "refresh-config" as const, confirmDestructive: false });

  const enroll = useMutation({
    mutationFn: () => eFn({ data: { projectId, ...device, attributes: {} } }),
    onSuccess: () => { toast.success("Device enrolled"); qc.invalidateQueries({ queryKey: ["fleet-devices", projectId] }); qc.invalidateQueries({ queryKey: ["fleet-stats", projectId] }); },
    onError: (e: any) => toast.error(e.message),
  });
  const issue = useMutation({
    mutationFn: () => iFn({ data: { projectId, deviceId: cmd.deviceId, kind: cmd.kind, payload: {}, confirmDestructive: cmd.confirmDestructive } }),
    onSuccess: () => { toast.success("Command queued"); qc.invalidateQueries({ queryKey: ["fleet-commands", projectId] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const s: any = stats.data ?? { totalDevices: 0, totalCommands: 0, byStatus: {}, byPlatform: {}, cmdByStatus: {} };

  return (
    <Card className="border-border/60">
      <CardHeader className="flex flex-row items-center gap-2">
        <Smartphone className="h-4 w-4 text-primary" />
        <CardTitle className="text-base">Fleet management</CardTitle>
        <Badge variant="outline" className="ml-2">P46</Badge>
      </CardHeader>
      <CardContent>
        <div className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-4">
          <div className="rounded-lg border border-border/60 bg-muted/30 p-2"><div className="text-[10px] uppercase text-muted-foreground">Devices</div><div className="font-display text-lg">{s.totalDevices}</div></div>
          <div className="rounded-lg border border-border/60 bg-muted/30 p-2"><div className="text-[10px] uppercase text-muted-foreground">Commands</div><div className="font-display text-lg">{s.totalCommands}</div></div>
          <div className="rounded-lg border border-border/60 bg-muted/30 p-2"><div className="text-[10px] uppercase text-muted-foreground">Active</div><div className="font-display text-lg">{s.byStatus.active ?? 0}</div></div>
          <div className="rounded-lg border border-border/60 bg-muted/30 p-2"><div className="text-[10px] uppercase text-muted-foreground">Quarantined</div><div className="font-display text-lg">{s.byStatus.quarantined ?? 0}</div></div>
        </div>

        <Tabs defaultValue="devices">
          <TabsList>
            <TabsTrigger value="devices">Devices</TabsTrigger>
            <TabsTrigger value="enroll">Enroll</TabsTrigger>
            <TabsTrigger value="command">Command</TabsTrigger>
            <TabsTrigger value="queue">Queue</TabsTrigger>
          </TabsList>

          <TabsContent value="devices" className="space-y-2">
            {(devices.data ?? []).map((d: any) => (
              <div key={d.id} className="flex items-center justify-between rounded-md border border-border/60 p-2 text-sm">
                <div>
                  <div className="font-medium">{d.label ?? d.device_id} <Badge variant="outline" className="ml-1">{d.platform}</Badge> <span className={`ml-1 rounded border px-1.5 py-0.5 text-[10px] uppercase ${statusTone[d.status]}`}>{d.status}</span></div>
                  <div className="text-xs text-muted-foreground">{d.device_id} · {d.app_version ?? "?"} / {d.os_version ?? "?"} · channel {d.channel}</div>
                  <div className="text-[10px] text-muted-foreground">last seen {d.last_seen_at ? new Date(d.last_seen_at).toLocaleString() : "—"}</div>
                </div>
                <div className="flex items-center gap-1">
                  <Button size="sm" variant="outline" onClick={() => hFn({ data: { projectId, id: d.id } }).then(() => { toast.success("Heartbeat sent"); qc.invalidateQueries({ queryKey: ["fleet-devices", projectId] }); })}>Heartbeat</Button>
                  <Button size="sm" variant="ghost" onClick={() => delFn({ data: { projectId, id: d.id } }).then(() => qc.invalidateQueries({ queryKey: ["fleet-devices", projectId] }))}><Trash2 className="h-3.5 w-3.5" /></Button>
                </div>
              </div>
            ))}
          </TabsContent>

          <TabsContent value="enroll" className="space-y-3">
            <div className="grid gap-2 md:grid-cols-3">
              <div><Label>Device ID</Label><Input value={device.deviceId} onChange={(e) => setDevice({ ...device, deviceId: e.target.value })} /></div>
              <div><Label>Label</Label><Input value={device.label} onChange={(e) => setDevice({ ...device, label: e.target.value })} /></div>
              <div><Label>Platform</Label>
                <Select value={device.platform} onValueChange={(v) => setDevice({ ...device, platform: v as any })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{["ios", "android", "web", "desktop", "wearable", "tv"].map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>OS version</Label><Input value={device.osVersion} onChange={(e) => setDevice({ ...device, osVersion: e.target.value })} /></div>
              <div><Label>App version</Label><Input value={device.appVersion} onChange={(e) => setDevice({ ...device, appVersion: e.target.value })} /></div>
              <div><Label>Channel</Label>
                <Select value={device.channel} onValueChange={(v) => setDevice({ ...device, channel: v as any })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{["production", "beta", "internal", "dev"].map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="md:col-span-3"><Label>User label</Label><Input value={device.userLabel} onChange={(e) => setDevice({ ...device, userLabel: e.target.value })} /></div>
            </div>
            <Button onClick={() => enroll.mutate()} disabled={enroll.isPending} size="sm">Enroll</Button>
          </TabsContent>

          <TabsContent value="command" className="space-y-3">
            <div className="grid gap-2 md:grid-cols-3">
              <div><Label>Device</Label>
                <Select value={cmd.deviceId} onValueChange={(v) => setCmd({ ...cmd, deviceId: v })}>
                  <SelectTrigger><SelectValue placeholder="Select device" /></SelectTrigger>
                  <SelectContent>{(devices.data ?? []).map((d: any) => <SelectItem key={d.id} value={d.id}>{d.label ?? d.device_id}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Command</Label>
                <Select value={cmd.kind} onValueChange={(v) => setCmd({ ...cmd, kind: v as any })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{["wipe", "lock", "unlock", "refresh-config", "push-update", "reboot", "collect-logs", "quarantine", "release"].map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              {DESTRUCTIVE.has(cmd.kind) && (
                <div className="flex items-center gap-2 pt-5"><Switch checked={cmd.confirmDestructive} onCheckedChange={(v) => setCmd({ ...cmd, confirmDestructive: v })} /><Label className="text-destructive">Confirm destructive</Label></div>
              )}
            </div>
            <Button onClick={() => issue.mutate()} disabled={!cmd.deviceId || issue.isPending} size="sm"><Send className="mr-1 h-3.5 w-3.5" />Issue command</Button>
          </TabsContent>

          <TabsContent value="queue" className="space-y-2">
            {(commands.data ?? []).map((c: any) => (
              <div key={c.id} className="flex items-center justify-between rounded-md border border-border/60 p-2 text-xs">
                <div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{c.kind}</Badge>
                    <span className={`rounded border px-1.5 py-0.5 text-[10px] uppercase ${cmdTone[c.status] ?? ""}`}>{c.status}</span>
                  </div>
                  <div className="text-[10px] text-muted-foreground">issued {new Date(c.created_at).toLocaleString()}</div>
                </div>
                <div className="flex items-center gap-1">
                  {!["succeeded", "failed", "expired", "cancelled"].includes(c.status) && (
                    <>
                      <Button size="sm" variant="outline" onClick={() => aFn({ data: { projectId, id: c.id } }).then(() => qc.invalidateQueries({ queryKey: ["fleet-commands", projectId] }))}>Advance</Button>
                      <Button size="sm" variant="ghost" onClick={() => aFn({ data: { projectId, id: c.id, forceStatus: "cancelled" } }).then(() => qc.invalidateQueries({ queryKey: ["fleet-commands", projectId] }))}>Cancel</Button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
