import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { getTargetBuilds, materializeTargetArtifacts, saveTargetBuildConfig } from "@/lib/target-builds.functions";
import { Box, Boxes, CheckCircle2, Code2, Globe2, Loader2, Monitor, Package, Rocket, Smartphone, WifiOff, XCircle } from "lucide-react";
import { toast } from "sonner";

type BuildTarget = "web" | "mobile" | "desktop" | "pwa" | "widget";
type TargetBuildsData = {
  profiles: any[];
  runs: any[];
};

const TARGET_ICON: Record<BuildTarget, any> = { web: Globe2, mobile: Smartphone, desktop: Monitor, pwa: WifiOff, widget: Code2 };

export function CrossPlatformTargetsPanel({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const getFn = useServerFn(getTargetBuilds);
  const saveFn = useServerFn(saveTargetBuildConfig);
  const materializeFn = useServerFn(materializeTargetArtifacts);
  const [target, setTarget] = useState<BuildTarget>("web");
  const [renderMode, setRenderMode] = useState("ssr");
  const [packageName, setPackageName] = useState("com.foundry.generated");
  const [extraConfig, setExtraConfig] = useState("{}");

  const targetsQ = useQuery({ queryKey: ["target-builds", projectId], queryFn: () => getFn({ data: { projectId } }), refetchInterval: 15_000 });
  const targetData = targetsQ.data as TargetBuildsData | undefined;
  const profiles = targetData?.profiles ?? [];
  const active = useMemo(() => profiles.find((profile: any) => profile.target === target), [profiles, target]);
  const runs = targetData?.runs ?? [];

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["target-builds", projectId] });
    qc.invalidateQueries({ queryKey: ["project-files", projectId] });
  };

  function configForTarget() {
    let parsed: Record<string, any> = {};
    try { parsed = JSON.parse(extraConfig || "{}"); } catch { throw new Error("Extra config must be valid JSON"); }
    switch (target) {
      case "web": return { renderMode, docker: true, staticExport: true, ...parsed };
      case "mobile": return { packageName, capacitorFallback: true, ota: true, ...parsed };
      case "desktop": return { systemTray: true, autoUpdater: true, targets: ["windows", "macos", "linux"], ...parsed };
      case "pwa": return { offlineShell: true, shareTarget: true, ...parsed };
      case "widget": return { isolation: "shadow", mountSelector: "[data-foundry-widget]", ...parsed };
    }
  }


  const saveM = useMutation({
    mutationFn: () => saveFn({ data: { projectId, target, config: configForTarget() } }),
    onSuccess: (r) => { toast.success(`Target saved: ${r.status}`); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const materializeM = useMutation({
    mutationFn: () => materializeFn({ data: { projectId, target } }),
    onSuccess: (r) => { toast.success(`Generated ${r.files} target files`); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card className="border-border/60 bg-card/50">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          <Rocket className="size-4" /> Cross-platform Targets
          <Badge variant="outline" className="text-[10px]">D1 web</Badge>
          <Badge variant="outline" className="text-[10px]">D2 iOS/Android</Badge>
          <div className="ml-auto flex gap-2">
            <Button size="sm" variant="outline" onClick={() => saveM.mutate()} disabled={saveM.isPending}>{saveM.isPending ? <Loader2 className="mr-1 size-3 animate-spin" /> : <CheckCircle2 className="mr-1 size-3" />} Save target</Button>
            <Button size="sm" onClick={() => materializeM.mutate()} disabled={materializeM.isPending}>{materializeM.isPending ? <Loader2 className="mr-1 size-3 animate-spin" /> : <Package className="mr-1 size-3" />} Generate artifacts</Button>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Tabs value={target} onValueChange={(v) => setTarget(v as BuildTarget)}>
          <TabsList className="flex h-auto flex-wrap">
            <TabsTrigger value="web"><Globe2 className="mr-1 size-3.5" /> Web</TabsTrigger>
            <TabsTrigger value="mobile"><Smartphone className="mr-1 size-3.5" /> iOS & Android</TabsTrigger>
            <TabsTrigger value="desktop"><Monitor className="mr-1 size-3.5" /> Desktop</TabsTrigger>
            <TabsTrigger value="pwa"><WifiOff className="mr-1 size-3.5" /> PWA</TabsTrigger>
            <TabsTrigger value="widget"><Code2 className="mr-1 size-3.5" /> Widget</TabsTrigger>
          </TabsList>
          <TabsContent value={target} className="space-y-3">
            <div className="grid gap-3 rounded-lg border border-border/60 bg-background/40 p-3 lg:grid-cols-[280px_1fr]">
              <div className="space-y-3">
                {target === "web" ? (
                  <div className="space-y-1.5">
                    <Label className="text-xs">Render mode</Label>
                    <Select value={renderMode} onValueChange={setRenderMode}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ssr">SSR</SelectItem>
                        <SelectItem value="ssg">SSG</SelectItem>
                        <SelectItem value="spa">SPA</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <Label className="text-xs">Native package ID</Label>
                    <Input value={packageName} onChange={(e) => setPackageName(e.target.value)} placeholder="com.acme.app" />
                  </div>
                )}
                <div className="space-y-1.5">
                  <Label className="text-xs">Extra config JSON</Label>
                  <Textarea rows={5} className="font-mono text-xs" value={extraConfig} onChange={(e) => setExtraConfig(e.target.value)} />
                </div>
              </div>
              {active ? (
                <div className="space-y-3">
                  <div>
                    <div className="flex items-center gap-2"><span className="font-medium">{active.displayName}</span><Badge variant={active.readiness.productionReady ? "default" : "secondary"}>score {active.readiness.score}</Badge></div>
                    <p className="mt-1 text-sm text-muted-foreground">{active.description}</p>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-3">
                    <Metric label="Outputs" value={String(active.outputKinds.length)} />
                    <Metric label="Stages" value={String(active.pipelineStages.length)} />
                    <Metric label="Missing adapters" value={String(active.readiness.missingAdapters.length)} />
                  </div>
                  <div className="flex flex-wrap gap-1.5">{active.outputKinds.map((kind: string) => <Badge key={kind} variant="outline" className="text-[10px]">{kind}</Badge>)}</div>
                  <div className="rounded-lg border border-border/60 bg-muted/20 p-3 text-xs text-muted-foreground">
                    Required adapters: {active.requiredAdapters.join(", ")} · {active.readiness.productionReady ? "target is production-ready" : `missing ${active.readiness.missingAdapters.join(", ") || "healthy adapter checks"}`}
                  </div>
                </div>
              ) : <p className="text-sm text-muted-foreground">Loading target profile…</p>}
            </div>
          </TabsContent>
        </Tabs>

        <div className="grid gap-2 lg:grid-cols-2">
          {runs.map((run: any) => {
            const ok = run.status === "success";
            const blocked = run.status === "blocked" || run.status === "failed";
            return (
              <div key={run.id} className="rounded-lg border border-border/60 bg-background/40 p-3">
                <div className="flex items-center gap-2 text-sm">
                  {(() => { const Icon = TARGET_ICON[run.target as BuildTarget] ?? Boxes; return <Icon className="size-3.5" />; })()}
                  <Badge variant="outline">{run.target}</Badge>
                  <span className="font-mono text-xs">{run.ir_hash}</span>
                  {ok ? <CheckCircle2 className="ml-auto size-4 text-emerald-500" /> : blocked ? <XCircle className="ml-auto size-4 text-destructive" /> : <Box className="ml-auto size-4 text-muted-foreground" />}
                </div>
                <div className="mt-2 text-xs text-muted-foreground">{run.logs}</div>
                {!!(run.artifact_paths ?? []).length && <div className="mt-2 flex flex-wrap gap-1">{run.artifact_paths.slice(0, 4).map((path: string) => <Badge key={path} variant="outline" className="text-[10px]">{path}</Badge>)}</div>}
              </div>
            );
          })}
          {!runs.length && <p className="text-sm text-muted-foreground">No target generation runs yet.</p>}
        </div>
      </CardContent>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border border-border/60 bg-background/40 p-2"><div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div><div className="text-lg font-semibold">{value}</div></div>;
}