import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  listSnapshots, createSnapshot, deleteSnapshot, snapshotDetail, diffSnapshots,
} from "@/lib/bundle-analysis.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Package, Trash2, FileUp, GitCompareArrows, AlertTriangle, Info, Layers } from "lucide-react";
import { toast } from "sonner";

function fmtBytes(n: number) {
  if (!n) return "0 B";
  const u = ["B", "KB", "MB", "GB"]; let i = 0; let v = n;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v >= 100 ? 0 : v >= 10 ? 1 : 2)} ${u[i]}`;
}

const KIND_COLORS: Record<string, string> = {
  js: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  image: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  font: "bg-violet-500/15 text-violet-700 dark:text-violet-300",
  native: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
  asset: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  other: "bg-muted text-muted-foreground",
};

export function BundleAnalyzerPanel({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const _list = useServerFn(listSnapshots);
  const _create = useServerFn(createSnapshot);
  const _del = useServerFn(deleteSnapshot);
  const _detail = useServerFn(snapshotDetail);
  const _diff = useServerFn(diffSnapshots);

  const [platform, setPlatform] = useState<"ios" | "android" | "web">("ios");
  const snapsQ = useQuery({
    queryKey: ["bundle-snaps", projectId, platform],
    queryFn: () => _list({ data: { projectId, platform } }),
  });

  const [version, setVersion] = useState("");
  const [buildNo, setBuildNo] = useState<number | "">("");
  const [notes, setNotes] = useState("");
  const [assetsText, setAssetsText] = useState(
    "main.jsbundle|js|3245678\nlogo@3x.png|image|520000\nFonts/Inter.ttf|font|180000",
  );

  function parseAssets(raw: string) {
    return raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((line) => {
      const [path, kind, bytes, comp] = line.split("|").map((p) => p.trim());
      return {
        path: path || "(unnamed)",
        kind: (["js", "image", "font", "native", "asset", "other"].includes(kind) ? kind : "other") as any,
        bytes: Math.max(0, parseInt(bytes || "0", 10) || 0),
        compressedBytes: comp ? parseInt(comp, 10) : undefined,
      };
    }).filter((a) => a.bytes > 0);
  }

  const createM = useMutation({
    mutationFn: () => _create({ data: {
      projectId, platform, versionName: version, buildNumber: buildNo === "" ? undefined : Number(buildNo),
      notes: notes || undefined, assets: parseAssets(assetsText), source: "manual",
    }}),
    onSuccess: () => { toast.success("Snapshot captured"); qc.invalidateQueries({ queryKey: ["bundle-snaps", projectId, platform] }); setVersion(""); setBuildNo(""); },
    onError: (e: any) => toast.error(e.message),
  });

  const delM = useMutation({
    mutationFn: (id: string) => _del({ data: { id, projectId } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["bundle-snaps", projectId, platform] }),
  });

  const [openSnap, setOpenSnap] = useState<string | null>(null);
  const detailQ = useQuery({
    queryKey: ["bundle-detail", openSnap],
    queryFn: () => _detail({ data: { id: openSnap! } }),
    enabled: !!openSnap,
  });

  const [baseId, setBaseId] = useState("");
  const [headId, setHeadId] = useState("");
  const [diffOut, setDiffOut] = useState<any>(null);

  const total = snapsQ.data?.[0]?.total_bytes ?? 0;

  return (
    <Card className="mt-4">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2"><Package className="h-4 w-4" /> App-size optimizer</CardTitle>
        <div className="flex items-center gap-2 text-xs">
          <select className="border rounded h-8 px-2 bg-background" value={platform} onChange={(e) => setPlatform(e.target.value as any)}>
            <option value="ios">iOS</option><option value="android">Android</option><option value="web">Web</option>
          </select>
          <Badge variant="outline">latest: {fmtBytes(total)}</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="snaps">
          <TabsList>
            <TabsTrigger value="snaps">Snapshots</TabsTrigger>
            <TabsTrigger value="capture">Capture</TabsTrigger>
            <TabsTrigger value="diff">Diff</TabsTrigger>
          </TabsList>

          <TabsContent value="snaps" className="space-y-2">
            {(snapsQ.data ?? []).map((s: any) => (
              <div key={s.id} className="border rounded">
                <div className="flex items-center justify-between p-2">
                  <button className="text-left" onClick={() => setOpenSnap(openSnap === s.id ? null : s.id)}>
                    <div className="text-sm font-mono">{s.version_name}{s.build_number ? ` (${s.build_number})` : ""}
                      <Badge variant="outline" className="ml-2">{fmtBytes(s.total_bytes)}</Badge>
                      <Badge variant="secondary" className="ml-1">{s.platform}</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground">{new Date(s.created_at).toLocaleString()} · {s.source}</div>
                  </button>
                  <Button size="icon" variant="ghost" onClick={() => delM.mutate(s.id)}><Trash2 className="h-4 w-4" /></Button>
                </div>
                {openSnap === s.id && detailQ.data && (
                  <div className="border-t p-3 space-y-3">
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(detailQ.data.breakdown).map(([k, v]: [string, any]) => (
                        <Badge key={k} className={KIND_COLORS[k] ?? ""} variant="outline">
                          <Layers className="h-3 w-3 mr-1" />{k}: {v.count} · {fmtBytes(v.bytes)}
                        </Badge>
                      ))}
                    </div>
                    {detailQ.data.recommendations.length > 0 && (
                      <div className="space-y-1">
                        <div className="text-xs font-semibold">Recommendations</div>
                        {detailQ.data.recommendations.map((r: any, i: number) => (
                          <div key={i} className="text-xs flex gap-2 items-start">
                            {r.severity === "warn" ? <AlertTriangle className="h-3 w-3 text-amber-500 mt-0.5" /> : <Info className="h-3 w-3 text-sky-500 mt-0.5" />}
                            <span>{r.message}{r.path ? <span className="text-muted-foreground"> — {r.path}</span> : null}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    <div>
                      <div className="text-xs font-semibold mb-1">Top assets</div>
                      <div className="max-h-72 overflow-auto border rounded">
                        {detailQ.data.assets.slice(0, 100).map((a: any) => (
                          <div key={a.path} className="grid grid-cols-[1fr_70px_90px] gap-2 text-xs px-2 py-1 border-b">
                            <div className="font-mono truncate" title={a.path}>{a.path}</div>
                            <Badge variant="outline" className={KIND_COLORS[a.kind]}>{a.kind}</Badge>
                            <div className="text-right">{fmtBytes(a.bytes)}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
            {!snapsQ.data?.length && <div className="text-xs text-muted-foreground">No snapshots for {platform} yet.</div>}
          </TabsContent>

          <TabsContent value="capture" className="space-y-2">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              <div><Label>Version</Label><Input value={version} onChange={(e) => setVersion(e.target.value)} placeholder="1.4.0" /></div>
              <div><Label>Build #</Label><Input type="number" value={buildNo as any} onChange={(e) => setBuildNo(e.target.value === "" ? "" : Number(e.target.value))} /></div>
              <div className="md:col-span-3"><Label>Notes</Label><Input value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
              <div className="md:col-span-3">
                <Label>Assets (one per line: <code>path|kind|bytes|compressed?</code>; kind: js/image/font/native/asset/other)</Label>
                <Textarea rows={6} value={assetsText} onChange={(e) => setAssetsText(e.target.value)} className="font-mono text-xs" />
              </div>
            </div>
            <Button disabled={!version || createM.isPending} onClick={() => createM.mutate()}>
              <FileUp className="h-4 w-4 mr-1" />Capture snapshot
            </Button>
          </TabsContent>

          <TabsContent value="diff" className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <select className="border rounded h-9 px-2 bg-background" value={baseId} onChange={(e) => setBaseId(e.target.value)}>
                <option value="">Base —</option>
                {(snapsQ.data ?? []).map((s: any) => <option key={s.id} value={s.id}>{s.version_name} ({fmtBytes(s.total_bytes)})</option>)}
              </select>
              <select className="border rounded h-9 px-2 bg-background" value={headId} onChange={(e) => setHeadId(e.target.value)}>
                <option value="">Head —</option>
                {(snapsQ.data ?? []).map((s: any) => <option key={s.id} value={s.id}>{s.version_name} ({fmtBytes(s.total_bytes)})</option>)}
              </select>
            </div>
            <Button disabled={!baseId || !headId || baseId === headId} onClick={async () => {
              try { setDiffOut(await _diff({ data: { baseId, headId } })); }
              catch (e: any) { toast.error(e.message); }
            }}><GitCompareArrows className="h-4 w-4 mr-1" />Compare</Button>
            {diffOut && (
              <div className="space-y-2 text-xs">
                <div className="font-semibold">
                  Δ total: <span className={diffOut.totalDelta > 0 ? "text-rose-500" : "text-emerald-500"}>
                    {diffOut.totalDelta > 0 ? "+" : ""}{fmtBytes(Math.abs(diffOut.totalDelta))}
                  </span>
                </div>
                <div className="max-h-80 overflow-auto border rounded">
                  {diffOut.changes.map((c: any) => (
                    <div key={c.path} className="grid grid-cols-[1fr_70px_90px_90px] gap-2 px-2 py-1 border-b">
                      <div className="font-mono truncate" title={c.path}>{c.path}</div>
                      <Badge variant="outline" className={KIND_COLORS[c.kind]}>{c.kind}</Badge>
                      <div className="text-right">{fmtBytes(c.base)} → {fmtBytes(c.head)}</div>
                      <div className={`text-right font-semibold ${c.delta > 0 ? "text-rose-500" : "text-emerald-500"}`}>
                        {c.delta > 0 ? "+" : "−"}{fmtBytes(Math.abs(c.delta))}
                      </div>
                    </div>
                  ))}
                  {!diffOut.changes.length && <div className="text-muted-foreground p-2">No asset-level changes.</div>}
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
