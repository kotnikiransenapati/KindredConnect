import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { toast } from "sonner";
import { ShieldCheck, Paperclip, Trash2 } from "lucide-react";
import {
  listControls, upsertControl, deleteControl, listArtifacts, attachArtifact, deleteArtifact, complianceSummary,
} from "@/lib/evidence-vault.functions";

const FRAMEWORKS = ["soc2", "iso27001", "hipaa", "gdpr", "pci", "custom"] as const;
const STATUSES = ["not_started", "in_progress", "implemented", "verified", "not_applicable"] as const;
const KINDS = ["document", "screenshot", "log", "config", "attestation", "policy", "other"] as const;

export function EvidenceVaultPanel({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const lCtrl = useServerFn(listControls);
  const upCtrl = useServerFn(upsertControl);
  const delCtrl = useServerFn(deleteControl);
  const lArt = useServerFn(listArtifacts);
  const upArt = useServerFn(attachArtifact);
  const delArt = useServerFn(deleteArtifact);
  const sum = useServerFn(complianceSummary);

  const ctrlsQ = useQuery({ queryKey: ["ev-ctrl", projectId], queryFn: () => lCtrl({ data: { projectId } }), refetchInterval: 15_000 });
  const sumQ = useQuery({ queryKey: ["ev-sum", projectId], queryFn: () => sum({ data: { projectId } }), refetchInterval: 15_000 });

  const [form, setForm] = useState({
    framework: "soc2" as (typeof FRAMEWORKS)[number],
    controlId: "", title: "", description: "", owner: "",
    status: "in_progress" as (typeof STATUSES)[number],
    nextReviewDays: 90,
  });
  const addM = useMutation({
    mutationFn: () => upCtrl({ data: { projectId, ...form } }),
    onSuccess: () => { toast.success("Control saved"); setForm({ ...form, controlId: "", title: "", description: "", owner: "" }); qc.invalidateQueries({ queryKey: ["ev-ctrl", projectId] }); qc.invalidateQueries({ queryKey: ["ev-sum", projectId] }); },
    onError: (e: any) => toast.error(e.message),
  });
  const statusM = useMutation({
    mutationFn: (v: { id: string; framework: any; controlId: string; title: string; status: any }) =>
      upCtrl({ data: { projectId, ...v } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["ev-ctrl", projectId] }); qc.invalidateQueries({ queryKey: ["ev-sum", projectId] }); },
  });
  const removeM = useMutation({
    mutationFn: (id: string) => delCtrl({ data: { projectId, id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ev-ctrl", projectId] }),
    onError: (e: any) => toast.error(e.message),
  });

  const [activeCtrl, setActiveCtrl] = useState<string | null>(null);
  const artsQ = useQuery({
    queryKey: ["ev-art", activeCtrl], queryFn: () => lArt({ data: { projectId, controlId: activeCtrl! } }),
    enabled: !!activeCtrl,
  });
  const [artForm, setArtForm] = useState({ kind: "document" as (typeof KINDS)[number], title: "", content: "", uri: "", retentionDays: 365 });
  const attachM = useMutation({
    mutationFn: () => upArt({ data: { projectId, controlId: activeCtrl!, kind: artForm.kind, title: artForm.title, content: artForm.content, uri: artForm.uri || undefined, retentionDays: artForm.retentionDays } }),
    onSuccess: () => { toast.success("Artifact attached"); setArtForm({ ...artForm, title: "", content: "", uri: "" }); qc.invalidateQueries({ queryKey: ["ev-art", activeCtrl] }); },
    onError: (e: any) => toast.error(e.message),
  });
  const delArtM = useMutation({
    mutationFn: (id: string) => delArt({ data: { projectId, id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ev-art", activeCtrl] }),
    onError: (e: any) => toast.error(e.message),
  });

  const ctrls = (ctrlsQ.data ?? []) as any[];
  const summary = (sumQ.data as any) ?? { total: 0, verified: 0, implemented: 0, coverage: 0, byFramework: {} };

  return (
    <Card className="border-border/60 bg-card/40">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldCheck className="h-4 w-4 text-primary" /> Compliance Evidence Vault
          <Badge variant="outline" className="ml-2">{summary.coverage}% coverage</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Progress value={summary.coverage} className="h-2" />
          <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
            <span>{summary.verified} verified</span>
            <span>{summary.implemented} implemented</span>
            <span>{summary.total} total</span>
          </div>
        </div>

        <div className="grid gap-2 md:grid-cols-[120px_120px_1fr_140px_auto]">
          <Select value={form.framework} onValueChange={(v) => setForm({ ...form, framework: v as any })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{FRAMEWORKS.map((f) => <SelectItem key={f} value={f}>{f.toUpperCase()}</SelectItem>)}</SelectContent>
          </Select>
          <Input placeholder="ID (CC1.1)" value={form.controlId} onChange={(e) => setForm({ ...form, controlId: e.target.value })} />
          <Input placeholder="Control title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <Input placeholder="Owner" value={form.owner} onChange={(e) => setForm({ ...form, owner: e.target.value })} />
          <Button onClick={() => addM.mutate()} disabled={!form.controlId || !form.title || addM.isPending}>Save</Button>
        </div>

        <div className="space-y-2">
          {ctrls.length === 0 && <p className="text-xs text-muted-foreground">No controls yet.</p>}
          {ctrls.map((c) => (
            <div key={c.id} className="rounded-lg border border-border/60 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">{c.framework.toUpperCase()}</Badge>
                <Badge variant="secondary">{c.control_id}</Badge>
                <span className="text-sm font-medium">{c.title}</span>
                {c.owner && <span className="text-xs text-muted-foreground">· {c.owner}</span>}
                <div className="ml-auto flex items-center gap-2">
                  <Select value={c.status}
                    onValueChange={(v) => statusM.mutate({ id: c.id, framework: c.framework, controlId: c.control_id, title: c.title, status: v })}>
                    <SelectTrigger className="h-7 w-[140px] text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s}>{s.replace("_", " ")}</SelectItem>)}</SelectContent>
                  </Select>
                  <Button size="sm" variant="ghost" onClick={() => setActiveCtrl(activeCtrl === c.id ? null : c.id)}>
                    <Paperclip className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="sm" variant="ghost" className="text-destructive" onClick={() => removeM.mutate(c.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
              {activeCtrl === c.id && (
                <div className="mt-3 space-y-2 rounded-md border border-border/40 bg-background/40 p-2">
                  <div className="grid gap-2 md:grid-cols-[120px_1fr_1fr_100px_auto]">
                    <Select value={artForm.kind} onValueChange={(v) => setArtForm({ ...artForm, kind: v as any })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{KINDS.map((k) => <SelectItem key={k} value={k}>{k}</SelectItem>)}</SelectContent>
                    </Select>
                    <Input placeholder="Artifact title" value={artForm.title} onChange={(e) => setArtForm({ ...artForm, title: e.target.value })} />
                    <Input placeholder="Source URI (optional)" value={artForm.uri} onChange={(e) => setArtForm({ ...artForm, uri: e.target.value })} />
                    <Input type="number" min={1} max={3650} value={artForm.retentionDays}
                      onChange={(e) => setArtForm({ ...artForm, retentionDays: Number(e.target.value) || 365 })} />
                    <Button size="sm" onClick={() => attachM.mutate()} disabled={!artForm.title || !artForm.content}>Hash & attach</Button>
                  </div>
                  <Label className="text-xs">Evidence content (hashed with SHA-256; not stored in plaintext beyond this request)</Label>
                  <Textarea className="min-h-[60px] font-mono text-xs" value={artForm.content}
                    onChange={(e) => setArtForm({ ...artForm, content: e.target.value })} />
                  <div className="space-y-1 text-xs">
                    {(artsQ.data ?? []).map((a: any) => (
                      <div key={a.id} className="flex items-center justify-between rounded border border-border/40 px-2 py-1">
                        <span className="truncate">
                          <Badge variant="outline" className="mr-1">{a.kind}</Badge>
                          {a.title} <span className="ml-1 font-mono text-[10px] text-muted-foreground">{a.sha256.slice(0, 12)}…</span>
                        </span>
                        <Button size="sm" variant="ghost" className="h-6 px-2 text-destructive" onClick={() => delArtM.mutate(a.id)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
