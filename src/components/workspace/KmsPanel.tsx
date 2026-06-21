// P37 — Per-tenant KMS rotation panel.
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  listKeys, createKey, rotateKey, destroyVersion, setKeyStatus,
  listVersions, listAudit, rotationsDue,
} from "@/lib/kms.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, KeyRound, RotateCw, Shield, Trash2, History, AlertTriangle } from "lucide-react";

const ALGOS = ["aes-256-gcm","chacha20-poly1305","rsa-4096","ed25519"] as const;
const PURPOSES = ["data","signing","jwt","backup","field"] as const;

const STATE_TONE: Record<string, string> = {
  active: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
  retired: "bg-amber-500/15 text-amber-600 border-amber-500/30",
  destroyed: "bg-destructive/15 text-destructive border-destructive/30",
  disabled: "bg-muted text-muted-foreground",
  scheduled_destroy: "bg-amber-500/15 text-amber-600",
};

export function KmsPanel({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const lk = useServerFn(listKeys);
  const ck = useServerFn(createKey);
  const rk = useServerFn(rotateKey);
  const dv = useServerFn(destroyVersion);
  const sk = useServerFn(setKeyStatus);
  const lv = useServerFn(listVersions);
  const la = useServerFn(listAudit);
  const rd = useServerFn(rotationsDue);

  const keys = useQuery({ queryKey: ["kms", projectId], queryFn: () => lk({ data: { projectId } }) });
  const due = useQuery({ queryKey: ["kms-due", projectId], queryFn: () => rd({ data: { projectId } }), refetchInterval: 30_000 });
  const audit = useQuery({ queryKey: ["kms-audit", projectId], queryFn: () => la({ data: { projectId } }), refetchInterval: 15_000 });

  const [selected, setSelected] = useState<string>("");
  const versions = useQuery({
    queryKey: ["kms-versions", selected],
    queryFn: () => lv({ data: { keyId: selected, projectId } }),
    enabled: !!selected,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["kms", projectId] });
    qc.invalidateQueries({ queryKey: ["kms-due", projectId] });
    qc.invalidateQueries({ queryKey: ["kms-audit", projectId] });
    if (selected) qc.invalidateQueries({ queryKey: ["kms-versions", selected] });
  };

  const create = useMutation({
    mutationFn: (v: any) => ck({ data: v }),
    onSuccess: () => { toast.success("Key created"); invalidate(); },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });
  const rotate = useMutation({
    mutationFn: (v: { id: string; reason?: string }) => rk({ data: { id: v.id, projectId, reason: v.reason } }),
    onSuccess: () => { toast.success("Rotated"); invalidate(); },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });
  const destroy = useMutation({
    mutationFn: (v: { keyId: string; version: number }) =>
      dv({ data: { keyId: v.keyId, projectId, version: v.version } }),
    onSuccess: () => { toast.success("Version destroyed"); invalidate(); },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });
  const toggle = useMutation({
    mutationFn: (v: { id: string; status: "active"|"disabled" }) =>
      sk({ data: { id: v.id, projectId, status: v.status } }),
    onSuccess: () => { toast.success("Updated"); invalidate(); },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  const [form, setForm] = useState({
    alias: "", purpose: "data" as any, algorithm: "aes-256-gcm" as any, rotationDays: 90,
  });

  const keyList = keys.data ?? [];
  const dueList = due.data ?? [];
  const auditList = audit.data ?? [];

  return (
    <Card className="border-border/50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRound className="size-5 text-primary" /> Per-tenant KMS
        </CardTitle>
      </CardHeader>
      <CardContent>
        {dueList.length > 0 && (
          <div className="mb-3 flex items-start gap-2 border rounded-md p-2 bg-amber-500/5 border-amber-500/30">
            <AlertTriangle className="size-4 text-amber-600 mt-0.5" />
            <div className="text-xs flex-1">
              <span className="font-medium">{dueList.length}</span> key{dueList.length>1?"s":""} due for rotation within 7 days:&nbsp;
              {dueList.slice(0,5).map((k: any) => (
                <Badge key={k.id} variant={k.overdue ? "destructive" : "outline"} className="mr-1 text-[10px]">
                  {k.alias}{k.overdue ? " · overdue" : ""}
                </Badge>
              ))}
            </div>
          </div>
        )}

        <Tabs defaultValue="keys">
          <TabsList>
            <TabsTrigger value="keys"><Shield className="size-4 mr-1" />Keys</TabsTrigger>
            <TabsTrigger value="versions"><RotateCw className="size-4 mr-1" />Versions</TabsTrigger>
            <TabsTrigger value="audit"><History className="size-4 mr-1" />Audit</TabsTrigger>
          </TabsList>

          {/* Keys + create */}
          <TabsContent value="keys" className="space-y-3 mt-3">
            <div className="grid grid-cols-1 md:grid-cols-5 gap-2 border rounded-md p-3">
              <Field label="Alias">
                <Input value={form.alias} onChange={e => setForm({...form, alias: e.target.value})} placeholder="prod/users" />
              </Field>
              <Field label="Purpose">
                <Select value={form.purpose} onValueChange={(v: any) => setForm({...form, purpose: v})}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{PURPOSES.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              <Field label="Algorithm">
                <Select value={form.algorithm} onValueChange={(v: any) => setForm({...form, algorithm: v})}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{ALGOS.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              <Field label="Rotation days">
                <Input type="number" min={1} max={730} value={form.rotationDays}
                  onChange={e => setForm({...form, rotationDays: Number(e.target.value)})} />
              </Field>
              <div className="flex items-end">
                <Button className="w-full" disabled={create.isPending || !form.alias}
                  onClick={() => create.mutate({ projectId, ...form })}>
                  {create.isPending && <Loader2 className="size-4 animate-spin mr-1" />}
                  Create key
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              {keys.isLoading && <Loader2 className="size-4 animate-spin" />}
              {!keys.isLoading && keyList.length === 0 && (
                <p className="text-sm text-muted-foreground">No keys yet.</p>
              )}
              {keyList.map((k: any) => {
                const due = new Date(k.next_rotation_at).getTime() - Date.now();
                const overdue = due < 0;
                const soon = due >= 0 && due < 7 * 86400_000;
                return (
                  <div key={k.id} className="border rounded-md p-3 space-y-1">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium">{k.alias}</span>
                        <Badge variant="outline">{k.purpose}</Badge>
                        <Badge variant="secondary">{k.algorithm}</Badge>
                        <Badge className={STATE_TONE[k.status] ?? ""}>{k.status}</Badge>
                        <code className="text-xs text-muted-foreground">v{k.current_version}</code>
                      </div>
                      <div className="flex gap-1 items-center">
                        <Switch checked={k.status === "active"}
                          onCheckedChange={(v) => toggle.mutate({ id: k.id, status: v ? "active" : "disabled" })} />
                        <Button variant="outline" size="sm"
                          onClick={() => { const r = prompt("Rotation reason?") ?? undefined; rotate.mutate({ id: k.id, reason: r || undefined }); }}>
                          <RotateCw className="size-3.5 mr-1" /> Rotate
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setSelected(k.id)}>
                          Versions
                        </Button>
                      </div>
                    </div>
                    <div className={`text-xs ${overdue ? "text-destructive" : soon ? "text-amber-600" : "text-muted-foreground"}`}>
                      Next rotation: {new Date(k.next_rotation_at).toLocaleString()}
                      {overdue ? " · OVERDUE" : soon ? " · due soon" : ""}
                    </div>
                  </div>
                );
              })}
            </div>
          </TabsContent>

          {/* Versions */}
          <TabsContent value="versions" className="space-y-3 mt-3">
            <Select value={selected} onValueChange={setSelected}>
              <SelectTrigger className="md:w-80"><SelectValue placeholder="Select a key" /></SelectTrigger>
              <SelectContent>
                {keyList.map((k: any) => <SelectItem key={k.id} value={k.id}>{k.alias} (v{k.current_version})</SelectItem>)}
              </SelectContent>
            </Select>
            {!selected && <p className="text-xs text-muted-foreground">Pick a key to see versions.</p>}
            {selected && versions.isLoading && <Loader2 className="size-4 animate-spin" />}
            {selected && (versions.data ?? []).map((v: any) => {
              const cur = keyList.find((k: any) => k.id === selected)?.current_version === v.version;
              return (
                <div key={v.id} className="border rounded-md p-3 flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline">v{v.version}</Badge>
                    <Badge className={STATE_TONE[v.state] ?? ""}>{v.state}</Badge>
                    {cur && <Badge variant="secondary">current</Badge>}
                    <code className="text-[10px] text-muted-foreground">fp:{v.fingerprint}</code>
                    <span className="text-xs text-muted-foreground">
                      activated {new Date(v.activated_at).toLocaleDateString()}
                      {v.retired_at && ` · retired ${new Date(v.retired_at).toLocaleDateString()}`}
                    </span>
                  </div>
                  {!cur && v.state !== "destroyed" && (
                    <Button variant="ghost" size="icon" className="size-7"
                      onClick={() => { if (confirm(`Destroy version ${v.version}? Cannot decrypt data encrypted with it.`))
                        destroy.mutate({ keyId: selected, version: v.version }); }}>
                      <Trash2 className="size-3.5 text-destructive" />
                    </Button>
                  )}
                </div>
              );
            })}
          </TabsContent>

          {/* Audit */}
          <TabsContent value="audit" className="space-y-1 mt-3">
            {audit.isLoading && <Loader2 className="size-4 animate-spin" />}
            {!audit.isLoading && auditList.length === 0 && (
              <p className="text-sm text-muted-foreground">No audit entries yet.</p>
            )}
            <div className="max-h-72 overflow-auto border rounded-md">
              {auditList.map((a: any) => {
                const key = keyList.find((k: any) => k.id === a.key_id);
                return (
                  <div key={a.id} className="flex items-center justify-between text-xs px-2 py-1 border-b last:border-0">
                    <div className="flex gap-2 items-center flex-wrap">
                      <Badge variant="outline" className="text-[10px]">{a.action}</Badge>
                      <span className="font-medium">{key?.alias ?? "(deleted)"}</span>
                      {a.version != null && <span className="text-muted-foreground">v{a.version}</span>}
                      {a.reason && <span className="text-muted-foreground italic">· {a.reason}</span>}
                    </div>
                    <span className="text-muted-foreground">{new Date(a.created_at).toLocaleString()}</span>
                  </div>
                );
              })}
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}
