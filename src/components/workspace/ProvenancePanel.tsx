import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createAttestation, ingestSbom, listAttestations, listSboms,
  provenanceStats, revokeAttestation, verifyAttestation,
} from "@/lib/provenance.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { CheckCircle2, FileBadge, ShieldCheck, ShieldX } from "lucide-react";

const statusTone: Record<string, string> = {
  verified: "border-emerald-500/40 bg-emerald-500/10 text-emerald-600",
  unverified: "border-amber-500/40 bg-amber-500/10 text-amber-600",
  failed: "bg-destructive text-destructive-foreground",
  revoked: "bg-muted text-muted-foreground",
};

export function ProvenancePanel({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const attsFn = useServerFn(listAttestations);
  const createFn = useServerFn(createAttestation);
  const verifyFn = useServerFn(verifyAttestation);
  const revokeFn = useServerFn(revokeAttestation);
  const sbomsFn = useServerFn(listSboms);
  const ingestFn = useServerFn(ingestSbom);
  const statsFn = useServerFn(provenanceStats);

  const atts = useQuery({ queryKey: ["prov-atts", projectId], queryFn: () => attsFn({ data: { projectId } }), refetchInterval: 30_000 });
  const sboms = useQuery({ queryKey: ["prov-sboms", projectId], queryFn: () => sbomsFn({ data: { projectId } }), refetchInterval: 30_000 });
  const stats = useQuery({ queryKey: ["prov-stats", projectId], queryFn: () => statsFn({ data: { projectId } }), refetchInterval: 30_000 });

  const [att, setAtt] = useState({
    subjectName: "app-release.ipa",
    subjectDigest: "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
    builderId: "https://lovable.dev/builder/v1",
    sourceUri: "git+https://github.com/example/app.git",
    sourceDigest: "",
  });
  const [sbom, setSbom] = useState({
    format: "cyclonedx" as const,
    componentsText: "react@19.0.0\ntailwindcss@4.0.0\n@tanstack/react-router@1.0.0",
    vulnsText: "CVE-2025-1234|high\nCVE-2025-5678|medium",
    sign: true,
  });

  const create = useMutation({
    mutationFn: () => createFn({ data: { projectId, ...att, sourceDigest: att.sourceDigest || undefined } }),
    onSuccess: () => { toast.success("Attestation created"); qc.invalidateQueries({ queryKey: ["prov-atts", projectId] }); qc.invalidateQueries({ queryKey: ["prov-stats", projectId] }); },
    onError: (e: any) => toast.error(e.message),
  });
  const verify = useMutation({
    mutationFn: (id: string) => verifyFn({ data: { id, projectId } }),
    onSuccess: (r: any) => { toast.success(`Verification: ${r.status}`); qc.invalidateQueries({ queryKey: ["prov-atts", projectId] }); qc.invalidateQueries({ queryKey: ["prov-stats", projectId] }); },
    onError: (e: any) => toast.error(e.message),
  });
  const revoke = useMutation({
    mutationFn: (id: string) => revokeFn({ data: { id, projectId } }),
    onSuccess: () => { toast.success("Revoked"); qc.invalidateQueries({ queryKey: ["prov-atts", projectId] }); },
    onError: (e: any) => toast.error(e.message),
  });
  const ingest = useMutation({
    mutationFn: () => {
      const components = sbom.componentsText.split("\n").filter(Boolean).map(line => {
        const [name, version] = line.split("@");
        return { name: name.trim(), version: (version ?? "").trim() };
      });
      const vulnerabilities = sbom.vulnsText.split("\n").filter(Boolean).map(line => {
        const [id, severity] = line.split("|");
        return { id: id.trim(), severity: (severity ?? "unknown").trim() };
      });
      return ingestFn({ data: { projectId, format: sbom.format, components, vulnerabilities, sign: sbom.sign } });
    },
    onSuccess: () => { toast.success("SBOM ingested"); qc.invalidateQueries({ queryKey: ["prov-sboms", projectId] }); qc.invalidateQueries({ queryKey: ["prov-stats", projectId] }); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2"><ShieldCheck className="h-4 w-4" /> Build Provenance & SBOM</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2 sm:grid-cols-6">
          {(["attestations","verified","failed","sboms","criticalVulns","highVulns"] as const).map(k => (
            <div key={k} className="rounded-md border p-2"><div className="text-xs text-muted-foreground">{k}</div><div className="text-lg font-semibold">{(stats.data as any)?.[k] ?? 0}</div></div>
          ))}
        </div>
        <Tabs defaultValue="atts">
          <TabsList>
            <TabsTrigger value="atts">Attestations</TabsTrigger>
            <TabsTrigger value="create"><FileBadge className="mr-1 h-3 w-3" />Create</TabsTrigger>
            <TabsTrigger value="sbom">SBOM</TabsTrigger>
          </TabsList>

          <TabsContent value="atts" className="space-y-2">
            {(atts.data ?? []).map((a: any) => (
              <div key={a.id} className="rounded-md border p-2 text-sm">
                <div className="flex items-center gap-2">
                  <span className="font-mono truncate max-w-xs">{a.subject_name}</span>
                  <Badge variant="outline" className={statusTone[a.verification_status]}>{a.verification_status}</Badge>
                  <span className="ml-auto flex gap-1">
                    <Button size="sm" variant="outline" onClick={() => verify.mutate(a.id)}><CheckCircle2 className="mr-1 h-3 w-3" />Verify</Button>
                    <Button size="sm" variant="ghost" onClick={() => revoke.mutate(a.id)}><ShieldX className="h-3 w-3" /></Button>
                  </span>
                </div>
                <div className="text-xs text-muted-foreground">digest <span className="font-mono">{a.subject_digest.slice(0, 32)}…</span> · builder {a.builder_id}</div>
              </div>
            ))}
            {!atts.data?.length && <div className="text-sm text-muted-foreground">No attestations yet.</div>}
          </TabsContent>

          <TabsContent value="create" className="space-y-2">
            <div className="grid gap-2 md:grid-cols-2">
              <Input placeholder="subject name" value={att.subjectName} onChange={e => setAtt(s => ({ ...s, subjectName: e.target.value }))} />
              <Input placeholder="subject digest (hex sha-256)" value={att.subjectDigest} onChange={e => setAtt(s => ({ ...s, subjectDigest: e.target.value }))} />
              <Input placeholder="builder id" value={att.builderId} onChange={e => setAtt(s => ({ ...s, builderId: e.target.value }))} />
              <Input placeholder="source uri" value={att.sourceUri} onChange={e => setAtt(s => ({ ...s, sourceUri: e.target.value }))} />
              <Input placeholder="source digest (optional hex)" value={att.sourceDigest} onChange={e => setAtt(s => ({ ...s, sourceDigest: e.target.value }))} className="md:col-span-2" />
            </div>
            <Button onClick={() => create.mutate()} disabled={create.isPending}><FileBadge className="mr-1 h-3 w-3" /> Sign &amp; create</Button>
          </TabsContent>

          <TabsContent value="sbom" className="space-y-2">
            <div className="grid gap-2 md:grid-cols-2">
              <Select value={sbom.format} onValueChange={(v: any) => setSbom(s => ({ ...s, format: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{["cyclonedx","spdx","syft-json"].map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
              </Select>
              <div className="flex items-center gap-2"><input type="checkbox" checked={sbom.sign} onChange={e => setSbom(s => ({ ...s, sign: e.target.checked }))} /><Label>Sign envelope</Label></div>
              <Textarea rows={4} value={sbom.componentsText} onChange={e => setSbom(s => ({ ...s, componentsText: e.target.value }))} placeholder="name@version per line" className="md:col-span-2 font-mono text-xs" />
              <Textarea rows={3} value={sbom.vulnsText} onChange={e => setSbom(s => ({ ...s, vulnsText: e.target.value }))} placeholder="CVE-ID|severity per line" className="md:col-span-2 font-mono text-xs" />
            </div>
            <Button onClick={() => ingest.mutate()}>Ingest SBOM</Button>
            <div className="space-y-1 text-sm">
              {(sboms.data ?? []).map((s: any) => (
                <div key={s.id} className="rounded-md border p-2 text-xs">
                  <div className="flex gap-2">
                    <Badge variant="outline">{s.format}</Badge>
                    <span>{s.component_count} components · {s.vulnerabilities_count} vulns</span>
                    {s.signed && <Badge variant="outline" className="text-emerald-600">signed</Badge>}
                  </div>
                  <div className="text-muted-foreground">crit {s.severity_rollup?.critical ?? 0} · high {s.severity_rollup?.high ?? 0} · med {s.severity_rollup?.medium ?? 0} · low {s.severity_rollup?.low ?? 0}</div>
                </div>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
