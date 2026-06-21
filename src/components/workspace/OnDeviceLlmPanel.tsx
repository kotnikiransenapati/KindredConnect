// P36 — On-device LLM packaging panel.
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  listModels, upsertModel, deleteModel,
  listBuilds, enqueueBuild, finalizeBuild, revokeBuild,
  logDownload, modelStats,
} from "@/lib/on-device-llm.functions";
import { estimateBuildSize } from "@/lib/on-device-llm.shared";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, Cpu, Package, Trash2, Hammer, Download, BarChart3 } from "lucide-react";

const QUANTS = ["q4_k_m","q5_k_m","q8_0","fp16"] as const;
const PLATFORMS = ["ios","android","web"] as const;
const FAMILIES = ["llama","phi","gemma","qwen","mistral","tinyllama","custom"] as const;

const STATUS_TONE: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  available: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
  deprecated: "bg-amber-500/15 text-amber-600 border-amber-500/30",
  archived: "bg-secondary text-secondary-foreground",
  queued: "bg-muted text-muted-foreground",
  building: "bg-amber-500/15 text-amber-600 border-amber-500/30",
  ready: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
  failed: "bg-destructive/15 text-destructive border-destructive/30",
  revoked: "bg-destructive/15 text-destructive border-destructive/30",
};

async function sha256Hex(s: string) {
  const buf = new TextEncoder().encode(s);
  const h = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(h)).map(b => b.toString(16).padStart(2,"0")).join("");
}

export function OnDeviceLlmPanel({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const lm = useServerFn(listModels);
  const um = useServerFn(upsertModel);
  const dm = useServerFn(deleteModel);
  const lb = useServerFn(listBuilds);
  const eb = useServerFn(enqueueBuild);
  const fb = useServerFn(finalizeBuild);
  const rb = useServerFn(revokeBuild);
  const ld = useServerFn(logDownload);
  const ms = useServerFn(modelStats);

  const models = useQuery({ queryKey: ["odm", projectId], queryFn: () => lm({ data: { projectId } }) });
  const builds = useQuery({
    queryKey: ["odm-builds", projectId],
    queryFn: () => lb({ data: { projectId } }),
    refetchInterval: 8_000,
  });
  const stats = useQuery({
    queryKey: ["odm-stats", projectId],
    queryFn: () => ms({ data: { projectId } }),
    refetchInterval: 12_000,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["odm", projectId] });
    qc.invalidateQueries({ queryKey: ["odm-builds", projectId] });
    qc.invalidateQueries({ queryKey: ["odm-stats", projectId] });
  };

  const saveModel = useMutation({
    mutationFn: (v: any) => um({ data: v }),
    onSuccess: () => { toast.success("Model saved"); invalidate(); },
    onError: (e: any) => toast.error(e?.message ?? "Save failed"),
  });
  const delModel = useMutation({
    mutationFn: (id: string) => dm({ data: { id, projectId } }),
    onSuccess: () => { toast.success("Deleted"); invalidate(); },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });
  const queueBuild = useMutation({
    mutationFn: (v: any) => eb({ data: v }),
    onSuccess: () => { toast.success("Build queued"); invalidate(); },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });
  const finalize = useMutation({
    mutationFn: (v: any) => fb({ data: v }),
    onSuccess: () => { toast.success("Build updated"); invalidate(); },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });
  const revoke = useMutation({
    mutationFn: (id: string) => rb({ data: { id, projectId } }),
    onSuccess: () => { toast.success("Revoked"); invalidate(); },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });
  const dl = useMutation({
    mutationFn: (v: any) => ld({ data: v }),
    onSuccess: () => { toast.success("Download logged"); invalidate(); },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  // Model form
  const [mf, setMf] = useState({
    slug: "", name: "", family: "phi" as any,
    baseSizeMb: 1200, contextWindow: 4096, license: "apache-2.0",
    platforms: ["ios","android"] as string[],
    capabilities: "summarization, q&a",
    defaultQuant: "q4_k_m" as any,
  });
  const [bf, setBf] = useState({
    modelId: "", version: "0.1.0", quantization: "q4_k_m" as any, targetPlatform: "ios" as any,
  });

  const modelList = models.data ?? [];
  const buildList = builds.data ?? [];
  const selectedModel = modelList.find((m: any) => m.id === (bf.modelId || modelList[0]?.id));
  const est = selectedModel
    ? estimateBuildSize(selectedModel.base_size_mb, bf.quantization, bf.targetPlatform)
    : null;
  const s = stats.data;

  async function simulateFinalize(buildRow: any) {
    const fakeArtifact = `s3://ota-bundles/${projectId}/${buildRow.id}.bin`;
    const sha = await sha256Hex(`${buildRow.id}:${buildRow.version}:${buildRow.quantization}`);
    finalize.mutate({
      id: buildRow.id,
      projectId,
      status: "ready",
      artifactPath: fakeArtifact,
      sha256: sha,
      signature: sha.slice(0, 64),
      sizeBytes: buildRow.size_bytes,
    });
  }

  return (
    <Card className="border-border/50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Cpu className="size-5 text-primary" /> On-device LLM packaging
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-4">
          <Kpi label="Models" value={modelList.length} />
          <Kpi label="Builds" value={buildList.length} />
          <Kpi label="Downloads (30d)" value={s?.total ?? 0} />
          <Kpi label="Success" value={`${s?.successPct ?? 0}%`} />
          <Kpi label="Throughput" value={`${s?.avgMbps ?? 0} Mbps`} />
        </div>

        <Tabs defaultValue="models">
          <TabsList>
            <TabsTrigger value="models"><Package className="size-4 mr-1" />Models</TabsTrigger>
            <TabsTrigger value="build"><Hammer className="size-4 mr-1" />Build</TabsTrigger>
            <TabsTrigger value="downloads"><Download className="size-4 mr-1" />Downloads</TabsTrigger>
            <TabsTrigger value="stats"><BarChart3 className="size-4 mr-1" />Stats</TabsTrigger>
          </TabsList>

          {/* Models */}
          <TabsContent value="models" className="space-y-3 mt-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 border rounded-md p-3">
              <Field label="Slug"><Input value={mf.slug} onChange={e => setMf({...mf, slug: e.target.value})} placeholder="phi-3-mini" /></Field>
              <Field label="Name"><Input value={mf.name} onChange={e => setMf({...mf, name: e.target.value})} placeholder="Phi-3 Mini" /></Field>
              <Field label="Family">
                <Select value={mf.family} onValueChange={(v: any) => setMf({...mf, family: v})}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{FAMILIES.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              <Field label="Base size MB (fp16)">
                <Input type="number" min={1} max={8192} value={mf.baseSizeMb}
                  onChange={e => setMf({...mf, baseSizeMb: Number(e.target.value)})} />
              </Field>
              <Field label="Context window">
                <Input type="number" min={512} max={131072} value={mf.contextWindow}
                  onChange={e => setMf({...mf, contextWindow: Number(e.target.value)})} />
              </Field>
              <Field label="License">
                <Input value={mf.license} onChange={e => setMf({...mf, license: e.target.value})} />
              </Field>
              <Field label="Default quant">
                <Select value={mf.defaultQuant} onValueChange={(v: any) => setMf({...mf, defaultQuant: v})}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{QUANTS.map(q => <SelectItem key={q} value={q}>{q}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              <Field label="Platforms (comma)">
                <Input value={mf.platforms.join(",")}
                  onChange={e => setMf({...mf, platforms: e.target.value.split(",").map(s=>s.trim()).filter(Boolean)})}
                  placeholder="ios,android,web" />
              </Field>
              <div className="md:col-span-2">
                <Field label="Capabilities (comma)">
                  <Input value={mf.capabilities} onChange={e => setMf({...mf, capabilities: e.target.value})} />
                </Field>
              </div>
              <div className="md:col-span-2">
                <Button
                  onClick={() => saveModel.mutate({
                    projectId,
                    slug: mf.slug, name: mf.name, family: mf.family,
                    baseSizeMb: mf.baseSizeMb, contextWindow: mf.contextWindow,
                    license: mf.license, platforms: mf.platforms,
                    capabilities: mf.capabilities.split(",").map(s=>s.trim()).filter(Boolean),
                    defaultQuant: mf.defaultQuant, status: "available",
                  })}
                  disabled={saveModel.isPending || !mf.slug || !mf.name}
                >
                  {saveModel.isPending && <Loader2 className="size-4 animate-spin mr-1" />}
                  Save model
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              {modelList.map((m: any) => (
                <div key={m.id} className="border rounded-md p-3 flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium">{m.name}</span>
                    <code className="text-xs text-muted-foreground">{m.slug}</code>
                    <Badge variant="outline">{m.family}</Badge>
                    <Badge className={STATUS_TONE[m.status] ?? ""}>{m.status}</Badge>
                    <span className="text-xs text-muted-foreground">{m.base_size_mb}MB · {m.context_window} ctx · default {m.default_quant}</span>
                    {(m.platforms ?? []).map((p: string) => <Badge key={p} variant="secondary" className="text-[10px]">{p}</Badge>)}
                  </div>
                  <Button variant="ghost" size="icon" className="size-7"
                    onClick={() => { if (confirm(`Delete ${m.name}?`)) delModel.mutate(m.id); }}>
                    <Trash2 className="size-3.5 text-destructive" />
                  </Button>
                </div>
              ))}
              {modelList.length === 0 && <p className="text-sm text-muted-foreground">No models yet.</p>}
            </div>
          </TabsContent>

          {/* Build */}
          <TabsContent value="build" className="space-y-3 mt-3">
            {modelList.length === 0 ? (
              <p className="text-sm text-muted-foreground">Create a model first.</p>
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3 border rounded-md p-3">
                  <Field label="Model">
                    <Select value={bf.modelId || modelList[0].id} onValueChange={v => setBf({...bf, modelId: v})}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{modelList.map((m: any) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </Field>
                  <Field label="Version (semver)">
                    <Input value={bf.version} onChange={e => setBf({...bf, version: e.target.value})} placeholder="0.1.0" />
                  </Field>
                  <Field label="Quantization">
                    <Select value={bf.quantization} onValueChange={(v: any) => setBf({...bf, quantization: v})}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{QUANTS.map(q => <SelectItem key={q} value={q}>{q}</SelectItem>)}</SelectContent>
                    </Select>
                  </Field>
                  <Field label="Target platform">
                    <Select value={bf.targetPlatform} onValueChange={(v: any) => setBf({...bf, targetPlatform: v})}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{PLATFORMS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                    </Select>
                  </Field>
                  <div className="md:col-span-4 flex items-center justify-between flex-wrap gap-2">
                    {est && (
                      <p className="text-xs text-muted-foreground">
                        Estimated artifact: <span className="font-medium text-foreground">{est.mb} MB</span>
                        {selectedModel?.platforms && !selectedModel.platforms.includes(bf.targetPlatform) && (
                          <span className="text-destructive ml-2">· platform not enabled for this model</span>
                        )}
                      </p>
                    )}
                    <Button
                      disabled={queueBuild.isPending}
                      onClick={() => queueBuild.mutate({
                        projectId,
                        modelId: bf.modelId || modelList[0].id,
                        version: bf.version,
                        quantization: bf.quantization,
                        targetPlatform: bf.targetPlatform,
                      })}
                    >
                      {queueBuild.isPending && <Loader2 className="size-4 animate-spin mr-1" />}
                      Queue build
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  {buildList.map((b: any) => {
                    const m = modelList.find((x: any) => x.id === b.model_id);
                    return (
                      <div key={b.id} className="border rounded-md p-3 space-y-2">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium">{m?.name ?? "(deleted)"}</span>
                            <Badge variant="outline">v{b.version}</Badge>
                            <Badge variant="secondary">{b.quantization}</Badge>
                            <Badge variant="secondary">{b.target_platform}</Badge>
                            <Badge className={STATUS_TONE[b.status] ?? ""}>{b.status}</Badge>
                            <span className="text-xs text-muted-foreground">{(b.size_bytes/(1024*1024)).toFixed(1)} MB</span>
                          </div>
                          <div className="flex gap-1">
                            {b.status === "queued" && (
                              <Button variant="outline" size="sm"
                                onClick={() => finalize.mutate({ id: b.id, projectId, status: "building" })}>
                                Start
                              </Button>
                            )}
                            {(b.status === "building" || b.status === "queued") && (
                              <Button variant="outline" size="sm" onClick={() => simulateFinalize(b)}>
                                Mark ready
                              </Button>
                            )}
                            {b.status === "ready" && (
                              <Button variant="outline" size="sm"
                                onClick={() => { if (confirm("Revoke this build?")) revoke.mutate(b.id); }}>
                                Revoke
                              </Button>
                            )}
                          </div>
                        </div>
                        {b.sha256 && <code className="block text-[10px] text-muted-foreground break-all">sha256: {b.sha256}</code>}
                        {b.error && <p className="text-xs text-destructive">{b.error}</p>}
                      </div>
                    );
                  })}
                  {buildList.length === 0 && <p className="text-sm text-muted-foreground">No builds yet.</p>}
                </div>
              </>
            )}
          </TabsContent>

          {/* Downloads simulator */}
          <TabsContent value="downloads" className="space-y-3 mt-3">
            {buildList.filter((b: any) => b.status === "ready").length === 0 ? (
              <p className="text-sm text-muted-foreground">No ready builds — finalize a build first.</p>
            ) : (
              <div className="border rounded-md p-3 space-y-2">
                <p className="text-xs text-muted-foreground">Simulate a device download to populate analytics.</p>
                <div className="flex flex-wrap gap-2">
                  {buildList.filter((b: any) => b.status === "ready").map((b: any) => (
                    <Button key={b.id} variant="outline" size="sm"
                      onClick={() => dl.mutate({
                        buildId: b.id,
                        projectId,
                        platform: b.target_platform,
                        deviceClass: b.target_platform === "ios" ? "iPhone 15" : b.target_platform === "android" ? "Pixel 8" : "Chrome",
                        bytesTransferred: b.size_bytes,
                        durationMs: 3000 + Math.floor(Math.random() * 8000),
                        success: Math.random() > 0.08,
                      })}
                    >
                      ↓ {b.version} {b.quantization} · {b.target_platform}
                    </Button>
                  ))}
                </div>
              </div>
            )}
          </TabsContent>

          {/* Stats */}
          <TabsContent value="stats" className="space-y-3 mt-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="border rounded-md p-3">
                <div className="text-xs font-medium mb-2">By platform</div>
                {Object.entries(s?.byPlatform ?? {}).length === 0 && <p className="text-xs text-muted-foreground">No data.</p>}
                {Object.entries(s?.byPlatform ?? {}).map(([p, n]) => (
                  <div key={p} className="flex justify-between text-xs py-0.5"><span>{p}</span><span className="text-muted-foreground">{n}</span></div>
                ))}
              </div>
              <div className="border rounded-md p-3 space-y-2">
                <div className="text-xs font-medium">Bandwidth</div>
                <div className="text-2xl font-semibold">{s?.gbServed ?? 0} GB</div>
                <p className="text-xs text-muted-foreground">served in the last 30 days · avg {s?.avgMbps ?? 0} Mbps</p>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

function Kpi({ label, value }: { label: string; value: any }) {
  return (
    <div className="border rounded-md p-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}
