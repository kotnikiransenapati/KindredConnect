// P45 — Impact analysis bot panel.
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createScan, deleteScan, getScanFindings, listScans } from "@/lib/impact-analysis.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Radar, Trash2 } from "lucide-react";

const riskTone: Record<string, string> = {
  low: "border-emerald-500/40 bg-emerald-500/10 text-emerald-600",
  medium: "border-amber-500/40 bg-amber-500/10 text-amber-600",
  high: "border-orange-500/40 bg-orange-500/10 text-orange-600",
  critical: "bg-destructive text-destructive-foreground",
};

export function ImpactAnalysisPanel({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const lFn = useServerFn(listScans);
  const cFn = useServerFn(createScan);
  const fFn = useServerFn(getScanFindings);
  const dFn = useServerFn(deleteScan);

  const scans = useQuery({ queryKey: ["impact-scans", projectId], queryFn: () => lFn({ data: { projectId } }) });
  const [form, setForm] = useState({
    title: "PR #142 — Refactor checkout flow", branch: "feat/checkout-v2",
    files: "src/routes/checkout.tsx | 120 | 40\nsrc/lib/payments.functions.ts | 80 | 12\nsupabase/migrations/20260101_add_orders.sql | 50 | 0",
  });
  const [openId, setOpenId] = useState<string | null>(null);
  const findings = useQuery({
    queryKey: ["impact-findings", projectId, openId],
    queryFn: () => fFn({ data: { projectId, scanId: openId! } }),
    enabled: !!openId,
  });

  const submit = useMutation({
    mutationFn: () => cFn({
      data: {
        projectId, title: form.title, branch: form.branch || undefined,
        files: form.files.split("\n").map((l) => l.trim()).filter(Boolean).map((line) => {
          const [path, add = "0", del = "0"] = line.split("|").map((s) => s.trim());
          return { path, additions: Number(add) || 0, deletions: Number(del) || 0 };
        }),
      },
    }),
    onSuccess: () => { toast.success("Scan complete"); qc.invalidateQueries({ queryKey: ["impact-scans", projectId] }); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Card className="border-border/60">
      <CardHeader className="flex flex-row items-center gap-2">
        <Radar className="h-4 w-4 text-primary" />
        <CardTitle className="text-base">Impact analysis</CardTitle>
        <Badge variant="outline" className="ml-2">P45</Badge>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="run">
          <TabsList>
            <TabsTrigger value="run">Run scan</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
            <TabsTrigger value="findings" disabled={!openId}>Findings</TabsTrigger>
          </TabsList>

          <TabsContent value="run" className="space-y-3">
            <div className="grid gap-2 md:grid-cols-2">
              <div><Label>Title</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
              <div><Label>Branch</Label><Input value={form.branch} onChange={(e) => setForm({ ...form, branch: e.target.value })} /></div>
            </div>
            <div>
              <Label>Changed files (path | additions | deletions)</Label>
              <Textarea rows={6} value={form.files} onChange={(e) => setForm({ ...form, files: e.target.value })} className="font-mono text-xs" />
            </div>
            <Button onClick={() => submit.mutate()} disabled={submit.isPending} size="sm">Analyze impact</Button>
          </TabsContent>

          <TabsContent value="history" className="space-y-2">
            {(scans.data ?? []).map((s: any) => (
              <div key={s.id} className="flex items-center justify-between rounded-md border border-border/60 p-2 text-sm">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`rounded border px-1.5 py-0.5 text-[10px] uppercase ${riskTone[s.risk_level]}`}>{s.risk_level} · {s.risk_score}</span>
                    <span className="font-medium truncate">{s.title}</span>
                  </div>
                  <div className="truncate text-xs text-muted-foreground">{s.summary}</div>
                  <div className="text-[10px] text-muted-foreground">reviewers: {(s.reviewer_suggestions ?? []).join(", ")}</div>
                </div>
                <div className="flex items-center gap-1">
                  <Button size="sm" variant="outline" onClick={() => setOpenId(s.id)}>Open</Button>
                  <Button size="sm" variant="ghost" onClick={() => dFn({ data: { projectId, id: s.id } }).then(() => qc.invalidateQueries({ queryKey: ["impact-scans", projectId] }))}><Trash2 className="h-3.5 w-3.5" /></Button>
                </div>
              </div>
            ))}
          </TabsContent>

          <TabsContent value="findings" className="space-y-2">
            {(findings.data ?? []).map((f: any) => (
              <div key={f.id} className="rounded-md border border-border/60 p-2 text-xs">
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{f.component}</Badge>
                  <span className={`rounded border px-1.5 py-0.5 text-[10px] uppercase ${riskTone[f.severity] ?? ""}`}>{f.severity}</span>
                  <span className="font-mono text-[10px]">{f.file_path}</span>
                </div>
                <div className="mt-1 text-muted-foreground">{f.message} · blast radius {f.blast_radius}{f.affected_routes?.length ? ` · routes: ${f.affected_routes.join(", ")}` : ""}</div>
              </div>
            ))}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
