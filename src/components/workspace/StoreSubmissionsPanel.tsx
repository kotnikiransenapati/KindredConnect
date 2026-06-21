import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  listSubmissions, createSubmission, runValidation, submitToStore,
  transitionStatus, deleteSubmission, listSubmissionEvents,
} from "@/lib/store-submissions.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Rocket, CheckCircle2, AlertTriangle, Clock, Trash2, Send, ShieldCheck, XCircle } from "lucide-react";
import { toast } from "sonner";

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  draft: "outline", validating: "secondary", validation_failed: "destructive",
  submitted: "secondary", in_review: "secondary", approved: "default",
  rejected: "destructive", released: "default", withdrawn: "outline",
};

const NEXT_OPTIONS: Record<string, string[]> = {
  submitted: ["in_review", "rejected", "withdrawn"],
  in_review: ["approved", "rejected", "withdrawn"],
  approved: ["released", "withdrawn"],
  rejected: ["draft"],
  released: [], withdrawn: ["draft"], draft: [], validating: [], validation_failed: [],
};

export function StoreSubmissionsPanel({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState<string | null>(null);

  const list = useServerFn(listSubmissions);
  const create = useServerFn(createSubmission);
  const validate = useServerFn(runValidation);
  const submit = useServerFn(submitToStore);
  const transition = useServerFn(transitionStatus);
  const del = useServerFn(deleteSubmission);
  const events = useServerFn(listSubmissionEvents);

  const subQ = useQuery({
    queryKey: ["store_subs", projectId],
    queryFn: () => list({ data: { projectId } }),
    refetchInterval: 12000,
  });

  // Composer
  const [platform, setPlatform] = useState<"ios" | "android">("ios");
  const [track, setTrack] = useState<"production" | "beta" | "internal" | "alpha" | "testflight">("production");
  const [versionName, setVersionName] = useState("");
  const [versionCode, setVersionCode] = useState("");
  const [notes, setNotes] = useState("");

  const createM = useMutation({
    mutationFn: () => create({ data: { projectId, platform, track, versionName, versionCode: versionCode || undefined, releaseNotes: notes || undefined } }),
    onSuccess: () => { toast.success("Submission drafted"); setVersionName(""); setVersionCode(""); setNotes(""); qc.invalidateQueries({ queryKey: ["store_subs", projectId] }); },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });
  const validateM = useMutation({
    mutationFn: (id: string) => validate({ data: { submissionId: id } }),
    onSuccess: (r) => { toast[r.ok ? "success" : "error"](r.ok ? "Validation passed" : `Validation failed (${r.findings.length} issues)`); qc.invalidateQueries({ queryKey: ["store_subs", projectId] }); },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });
  const submitM = useMutation({
    mutationFn: (id: string) => submit({ data: { submissionId: id } }),
    onSuccess: () => { toast.success("Submitted to store"); qc.invalidateQueries({ queryKey: ["store_subs", projectId] }); },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });
  const transitionM = useMutation({
    mutationFn: (v: { id: string; next: string }) => transition({ data: { submissionId: v.id, nextStatus: v.next as any } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["store_subs", projectId] }),
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });
  const delM = useMutation({
    mutationFn: (id: string) => del({ data: { submissionId: id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["store_subs", projectId] }),
  });

  const items = subQ.data?.items ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-2 text-sm">
          <span className="flex items-center gap-2"><Rocket className="h-4 w-4 text-violet-500" /> Store Submissions</span>
          <Badge variant="outline">{items.length} active</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-md border border-border/60 p-3">
          <p className="mb-2 text-xs font-medium">New submission</p>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <Select value={platform} onValueChange={(v) => setPlatform(v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="ios">iOS App Store</SelectItem><SelectItem value="android">Google Play</SelectItem></SelectContent>
            </Select>
            <Select value={track} onValueChange={(v) => setTrack(v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="production">Production</SelectItem>
                <SelectItem value="beta">Beta</SelectItem>
                <SelectItem value="internal">Internal</SelectItem>
                <SelectItem value="alpha">Alpha</SelectItem>
                <SelectItem value="testflight">TestFlight</SelectItem>
              </SelectContent>
            </Select>
            <Input placeholder="Version (1.2.3)" value={versionName} onChange={(e) => setVersionName(e.target.value)} />
            <Input placeholder="Build code (101)" value={versionCode} onChange={(e) => setVersionCode(e.target.value)} />
          </div>
          <Textarea className="mt-2" rows={2} placeholder="Release notes (what's new in this version)" value={notes} onChange={(e) => setNotes(e.target.value)} />
          <div className="mt-2 flex justify-end">
            <Button size="sm" onClick={() => createM.mutate()} disabled={!versionName || createM.isPending}>
              <Send className="mr-1 h-3 w-3" /> Draft submission
            </Button>
          </div>
        </div>

        <ul className="space-y-2">
          {items.map((s) => {
            const isOpen = expanded === s.id;
            const report = (s.validation_report ?? {}) as { ok?: boolean; findings?: Array<{ severity: string; message: string }> };
            const findings = report.findings ?? [];
            const opts = NEXT_OPTIONS[s.status] ?? [];
            return (
              <li key={s.id} className="rounded-md border border-border/60 bg-card/30">
                <button className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left" onClick={() => setExpanded(isOpen ? null : s.id)}>
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <Badge variant={STATUS_VARIANT[s.status]}>{s.status.replace("_", " ")}</Badge>
                    <Badge variant="outline">{s.platform}</Badge>
                    <Badge variant="outline">{s.track}</Badge>
                    <span className="truncate text-sm font-medium">v{s.version_name}{s.version_code ? ` (${s.version_code})` : ""}</span>
                  </div>
                  <span className="text-[11px] text-muted-foreground">{new Date(s.created_at).toLocaleDateString()}</span>
                </button>
                {isOpen && (
                  <div className="space-y-3 border-t border-border/60 p-3">
                    {s.release_notes && <p className="whitespace-pre-wrap rounded bg-muted/30 p-2 text-xs">{s.release_notes}</p>}
                    {findings.length > 0 && (
                      <ul className="space-y-1">
                        {findings.map((f, i) => (
                          <li key={i} className="flex items-start gap-2 text-xs">
                            {f.severity === "error" ? <XCircle className="h-3 w-3 text-destructive" /> :
                              f.severity === "warning" ? <AlertTriangle className="h-3 w-3 text-amber-500" /> :
                              <CheckCircle2 className="h-3 w-3 text-emerald-500" />}
                            <span>{f.message}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                    <SubmissionEvents id={s.id} fetcher={events} />
                    <div className="flex flex-wrap items-center gap-2">
                      <Button size="sm" variant="secondary" onClick={() => validateM.mutate(s.id)} disabled={validateM.isPending || ["released", "submitted", "in_review", "approved"].includes(s.status)}>
                        <ShieldCheck className="mr-1 h-3 w-3" /> Validate
                      </Button>
                      <Button size="sm" onClick={() => submitM.mutate(s.id)} disabled={submitM.isPending || !report.ok || s.status !== "draft"}>
                        <Rocket className="mr-1 h-3 w-3" /> Submit to store
                      </Button>
                      {opts.map((o) => (
                        <Button key={o} size="sm" variant="ghost" onClick={() => transitionM.mutate({ id: s.id, next: o })}>
                          → {o.replace("_", " ")}
                        </Button>
                      ))}
                      <Button size="sm" variant="ghost" className="ml-auto" onClick={() => delM.mutate(s.id)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
          {items.length === 0 && <p className="text-xs text-muted-foreground">No submissions yet — draft your first release above.</p>}
        </ul>
      </CardContent>
    </Card>
  );
}

function SubmissionEvents({ id, fetcher }: { id: string; fetcher: ReturnType<typeof useServerFn<typeof listSubmissionEvents>> }) {
  const q = useQuery({
    queryKey: ["sub_events", id],
    queryFn: () => fetcher({ data: { submissionId: id } }),
    refetchInterval: 8000,
  });
  const items = q.data?.items ?? [];
  if (!items.length) return null;
  return (
    <div className="rounded border border-border/60 bg-muted/20 p-2">
      <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Timeline</p>
      <ol className="space-y-1">
        {items.slice(0, 12).map((e) => (
          <li key={e.id} className="flex items-start gap-2 text-[11px]">
            <Clock className="mt-0.5 h-3 w-3 text-muted-foreground" />
            <span className="font-mono">{new Date(e.created_at).toLocaleTimeString()}</span>
            <span className="font-medium">{e.event}</span>
            {e.detail && <span className="truncate text-muted-foreground">— {e.detail}</span>}
          </li>
        ))}
      </ol>
    </div>
  );
}
