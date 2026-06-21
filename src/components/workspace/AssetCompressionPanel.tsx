import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  listJobs, summary, enqueueJobs, runQueue, retryJob, deleteJob,
} from "@/lib/asset-compression.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, Play, RotateCw, Trash2, Zap } from "lucide-react";

function fmtBytes(n: number) {
  if (!n) return "0 B";
  const u = ["B", "KB", "MB", "GB"]; let i = 0; let v = n;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v < 10 ? 2 : 1)} ${u[i]}`;
}

export function AssetCompressionPanel({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const list = useServerFn(listJobs); const sum = useServerFn(summary);
  const enq = useServerFn(enqueueJobs); const run = useServerFn(runQueue);
  const retry = useServerFn(retryJob); const del = useServerFn(deleteJob);

  const jobs = useQuery({ queryKey: ["asset-jobs", projectId],
    queryFn: () => list({ data: { projectId } }), refetchInterval: 6000 });
  const stats = useQuery({ queryKey: ["asset-summary", projectId],
    queryFn: () => sum({ data: { projectId } }), refetchInterval: 6000 });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["asset-jobs", projectId] });
    qc.invalidateQueries({ queryKey: ["asset-summary", projectId] });
  };

  const [kind, setKind] = useState<"image"|"font"|"js"|"css"|"other">("image");
  const [fmt, setFmt] = useState<"webp"|"avif"|"jpeg"|"png"|"woff2"|"gzip"|"brotli"|"passthrough">("webp");
  const [quality, setQuality] = useState<number>(78);
  const [paste, setPaste] = useState("");

  const enqM = useMutation({
    mutationFn: async () => {
      const lines = paste.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      const rows = lines.map((l) => {
        const [path, bytes] = l.split("|").map(s => s.trim());
        return { sourcePath: path, sourceKind: kind, outputFormat: fmt,
          originalBytes: Number(bytes) || 0, quality };
      }).filter(r => r.sourcePath && r.originalBytes >= 0);
      if (!rows.length) throw new Error("No valid rows. Format: path|bytes per line");
      return enq({ data: { projectId, jobs: rows } });
    },
    onSuccess: (r) => { toast.success(`Enqueued ${r.enqueued}`); setPaste(""); invalidate(); },
    onError: (e: any) => toast.error(e.message),
  });

  const runM = useMutation({
    mutationFn: () => run({ data: { projectId, batch: 20 } }),
    onSuccess: (r) => { toast.success(`Compressed ${r.processed} • saved ${fmtBytes(r.savings)}`); invalidate(); },
    onError: (e: any) => toast.error(e.message),
  });

  const totals = stats.data?.totals;
  const byFormat = stats.data?.byFormat ?? {};

  const savingsPct = useMemo(() => {
    if (!totals?.original) return 0;
    return Math.round((totals.savings / totals.original) * 100);
  }, [totals]);

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2"><Zap className="h-4 w-4 text-amber-500" />Asset Compression</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">AI-driven WebP/AVIF/Brotli pipeline for iOS, Android & web bundles</p>
        </div>
        <Button size="sm" onClick={() => runM.mutate()} disabled={runM.isPending}>
          {runM.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
          <span className="ml-2">Run queue</span>
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Stat label="Jobs" value={String(totals?.jobs ?? 0)} />
          <Stat label="Original" value={fmtBytes(totals?.original ?? 0)} />
          <Stat label="Compressed" value={fmtBytes(totals?.compressed ?? 0)} />
          <Stat label="Saved" value={`${fmtBytes(totals?.savings ?? 0)} • ${savingsPct}%`} accent />
        </div>

        <Tabs defaultValue="jobs">
          <TabsList>
            <TabsTrigger value="jobs">Jobs</TabsTrigger>
            <TabsTrigger value="enqueue">Enqueue</TabsTrigger>
            <TabsTrigger value="formats">Formats</TabsTrigger>
          </TabsList>

          <TabsContent value="jobs" className="space-y-2">
            {jobs.isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> :
              (jobs.data ?? []).length === 0 ? <p className="text-xs text-muted-foreground">No jobs yet.</p> :
              <div className="space-y-1 max-h-96 overflow-y-auto">
                {(jobs.data ?? []).map((j: any) => (
                  <div key={j.id} className="flex items-center justify-between gap-2 rounded border p-2 text-xs">
                    <div className="min-w-0 flex-1">
                      <div className="font-mono truncate">{j.source_path}</div>
                      <div className="text-muted-foreground">
                        {j.source_kind} → {j.output_format} • {fmtBytes(j.original_bytes)} → {fmtBytes(j.compressed_bytes)}
                        {j.savings_bytes > 0 ? <span className="text-emerald-600"> (-{fmtBytes(j.savings_bytes)})</span> : null}
                      </div>
                      {j.error && <div className="text-destructive">{j.error}</div>}
                    </div>
                    <Badge variant={
                      j.status === "succeeded" ? "default" :
                      j.status === "failed" ? "destructive" :
                      j.status === "running" ? "secondary" : "outline"
                    }>{j.status}</Badge>
                    {(j.status === "failed" || j.status === "skipped") && (
                      <Button size="icon" variant="ghost" onClick={() => retry({ data: { projectId, jobId: j.id } }).then(invalidate)}>
                        <RotateCw className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    <Button size="icon" variant="ghost" onClick={() => del({ data: { projectId, jobId: j.id } }).then(invalidate)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            }
          </TabsContent>

          <TabsContent value="enqueue" className="space-y-2">
            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label className="text-xs">Kind</Label>
                <Select value={kind} onValueChange={(v) => setKind(v as any)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["image","font","js","css","other"].map(k => <SelectItem key={k} value={k}>{k}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Output</Label>
                <Select value={fmt} onValueChange={(v) => setFmt(v as any)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["webp","avif","jpeg","png","woff2","gzip","brotli","passthrough"].map(k =>
                      <SelectItem key={k} value={k}>{k}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Quality</Label>
                <Input type="number" min={1} max={100} value={quality} onChange={(e) => setQuality(Number(e.target.value) || 78)} />
              </div>
            </div>
            <Textarea rows={5} placeholder={"src/assets/hero.png|812345\nsrc/assets/logo.png|45120"}
              value={paste} onChange={(e) => setPaste(e.target.value)} />
            <Button size="sm" onClick={() => enqM.mutate()} disabled={enqM.isPending || !paste.trim()}>
              {enqM.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Enqueue
            </Button>
          </TabsContent>

          <TabsContent value="formats" className="space-y-1">
            {Object.keys(byFormat).length === 0 ? <p className="text-xs text-muted-foreground">No data.</p> :
              Object.entries(byFormat).map(([f, v]: any) => (
                <div key={f} className="flex justify-between text-xs border-b py-1">
                  <span className="font-mono">{f}</span>
                  <span>{v.count} jobs • saved {fmtBytes(v.savings)}</span>
                </div>
              ))}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`rounded-lg border p-2 ${accent ? "border-emerald-500/40 bg-emerald-500/5" : ""}`}>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold">{value}</div>
    </div>
  );
}
