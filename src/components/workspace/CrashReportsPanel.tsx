import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  listCrashReports, listSymbolMaps, uploadSymbolMap, deleteSymbolMap,
  symbolicateCrash, deleteCrashReport, submitTestCrash,
} from "@/lib/crash-telemetry.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Bug, FileWarning, Sparkles, Trash2, Upload, AlertOctagon, Activity } from "lucide-react";
import { toast } from "sonner";

const SEV_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  fatal: "destructive", error: "destructive", warning: "secondary", info: "outline",
};

export function CrashReportsPanel({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const [days, setDays] = useState(14);
  const [platform, setPlatform] = useState<"all" | "ios" | "android" | "web">("all");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [tab, setTab] = useState("issues");

  const list = useServerFn(listCrashReports);
  const symbols = useServerFn(listSymbolMaps);
  const upload = useServerFn(uploadSymbolMap);
  const delSym = useServerFn(deleteSymbolMap);
  const symbolicate = useServerFn(symbolicateCrash);
  const delCrash = useServerFn(deleteCrashReport);
  const test = useServerFn(submitTestCrash);

  const crashQ = useQuery({
    queryKey: ["crash", projectId, days, platform],
    queryFn: () => list({ data: { projectId, days, platform: platform === "all" ? undefined : platform } }),
    refetchInterval: 15000,
  });
  const symQ = useQuery({
    queryKey: ["symbols", projectId],
    queryFn: () => symbols({ data: { projectId } }),
  });

  const symbolicateM = useMutation({
    mutationFn: (id: string) => symbolicate({ data: { id } }),
    onSuccess: () => { toast.success("Symbolicated"); qc.invalidateQueries({ queryKey: ["crash", projectId] }); },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });
  const delCrashM = useMutation({
    mutationFn: (id: string) => delCrash({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crash", projectId] }),
  });
  const delSymM = useMutation({
    mutationFn: (id: string) => delSym({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["symbols", projectId] }),
  });
  const testM = useMutation({
    mutationFn: (p: "ios" | "android" | "web") => test({ data: { projectId, platform: p } }),
    onSuccess: () => { toast.success("Test crash sent"); qc.invalidateQueries({ queryKey: ["crash", projectId] }); },
  });

  // Symbol-map upload form
  const [sp, setSp] = useState<"ios" | "android" | "web">("ios");
  const [sver, setSver] = useState("");
  const [sbuild, setSbuild] = useState("");
  const [skind, setSkind] = useState<"sourcemap" | "dsym" | "proguard">("dsym");

  const uploadM = useMutation({
    mutationFn: async (file: File) => {
      const text = await file.text();
      return upload({ data: { projectId, platform: sp, appVersion: sver || "1.0.0", buildNumber: sbuild || undefined, kind: skind, fileName: file.name, content: text } });
    },
    onSuccess: () => { toast.success("Symbol map uploaded"); qc.invalidateQueries({ queryKey: ["symbols", projectId] }); },
    onError: (e: any) => toast.error(e?.message ?? "Upload failed"),
  });

  const groups = crashQ.data?.groups ?? [];
  const totalEvents = crashQ.data?.items.length ?? 0;
  const fatal = (crashQ.data?.items ?? []).filter((r) => r.severity === "fatal").length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-2 text-sm">
          <span className="flex items-center gap-2"><Bug className="h-4 w-4 text-amber-500" /> Crash Telemetry</span>
          <span className="flex items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="outline" className="gap-1"><Activity className="h-3 w-3" /> {totalEvents} events</Badge>
            {fatal > 0 && <Badge variant="destructive" className="gap-1"><AlertOctagon className="h-3 w-3" /> {fatal} fatal</Badge>}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="issues">Issues</TabsTrigger>
            <TabsTrigger value="symbols">Symbols</TabsTrigger>
            <TabsTrigger value="test">Test</TabsTrigger>
          </TabsList>

          <TabsContent value="issues" className="mt-3 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
                <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[1, 7, 14, 30, 60, 90].map((d) => <SelectItem key={d} value={String(d)}>{d}d window</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={platform} onValueChange={(v) => setPlatform(v as any)}>
                <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All platforms</SelectItem>
                  <SelectItem value="ios">iOS</SelectItem>
                  <SelectItem value="android">Android</SelectItem>
                  <SelectItem value="web">Web</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {groups.length === 0 && <p className="text-xs text-muted-foreground">No crashes in this window.</p>}
            <ul className="space-y-2">
              {groups.map((g) => {
                const isOpen = expanded === g.fingerprint;
                const sample = g.sample;
                return (
                  <li key={g.fingerprint} className="rounded-md border border-border/60 bg-card/30 p-3">
                    <button className="flex w-full items-start justify-between gap-3 text-left" onClick={() => setExpanded(isOpen ? null : g.fingerprint)}>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <Badge variant={SEV_VARIANT[sample.severity]}>{sample.severity}</Badge>
                          <Badge variant="outline">{sample.platform}</Badge>
                          <Badge variant="outline">v{sample.app_version}</Badge>
                          <span className="ml-auto text-xs text-muted-foreground">×{g.count}</span>
                        </div>
                        <p className="mt-1 truncate text-sm font-medium">{sample.message}</p>
                        <p className="truncate font-mono text-xs text-muted-foreground">{g.fingerprint}</p>
                      </div>
                    </button>
                    {isOpen && (
                      <div className="mt-3 space-y-2">
                        <pre className="max-h-56 overflow-auto rounded bg-muted/30 p-2 text-[11px] leading-relaxed">{sample.stack_symbolicated || sample.stack_raw}</pre>
                        <div className="flex flex-wrap gap-2">
                          <Button size="sm" variant="secondary" disabled={symbolicateM.isPending || sample.symbolicated} onClick={() => symbolicateM.mutate(sample.id)}>
                            <Sparkles className="mr-1 h-3 w-3" /> {sample.symbolicated ? "Symbolicated" : "Symbolicate"}
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => delCrashM.mutate(sample.id)}>
                            <Trash2 className="mr-1 h-3 w-3" /> Delete sample
                          </Button>
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </TabsContent>

          <TabsContent value="symbols" className="mt-3 space-y-3">
            <div className="rounded-md border border-border/60 p-3">
              <p className="mb-2 text-xs font-medium">Upload symbol map</p>
              <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                <Select value={sp} onValueChange={(v) => setSp(v as any)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="ios">iOS</SelectItem><SelectItem value="android">Android</SelectItem><SelectItem value="web">Web</SelectItem></SelectContent>
                </Select>
                <Select value={skind} onValueChange={(v) => setSkind(v as any)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="dsym">dSYM (iOS)</SelectItem><SelectItem value="proguard">ProGuard (Android)</SelectItem><SelectItem value="sourcemap">Source map (Web)</SelectItem></SelectContent>
                </Select>
                <Input placeholder="App version (1.2.3)" value={sver} onChange={(e) => setSver(e.target.value)} />
                <Input placeholder="Build # (optional)" value={sbuild} onChange={(e) => setSbuild(e.target.value)} />
              </div>
              <label className="mt-2 inline-flex cursor-pointer items-center gap-2 text-xs">
                <input type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadM.mutate(f); e.currentTarget.value = ""; }} />
                <span className="inline-flex items-center gap-1 rounded-md border border-border/60 px-3 py-1.5 hover:bg-accent"><Upload className="h-3 w-3" /> Pick file</span>
                {uploadM.isPending && <span className="text-muted-foreground">Uploading…</span>}
              </label>
            </div>
            <ul className="space-y-1">
              {(symQ.data?.items ?? []).map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-2 rounded border border-border/60 px-2 py-1.5 text-xs">
                  <div className="flex min-w-0 items-center gap-2">
                    <FileWarning className="h-3 w-3 text-muted-foreground" />
                    <span className="truncate font-mono">{s.file_name}</span>
                    <Badge variant="outline">{s.kind}</Badge>
                    <Badge variant="outline">{s.platform} v{s.app_version}{s.build_number ? `+${s.build_number}` : ""}</Badge>
                    <span className="text-muted-foreground">{(s.size_bytes / 1024).toFixed(1)} KB</span>
                  </div>
                  <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => delSymM.mutate(s.id)}><Trash2 className="h-3 w-3" /></Button>
                </li>
              ))}
              {(symQ.data?.items ?? []).length === 0 && <p className="text-xs text-muted-foreground">No symbol maps uploaded.</p>}
            </ul>
          </TabsContent>

          <TabsContent value="test" className="mt-3 space-y-2">
            <p className="text-xs text-muted-foreground">Trigger a sample crash to verify the ingest pipeline is wired end-to-end.</p>
            <div className="flex gap-2">
              {(["ios", "android", "web"] as const).map((p) => (
                <Button key={p} size="sm" variant="secondary" onClick={() => testM.mutate(p)} disabled={testM.isPending}>
                  Send {p} test crash
                </Button>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              Production apps POST to <code>/api/public/crash/ingest</code> with header
              <code> x-crash-signature: sha256(serviceKey32:projectId:body)</code>.
            </p>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
