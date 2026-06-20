import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  listSsoConnections,
  upsertSsoConnection,
  testSsoConnection,
  setSsoEnabled,
  deleteSsoConnection,
} from "@/lib/sso.functions";
import { listMyOrganizations } from "@/lib/organizations.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck, ShieldAlert, Shield, Loader2, Trash2, Plug } from "lucide-react";
import { toast } from "sonner";

const PROVIDERS = [
  { v: "okta", l: "Okta" },
  { v: "azure_ad", l: "Microsoft Entra ID" },
  { v: "google_workspace", l: "Google Workspace" },
  { v: "onelogin", l: "OneLogin" },
  { v: "jumpcloud", l: "JumpCloud" },
  { v: "generic_saml", l: "Generic SAML 2.0" },
];

export function SsoConnectionsPanel() {
  const qc = useQueryClient();
  const fetchOrgs = useServerFn(listMyOrganizations);
  const fetchConns = useServerFn(listSsoConnections);
  const upsert = useServerFn(upsertSsoConnection);
  const test = useServerFn(testSsoConnection);
  const setEnabled = useServerFn(setSsoEnabled);
  const del = useServerFn(deleteSsoConnection);

  const [orgId, setOrgId] = useState<string>("");
  const [form, setForm] = useState({
    provider: "okta",
    displayName: "",
    domain: "",
    entityId: "",
    ssoUrl: "",
    certificate: "",
  });

  const orgsQ = useQuery({
    queryKey: ["my-orgs-sso"],
    queryFn: () => fetchOrgs(),
  });

  const orgs = (orgsQ.data?.organizations ?? []).filter((o: any) =>
    ["owner", "admin"].includes(o.my_role),
  );
  const effectiveOrgId = orgId || orgs[0]?.id || "";

  const connsQ = useQuery({
    queryKey: ["sso-conns", effectiveOrgId],
    queryFn: () => fetchConns({ data: { orgId: effectiveOrgId } }),
    enabled: !!effectiveOrgId,
  });

  const upsertM = useMutation({
    mutationFn: (v: any) => upsert({ data: v }),
    onSuccess: () => {
      toast.success("SSO connection saved");
      setForm({ provider: "okta", displayName: "", domain: "", entityId: "", ssoUrl: "", certificate: "" });
      qc.invalidateQueries({ queryKey: ["sso-conns"] });
    },
    onError: (e: any) => toast.error(e.message),
  });
  const testM = useMutation({
    mutationFn: (id: string) => test({ data: { id } }),
    onSuccess: (r: any) => {
      if (r.status === "active") toast.success("Connection reachable");
      else toast.error(r.error ?? "Test failed");
      qc.invalidateQueries({ queryKey: ["sso-conns"] });
    },
  });
  const toggleM = useMutation({
    mutationFn: (v: { id: string; enabled: boolean }) => setEnabled({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sso-conns"] }),
  });
  const delM = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => {
      toast.success("Connection removed");
      qc.invalidateQueries({ queryKey: ["sso-conns"] });
    },
  });

  function StatusIcon({ s }: { s: string }) {
    if (s === "active") return <ShieldCheck className="h-4 w-4 text-emerald-500" />;
    if (s === "error") return <ShieldAlert className="h-4 w-4 text-destructive" />;
    if (s === "disabled") return <Shield className="h-4 w-4 text-muted-foreground" />;
    return <Shield className="h-4 w-4 text-amber-500" />;
  }

  return (
    <Card className="border-border/60">
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="font-display text-base">Enterprise SSO (SAML 2.0)</CardTitle>
        <Badge variant="outline" className="font-mono text-[10px]">
          {orgs.length} orgs
        </Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        {orgs.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            You must be an admin or owner of an organization to configure SSO.
          </p>
        ) : (
          <>
            <div>
              <Label className="text-xs">Organization</Label>
              <Select value={effectiveOrgId} onValueChange={setOrgId}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {orgs.map((o: any) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.name} <span className="ml-2 text-xs text-muted-foreground">/{o.slug}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="rounded-lg border border-border/60 p-3 space-y-3">
              <p className="text-xs font-medium text-muted-foreground">New connection</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label className="text-xs">Provider</Label>
                  <Select value={form.provider} onValueChange={(v) => setForm({ ...form, provider: v })}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PROVIDERS.map((p) => <SelectItem key={p.v} value={p.v}>{p.l}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Display name</Label>
                  <Input className="mt-1" value={form.displayName}
                    onChange={(e) => setForm({ ...form, displayName: e.target.value })}
                    placeholder="Okta — Production" />
                </div>
                <div>
                  <Label className="text-xs">Email domain</Label>
                  <Input className="mt-1" value={form.domain}
                    onChange={(e) => setForm({ ...form, domain: e.target.value })}
                    placeholder="acme.com" />
                </div>
                <div>
                  <Label className="text-xs">Entity ID (Issuer)</Label>
                  <Input className="mt-1" value={form.entityId}
                    onChange={(e) => setForm({ ...form, entityId: e.target.value })}
                    placeholder="http://www.okta.com/exk..." />
                </div>
                <div className="sm:col-span-2">
                  <Label className="text-xs">SSO URL (HTTPS)</Label>
                  <Input className="mt-1" value={form.ssoUrl}
                    onChange={(e) => setForm({ ...form, ssoUrl: e.target.value })}
                    placeholder="https://acme.okta.com/app/.../sso/saml" />
                </div>
                <div className="sm:col-span-2">
                  <Label className="text-xs">x509 Certificate (PEM)</Label>
                  <Textarea className="mt-1 font-mono text-[10px] min-h-[120px]"
                    value={form.certificate}
                    onChange={(e) => setForm({ ...form, certificate: e.target.value })}
                    placeholder="-----BEGIN CERTIFICATE-----&#10;MIID...&#10;-----END CERTIFICATE-----" />
                </div>
              </div>
              <Button
                size="sm"
                disabled={upsertM.isPending || !effectiveOrgId}
                onClick={() => upsertM.mutate({ orgId: effectiveOrgId, ...form })}
              >
                {upsertM.isPending && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
                Save connection
              </Button>
            </div>

            <div className="space-y-2">
              {connsQ.isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              ) : (connsQ.data?.connections ?? []).length === 0 ? (
                <p className="text-xs text-muted-foreground">No SSO connections yet.</p>
              ) : (
                (connsQ.data?.connections ?? []).map((c: any) => (
                  <div key={c.id} className="rounded-lg border border-border/60 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <StatusIcon s={c.status} />
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{c.display_name}</p>
                          <p className="text-[11px] text-muted-foreground truncate">
                            {c.provider} · {c.domain}
                          </p>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <Button size="sm" variant="ghost"
                          onClick={() => testM.mutate(c.id)}
                          disabled={testM.isPending}>
                          <Plug className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="sm" variant="ghost"
                          onClick={() => toggleM.mutate({ id: c.id, enabled: c.status !== "active" })}>
                          {c.status === "active" ? "Disable" : "Enable"}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => delM.mutate(c.id)}>
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </div>
                    </div>
                    {c.last_error && (
                      <p className="mt-2 text-[11px] text-destructive">{c.last_error}</p>
                    )}
                    {c.last_tested_at && (
                      <p className="mt-1 text-[10px] text-muted-foreground">
                        Last tested {new Date(c.last_tested_at).toLocaleString()}
                      </p>
                    )}
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
