import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  listPolicies, upsertPolicy, deletePolicy,
  issueAccessToken, listAccessTokens, revokeAccessToken,
  evaluateAccess, listDecisions,
} from "@/lib/zero-trust.functions";
import { listMyOrganizations } from "@/lib/organizations.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ShieldCheck, Trash2, KeyRound, Play, Copy } from "lucide-react";
import { toast } from "sonner";

export function ZeroTrustPanel() {
  const list = useServerFn(listMyOrganizations);
  const orgsQ = useQuery({ queryKey: ["orgs"], queryFn: () => list() });
  const orgs = useMemo(() => {
    const raw: any = orgsQ.data;
    const all = Array.isArray(raw) ? raw : (raw?.organizations ?? []);
    return all.filter((o: any) => ["owner", "admin"].includes(o.role));
  }, [orgsQ.data]);
  const [orgId, setOrgId] = useState("");
  useEffect(() => { if (!orgId && orgs[0]) setOrgId(orgs[0].id); }, [orgs, orgId]);
  const me = (orgs.find((o: any) => o.id === orgId) ?? orgs[0]) as any;

  if (orgsQ.isLoading) return null;
  if (!orgs.length) {
    return (
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><ShieldCheck className="size-4" />Zero-Trust Authorization</CardTitle></CardHeader>
        <CardContent className="text-sm text-muted-foreground">Create an organization to define zero-trust policies and capability tokens.</CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle className="flex items-center gap-2"><ShieldCheck className="size-4" />Zero-Trust Authorization</CardTitle>
        <Select value={orgId} onValueChange={setOrgId}>
          <SelectTrigger className="w-[220px]"><SelectValue /></SelectTrigger>
          <SelectContent>{orgs.map((o: any) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}</SelectContent>
        </Select>
      </CardHeader>
      <CardContent>{orgId && me && <Body orgId={orgId} meUserId={me.owner_id ?? ""} />}</CardContent>
    </Card>
  );
}

function Body({ orgId, meUserId }: { orgId: string; meUserId: string }) {
  const qc = useQueryClient();
  const listP = useServerFn(listPolicies);
  const listT = useServerFn(listAccessTokens);
  const listD = useServerFn(listDecisions);
  const policiesQ = useQuery({ queryKey: ["zt_pol", orgId], queryFn: () => listP({ data: { orgId } }) });
  const tokensQ = useQuery({ queryKey: ["zt_tok", orgId], queryFn: () => listT({ data: { orgId } }) });
  const decisionsQ = useQuery({ queryKey: ["zt_dec", orgId], queryFn: () => listD({ data: { orgId, limit: 50 } }), refetchInterval: 10_000 });

  const upPol = useServerFn(upsertPolicy);
  const delPol = useServerFn(deletePolicy);
  const issue = useServerFn(issueAccessToken);
  const revoke = useServerFn(revokeAccessToken);
  const evalFn = useServerFn(evaluateAccess);

  const [pf, setPf] = useState({ name: "", effect: "allow" as "allow" | "deny", resourcePattern: "project:*", actionPattern: "read:*", priority: 100, conditions: "{}" });
  const [tf, setTf] = useState({ label: "", scope: "read:*", resourcePattern: "project:*", ttlMinutes: 60, issuedToUserId: meUserId });
  const [eval_, setEval] = useState({ resource: "project:abc", action: "read:file", token: "", context: '{"mfa":true}' });
  const [issued, setIssued] = useState<string | null>(null);

  const savePolicy = useMutation({
    mutationFn: () => {
      let conditions: any = {}; try { conditions = JSON.parse(pf.conditions); } catch { throw new Error("Invalid JSON in conditions"); }
      return upPol({ data: { orgId, name: pf.name, effect: pf.effect, subject: {}, resourcePattern: pf.resourcePattern, actionPattern: pf.actionPattern, conditions, priority: pf.priority, enabled: true } });
    },
    onSuccess: () => { toast.success("Policy saved"); qc.invalidateQueries({ queryKey: ["zt_pol", orgId] }); setPf({ ...pf, name: "" }); },
    onError: (e: any) => toast.error(e.message),
  });
  const removePolicy = useMutation({
    mutationFn: (id: string) => delPol({ data: { id, orgId } }),
    onSuccess: () => { toast.success("Removed"); qc.invalidateQueries({ queryKey: ["zt_pol", orgId] }); },
    onError: (e: any) => toast.error(e.message),
  });
  const issueTok = useMutation({
    mutationFn: () => issue({ data: { orgId, label: tf.label, scope: tf.scope.split(",").map((s) => s.trim()).filter(Boolean), resourcePattern: tf.resourcePattern, ttlMinutes: tf.ttlMinutes, issuedToUserId: tf.issuedToUserId } }),
    onSuccess: (r: any) => { setIssued(r.token); toast.success("Token issued (shown once)"); qc.invalidateQueries({ queryKey: ["zt_tok", orgId] }); },
    onError: (e: any) => toast.error(e.message),
  });
  const revokeTok = useMutation({
    mutationFn: (id: string) => revoke({ data: { id, orgId } }),
    onSuccess: () => { toast.success("Revoked"); qc.invalidateQueries({ queryKey: ["zt_tok", orgId] }); },
    onError: (e: any) => toast.error(e.message),
  });
  const runEval = useMutation({
    mutationFn: () => {
      let context: any = {}; try { context = JSON.parse(eval_.context); } catch { throw new Error("Invalid JSON context"); }
      return evalFn({ data: { orgId, resource: eval_.resource, action: eval_.action, token: eval_.token || undefined, context } });
    },
    onSuccess: (r: any) => { toast[r.decision === "allow" ? "success" : "error"](`${r.decision.toUpperCase()} — ${r.reason}`); qc.invalidateQueries({ queryKey: ["zt_dec", orgId] }); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Tabs defaultValue="policies">
      <TabsList>
        <TabsTrigger value="policies">Policies</TabsTrigger>
        <TabsTrigger value="tokens">Capability Tokens</TabsTrigger>
        <TabsTrigger value="evaluate">Evaluate</TabsTrigger>
        <TabsTrigger value="decisions">Decisions</TabsTrigger>
      </TabsList>

      <TabsContent value="policies" className="space-y-3">
        <div className="grid gap-2 md:grid-cols-6 items-end rounded-lg border border-border/60 p-3">
          <div><Label className="text-xs">Name</Label><Input value={pf.name} onChange={(e) => setPf({ ...pf, name: e.target.value })} /></div>
          <div>
            <Label className="text-xs">Effect</Label>
            <Select value={pf.effect} onValueChange={(v: any) => setPf({ ...pf, effect: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="allow">allow</SelectItem><SelectItem value="deny">deny</SelectItem></SelectContent>
            </Select>
          </div>
          <div><Label className="text-xs">Resource pattern</Label><Input value={pf.resourcePattern} onChange={(e) => setPf({ ...pf, resourcePattern: e.target.value })} /></div>
          <div><Label className="text-xs">Action pattern</Label><Input value={pf.actionPattern} onChange={(e) => setPf({ ...pf, actionPattern: e.target.value })} /></div>
          <div><Label className="text-xs">Priority</Label><Input type="number" value={pf.priority} onChange={(e) => setPf({ ...pf, priority: Number(e.target.value) })} /></div>
          <Button onClick={() => savePolicy.mutate()} disabled={!pf.name}>Save policy</Button>
          <div className="md:col-span-6">
            <Label className="text-xs">Conditions (JSON: ip_in, time_between, require_mfa)</Label>
            <Textarea rows={2} className="font-mono text-xs" value={pf.conditions} onChange={(e) => setPf({ ...pf, conditions: e.target.value })} />
          </div>
        </div>
        <div className="space-y-1">
          {(policiesQ.data ?? []).map((p: any) => (
            <div key={p.id} className="flex items-center gap-2 rounded border border-border/60 p-2 text-sm">
              <Badge variant={p.effect === "deny" ? "destructive" : "default"}>{p.effect}</Badge>
              <div className="flex-1">
                <div className="font-medium">{p.name} <span className="text-xs text-muted-foreground">prio {p.priority}</span></div>
                <div className="font-mono text-xs text-muted-foreground">{p.resource_pattern} · {p.action_pattern}</div>
              </div>
              <Button size="sm" variant="ghost" onClick={() => removePolicy.mutate(p.id)}><Trash2 className="size-3.5" /></Button>
            </div>
          ))}
          {!policiesQ.data?.length && <div className="text-sm text-muted-foreground">No policies — default deny applies.</div>}
        </div>
      </TabsContent>

      <TabsContent value="tokens" className="space-y-3">
        <div className="grid gap-2 md:grid-cols-5 items-end rounded-lg border border-border/60 p-3">
          <div><Label className="text-xs">Label</Label><Input value={tf.label} onChange={(e) => setTf({ ...tf, label: e.target.value })} /></div>
          <div><Label className="text-xs">Scope (csv)</Label><Input value={tf.scope} onChange={(e) => setTf({ ...tf, scope: e.target.value })} /></div>
          <div><Label className="text-xs">Resource pattern</Label><Input value={tf.resourcePattern} onChange={(e) => setTf({ ...tf, resourcePattern: e.target.value })} /></div>
          <div><Label className="text-xs">TTL (min)</Label><Input type="number" value={tf.ttlMinutes} onChange={(e) => setTf({ ...tf, ttlMinutes: Number(e.target.value) })} /></div>
          <Button onClick={() => issueTok.mutate()} disabled={!tf.label || !tf.issuedToUserId}><KeyRound className="mr-1 size-3.5" />Issue</Button>
          <div className="md:col-span-5"><Label className="text-xs">Issued-to user ID</Label><Input value={tf.issuedToUserId} onChange={(e) => setTf({ ...tf, issuedToUserId: e.target.value })} placeholder="auth.users uuid" /></div>
        </div>
        {issued && (
          <div className="flex items-center gap-2 rounded border border-amber-500/50 bg-amber-500/10 p-2 text-xs">
            <span className="font-mono break-all flex-1">{issued}</span>
            <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(issued); toast.success("Copied"); }}><Copy className="size-3.5" /></Button>
            <Button size="sm" variant="ghost" onClick={() => setIssued(null)}>Dismiss</Button>
          </div>
        )}
        <div className="space-y-1">
          {(tokensQ.data ?? []).map((t: any) => (
            <div key={t.id} className="flex items-center gap-2 rounded border border-border/60 p-2 text-sm">
              <div className="flex-1">
                <div className="font-medium">{t.label} <span className="font-mono text-xs text-muted-foreground">{t.token_hint}</span></div>
                <div className="text-xs text-muted-foreground">{(t.scope ?? []).join(", ")} · {t.resource_pattern} · used {t.use_count}× · exp {new Date(t.expires_at).toLocaleString()}</div>
              </div>
              <Badge variant={t.revoked_at ? "destructive" : new Date(t.expires_at) < new Date() ? "secondary" : "default"}>
                {t.revoked_at ? "revoked" : new Date(t.expires_at) < new Date() ? "expired" : "active"}
              </Badge>
              {!t.revoked_at && <Button size="sm" variant="ghost" onClick={() => revokeTok.mutate(t.id)}><Trash2 className="size-3.5" /></Button>}
            </div>
          ))}
          {!tokensQ.data?.length && <div className="text-sm text-muted-foreground">No tokens issued.</div>}
        </div>
      </TabsContent>

      <TabsContent value="evaluate" className="space-y-2">
        <div className="grid gap-2 md:grid-cols-2 rounded-lg border border-border/60 p-3">
          <div><Label className="text-xs">Resource</Label><Input value={eval_.resource} onChange={(e) => setEval({ ...eval_, resource: e.target.value })} /></div>
          <div><Label className="text-xs">Action</Label><Input value={eval_.action} onChange={(e) => setEval({ ...eval_, action: e.target.value })} /></div>
          <div className="md:col-span-2"><Label className="text-xs">Token (optional)</Label><Input value={eval_.token} onChange={(e) => setEval({ ...eval_, token: e.target.value })} placeholder="zt_..." /></div>
          <div className="md:col-span-2"><Label className="text-xs">Context JSON</Label><Textarea rows={3} className="font-mono text-xs" value={eval_.context} onChange={(e) => setEval({ ...eval_, context: e.target.value })} /></div>
          <Button className="md:col-span-2" onClick={() => runEval.mutate()}><Play className="mr-1 size-3.5" />Evaluate</Button>
        </div>
      </TabsContent>

      <TabsContent value="decisions" className="space-y-1">
        {(decisionsQ.data ?? []).map((d: any) => (
          <div key={d.id} className="flex items-center gap-2 rounded border border-border/60 p-2 text-xs">
            <Badge variant={d.decision === "allow" ? "default" : "destructive"}>{d.decision}</Badge>
            <span className="font-mono">{d.resource} · {d.action}</span>
            <span className="text-muted-foreground">{d.reason}</span>
            <span className="ml-auto text-muted-foreground">{new Date(d.occurred_at).toLocaleTimeString()}</span>
          </div>
        ))}
        {!decisionsQ.data?.length && <div className="text-sm text-muted-foreground">No decisions yet — try the Evaluate tab.</div>}
      </TabsContent>
    </Tabs>
  );
}
