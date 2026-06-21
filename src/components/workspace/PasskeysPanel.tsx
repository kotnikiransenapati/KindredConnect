import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  listMyCredentials, listProjectCredentials, beginRegistration,
  finishRegistration, beginAuthentication, finishAuthentication, revokeCredential,
} from "@/lib/passkeys.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Fingerprint, Loader2, Shield, Trash2 } from "lucide-react";

async function sha256Hex(s: string) {
  const buf = new TextEncoder().encode(s);
  const h = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(h)).map(b => b.toString(16).padStart(2, "0")).join("");
}
function rand(n: number) {
  const b = new Uint8Array(n); crypto.getRandomValues(b);
  return Array.from(b).map(x => x.toString(16).padStart(2, "0")).join("");
}

export function PasskeysPanel({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const lMine = useServerFn(listMyCredentials);
  const lProj = useServerFn(listProjectCredentials);
  const bReg = useServerFn(beginRegistration); const fReg = useServerFn(finishRegistration);
  const bAuth = useServerFn(beginAuthentication); const fAuth = useServerFn(finishAuthentication);
  const rev = useServerFn(revokeCredential);

  const mine = useQuery({ queryKey: ["passkeys-mine", projectId],
    queryFn: () => lMine({ data: { projectId } }), refetchInterval: 10_000 });
  const proj = useQuery({ queryKey: ["passkeys-proj", projectId],
    queryFn: () => lProj({ data: { projectId } }), refetchInterval: 10_000 });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["passkeys-mine", projectId] });
    qc.invalidateQueries({ queryKey: ["passkeys-proj", projectId] });
  };

  const [rpId, setRpId] = useState("app.example.com");
  const [label, setLabel] = useState("");

  const regM = useMutation({
    mutationFn: async () => {
      const opts = await bReg({ data: { projectId, rpId } });
      // Simulated authenticator (test/admin tool only). Real apps call
      // navigator.credentials.create() with these options.
      const publicKey = rand(48);
      const credentialId = rand(32);
      await fReg({ data: { projectId, challenge: opts.challenge,
        credentialId, publicKey, transports: ["internal","hybrid"],
        deviceLabel: label || "This device", backedUp: true } });
      return { credentialId, publicKey };
    },
    onSuccess: () => { toast.success("Passkey registered"); setLabel(""); invalidate(); },
    onError: (e: any) => toast.error(e.message),
  });

  const testM = useMutation({
    mutationFn: async () => {
      const list = mine.data ?? [];
      const live = list.find((c: any) => !c.revoked_at);
      if (!live) throw new Error("Register a passkey first");
      const opts = await bAuth({ data: { projectId, rpId } });
      // Compute proof using locally stored public key.
      const pk = localStorage.getItem(`pk:${projectId}:${live.credential_id}`);
      if (!pk) throw new Error("Public key not cached locally; re-register on this device");
      const counter = Date.now() & 0x7fffffff;
      const digest = await sha256Hex(`${pk}:${opts.challenge}:${counter}`);
      await fAuth({ data: { projectId, challenge: opts.challenge,
        credentialId: live.credential_id, counter, signatureDigest: digest } });
    },
    onSuccess: () => { toast.success("Passkey verified"); invalidate(); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Fingerprint className="h-4 w-4 text-violet-500" />Passkeys (WebAuthn)</CardTitle>
        <p className="text-xs text-muted-foreground">Phishing-resistant sign-in for apps built on this platform</p>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="mine">
          <TabsList>
            <TabsTrigger value="mine">My passkeys</TabsTrigger>
            <TabsTrigger value="register">Register</TabsTrigger>
            <TabsTrigger value="project">Project ({proj.data?.length ?? 0})</TabsTrigger>
          </TabsList>

          <TabsContent value="mine" className="space-y-2">
            {(mine.data ?? []).length === 0 ? <p className="text-xs text-muted-foreground">No passkeys yet.</p> :
              (mine.data ?? []).map((c: any) => (
                <div key={c.id} className="flex items-center justify-between border rounded p-2 text-xs">
                  <div>
                    <div className="font-semibold">{c.device_label || "Unnamed device"}</div>
                    <div className="text-muted-foreground font-mono truncate max-w-md">{c.credential_id.slice(0,32)}…</div>
                    <div className="text-muted-foreground">
                      {(c.transports ?? []).join("/") || "—"} • {c.backed_up ? "synced" : "device-bound"}
                      {c.last_used_at && ` • used ${new Date(c.last_used_at).toLocaleString()}`}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {c.revoked_at ? <Badge variant="destructive">revoked</Badge> : <Badge>active</Badge>}
                    <Button size="icon" variant="ghost" disabled={!!c.revoked_at}
                      onClick={() => rev({ data: { projectId, credentialPk: c.id } }).then(invalidate)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))
            }
            <Button size="sm" variant="secondary" onClick={() => testM.mutate()} disabled={testM.isPending}>
              {testM.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Shield className="h-4 w-4 mr-2" />}
              Test sign-in
            </Button>
          </TabsContent>

          <TabsContent value="register" className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <div><Label className="text-xs">Relying Party ID</Label><Input value={rpId} onChange={(e) => setRpId(e.target.value)} /></div>
              <div><Label className="text-xs">Device label</Label><Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="iPhone 16" /></div>
            </div>
            <Button size="sm" onClick={async () => {
              const result = await regM.mutateAsync().catch(() => null);
              if (result) localStorage.setItem(`pk:${projectId}:${result.credentialId}`, result.publicKey);
            }} disabled={regM.isPending}>
              {regM.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Fingerprint className="h-4 w-4 mr-2" />}
              Register passkey
            </Button>
            <p className="text-[10px] text-muted-foreground">
              In production, your mobile/web app calls <code>navigator.credentials.create()</code> with the options returned by <code>beginRegistration</code> and submits the attestation. This panel uses a deterministic simulator so editors can validate the pipeline.
            </p>
          </TabsContent>

          <TabsContent value="project" className="space-y-1 max-h-72 overflow-y-auto">
            {(proj.data ?? []).map((c: any) => (
              <div key={c.id} className="flex items-center justify-between border rounded p-2 text-xs">
                <div>
                  <div className="font-semibold">{c.device_label || "Unnamed"}</div>
                  <div className="text-muted-foreground font-mono">user {c.user_id.slice(0,8)}… • {c.credential_id.slice(0,16)}…</div>
                </div>
                {c.revoked_at ? <Badge variant="destructive">revoked</Badge> : <Badge>active</Badge>}
              </div>
            ))}
            {(proj.data ?? []).length === 0 && <p className="text-xs text-muted-foreground">No credentials.</p>}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
