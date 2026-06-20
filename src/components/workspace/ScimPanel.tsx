import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { listScimTokens, createScimToken, revokeScimToken, listScimAudit, listScimProvisionedUsers } from "@/lib/scim.functions";
import { listMyOrganizations } from "@/lib/organizations.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Copy, KeyRound, ShieldCheck, Trash2, Users } from "lucide-react";
import { toast } from "sonner";

export function ScimPanel() {
  const list = useServerFn(listMyOrganizations);
  const orgsQ = useQuery({ queryKey: ["orgs"], queryFn: () => list() });
  const orgs = useMemo(() => {
    const raw: any = orgsQ.data;
    const all = Array.isArray(raw) ? raw : (raw?.organizations ?? []);
    return all.filter((o: any) => ["owner", "admin"].includes(o.role));
  }, [orgsQ.data]);
  const [orgId, setOrgId] = useState<string>("");
  useEffect(() => { if (!orgId && orgs[0]) setOrgId(orgs[0].id); }, [orgs, orgId]);

  if (orgsQ.isLoading) return null;
  if (!orgs.length) {
    return (
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><KeyRound className="size-4" />SCIM Provisioning</CardTitle></CardHeader>
        <CardContent className="text-sm text-muted-foreground">Create an organization (Workspaces tab) to enable SCIM 2.0 provisioning.</CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle className="flex items-center gap-2"><KeyRound className="size-4" />SCIM 2.0 Provisioning</CardTitle>
        <Select value={orgId} onValueChange={setOrgId}>
          <SelectTrigger className="w-[220px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {orgs.map((o: any) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent>
        {orgId && <ScimBody orgId={orgId} />}
      </CardContent>
    </Card>
  );
}

function ScimBody({ orgId }: { orgId: string }) {
  const qc = useQueryClient();
  const listTokens = useServerFn(listScimTokens);
  const create = useServerFn(createScimToken);
  const revoke = useServerFn(revokeScimToken);
  const listAudit = useServerFn(listScimAudit);
  const listUsers = useServerFn(listScimProvisionedUsers);

  const tokensQ = useQuery({ queryKey: ["scim-tokens", orgId], queryFn: () => listTokens({ data: { orgId } }) });
  const auditQ = useQuery({ queryKey: ["scim-audit", orgId], queryFn: () => listAudit({ data: { orgId, limit: 100 } }) });
  const usersQ = useQuery({ queryKey: ["scim-users", orgId], queryFn: () => listUsers({ data: { orgId } }) });

  const [name, setName] = useState("");
  const [revealed, setRevealed] = useState<string | null>(null);

  const createM = useMutation({
    mutationFn: async () => create({ data: { orgId, name } }),
    onSuccess: (r) => { setRevealed(r.token); setName(""); qc.invalidateQueries({ queryKey: ["scim-tokens", orgId] }); },
    onError: (e: any) => toast.error(e.message),
  });
  const revokeM = useMutation({
    mutationFn: async (id: string) => revoke({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["scim-tokens", orgId] }),
  });

  const baseUrl = typeof window !== "undefined" ? `${window.location.origin}/api/public/scim/v2` : "/api/public/scim/v2";

  return (
    <Tabs defaultValue="tokens">
      <TabsList>
        <TabsTrigger value="tokens">Tokens</TabsTrigger>
        <TabsTrigger value="users">Provisioned users</TabsTrigger>
        <TabsTrigger value="audit">Audit</TabsTrigger>
        <TabsTrigger value="setup">Setup</TabsTrigger>
      </TabsList>

      <TabsContent value="tokens" className="space-y-3">
        <div className="flex gap-2">
          <Input placeholder="Token name (e.g. Okta production)" value={name} onChange={(e) => setName(e.target.value)} />
          <Button disabled={!name.trim() || createM.isPending} onClick={() => createM.mutate()}>Create token</Button>
        </div>
        {revealed && (
          <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
            <div className="font-medium mb-1">Copy this token now — it will not be shown again.</div>
            <div className="flex items-center gap-2">
              <code className="flex-1 break-all text-xs bg-background rounded p-2">{revealed}</code>
              <Button size="icon" variant="ghost" onClick={() => { navigator.clipboard.writeText(revealed); toast.success("Copied"); }}><Copy className="size-4" /></Button>
              <Button size="sm" variant="outline" onClick={() => setRevealed(null)}>Done</Button>
            </div>
          </div>
        )}
        <div className="space-y-2">
          {(tokensQ.data ?? []).map((t: any) => (
            <div key={t.id} className="flex items-center justify-between border rounded-md p-2 text-sm">
              <div className="flex items-center gap-2">
                <span className="font-medium">{t.name}</span>
                <code className="text-xs text-muted-foreground">{t.token_prefix}…</code>
                {t.revoked_at ? <Badge variant="destructive">revoked</Badge> : <Badge variant="secondary"><ShieldCheck className="size-3 mr-1" />active</Badge>}
                {t.last_used_at && <span className="text-xs text-muted-foreground">last used {new Date(t.last_used_at).toLocaleString()}</span>}
              </div>
              {!t.revoked_at && (
                <Button size="sm" variant="ghost" onClick={() => revokeM.mutate(t.id)}><Trash2 className="size-4" /></Button>
              )}
            </div>
          ))}
          {(tokensQ.data ?? []).length === 0 && <div className="text-sm text-muted-foreground">No tokens yet.</div>}
        </div>
      </TabsContent>

      <TabsContent value="users">
        <div className="space-y-1">
          {(usersQ.data ?? []).map((u: any) => (
            <div key={u.id} className="flex items-center justify-between border rounded p-2 text-sm">
              <div className="flex items-center gap-2"><Users className="size-3" />{u.email}{u.display_name && <span className="text-muted-foreground">— {u.display_name}</span>}</div>
              <Badge variant={u.active ? "secondary" : "outline"}>{u.active ? "active" : "deprovisioned"}</Badge>
            </div>
          ))}
          {(usersQ.data ?? []).length === 0 && <div className="text-sm text-muted-foreground">No users provisioned yet. Configure your IdP using the Setup tab.</div>}
        </div>
      </TabsContent>

      <TabsContent value="audit">
        <div className="space-y-1 max-h-72 overflow-y-auto">
          {(auditQ.data ?? []).map((a: any) => (
            <div key={a.id} className="text-xs font-mono flex items-center gap-2 border-b py-1">
              <span className="text-muted-foreground">{new Date(a.created_at).toLocaleTimeString()}</span>
              <Badge variant={a.status_code < 300 ? "secondary" : "destructive"}>{a.status_code}</Badge>
              <span>{a.method} {a.path}</span>
            </div>
          ))}
          {(auditQ.data ?? []).length === 0 && <div className="text-sm text-muted-foreground">No SCIM traffic yet.</div>}
        </div>
      </TabsContent>

      <TabsContent value="setup" className="text-sm space-y-2">
        <div>Point your IdP (Okta, Azure AD, etc.) at:</div>
        <code className="block bg-muted rounded p-2 text-xs break-all">{baseUrl}</code>
        <div>Authentication: <code>Bearer &lt;token&gt;</code></div>
        <div>Supported: Users CRUD, filter by <code>userName eq</code>, PATCH (active / displayName), soft delete.</div>
      </TabsContent>
    </Tabs>
  );
}
