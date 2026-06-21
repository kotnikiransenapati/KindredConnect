import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  listCapabilities,
  listCapabilityCatalog,
  upsertCapability,
  generateManifests,
} from "@/lib/native-capabilities.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ShieldCheck, FileCode2, Download, Apple, Smartphone } from "lucide-react";
import { toast } from "sonner";

const RISK_COLOR: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  low: "outline", medium: "secondary", high: "destructive",
};

export function NativeCapabilitiesPanel({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const fetchCatalog = useServerFn(listCapabilityCatalog);
  const fetchCaps = useServerFn(listCapabilities);
  const upsert = useServerFn(upsertCapability);
  const gen = useServerFn(generateManifests);

  const catalogQ = useQuery({ queryKey: ["cap-catalog"], queryFn: () => fetchCatalog() });
  const capsQ = useQuery({
    queryKey: ["caps", projectId],
    queryFn: () => fetchCaps({ data: { projectId } }),
  });
  const manifestsQ = useQuery({
    queryKey: ["caps-manifests", projectId],
    queryFn: () => gen({ data: { projectId } }),
  });

  const catalog = catalogQ.data?.catalog ?? [];
  const caps = capsQ.data?.capabilities ?? [];

  const stateByKey = useMemo(() => {
    const m: Record<string, any> = {};
    for (const c of caps) m[`${c.capability_key}:${c.platform}`] = c;
    return m;
  }, [caps]);

  const upsertM = useMutation({
    mutationFn: (v: any) => upsert({ data: v }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["caps", projectId] });
      qc.invalidateQueries({ queryKey: ["caps-manifests", projectId] });
    },
    onError: (e: any) => toast.error(e.message ?? "Save failed"),
  });

  function rowFor(key: string) {
    return stateByKey[`${key}:both`] ?? stateByKey[`${key}:ios`] ?? stateByKey[`${key}:android`] ?? null;
  }

  function downloadFile(name: string, body: string) {
    const blob = new Blob([body], { type: "text/xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = name; a.click();
    URL.revokeObjectURL(url);
  }

  const summary = manifestsQ.data?.summary;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldCheck className="h-4 w-4" /> Native capabilities
          {summary && (
            <>
              <Badge variant="outline" className="ml-2"><Apple className="mr-1 h-3 w-3" />{summary.iosKeys}</Badge>
              <Badge variant="outline"><Smartphone className="mr-1 h-3 w-3" />{summary.androidPermissions}</Badge>
              {summary.highRiskCount > 0 && (
                <Badge variant="destructive">{summary.highRiskCount} high-risk</Badge>
              )}
            </>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="matrix">
          <TabsList>
            <TabsTrigger value="matrix">Capabilities</TabsTrigger>
            <TabsTrigger value="manifests">Manifests</TabsTrigger>
          </TabsList>

          <TabsContent value="matrix" className="mt-3 space-y-2">
            {catalog.map((def: any) => {
              const row = rowFor(def.key);
              const enabled = row?.enabled ?? false;
              const platform = row?.platform ?? "both";
              const usage = row?.usage_description ?? def.defaultUsage;
              return (
                <div key={def.key} className="rounded-lg border border-border/60 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={enabled}
                        onCheckedChange={(v) =>
                          upsertM.mutate({
                            projectId,
                            capabilityKey: def.key,
                            platform,
                            enabled: v,
                            usageDescription: usage,
                          })
                        }
                      />
                      <div className="text-sm font-medium">{def.label}</div>
                      <Badge variant={RISK_COLOR[def.defaultRisk]}>{def.defaultRisk}</Badge>
                      <span className="text-xs text-muted-foreground">{def.category}</span>
                    </div>
                    <Select
                      value={platform}
                      onValueChange={(v) =>
                        upsertM.mutate({
                          projectId,
                          capabilityKey: def.key,
                          platform: v,
                          enabled,
                          usageDescription: usage,
                        })
                      }
                    >
                      <SelectTrigger className="h-8 w-32 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="both">iOS + Android</SelectItem>
                        <SelectItem value="ios">iOS only</SelectItem>
                        <SelectItem value="android">Android only</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {enabled && (
                    <div className="mt-2">
                      <Input
                        placeholder="User-facing usage description (shown in iOS permission dialog)"
                        defaultValue={usage}
                        onBlur={(e) => {
                          const val = e.target.value;
                          if (val === usage) return;
                          upsertM.mutate({
                            projectId,
                            capabilityKey: def.key,
                            platform,
                            enabled,
                            usageDescription: val,
                          });
                        }}
                      />
                      <div className="mt-1 flex flex-wrap gap-1 text-[10px] text-muted-foreground">
                        {def.ios && <span className="rounded bg-muted px-1.5 py-0.5">iOS: {def.ios.usageKey}</span>}
                        {def.android?.permissions?.map((p: string) => (
                          <span key={p} className="rounded bg-muted px-1.5 py-0.5">android: {p}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </TabsContent>

          <TabsContent value="manifests" className="mt-3 space-y-3">
            {!manifestsQ.data ? (
              <div className="text-xs text-muted-foreground">Loading manifests…</div>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <div className="text-xs font-medium"><Apple className="mr-1 inline h-3 w-3" />Info.plist</div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => downloadFile("Info.plist", manifestsQ.data!.infoPlist)}
                  >
                    <Download className="mr-1.5 h-3.5 w-3.5" /> Download
                  </Button>
                </div>
                <pre className="max-h-56 overflow-auto rounded-md border border-border/60 bg-muted/40 p-3 text-[11px]">
                  {manifestsQ.data.infoPlist}
                </pre>

                <div className="flex items-center justify-between">
                  <div className="text-xs font-medium"><FileCode2 className="mr-1 inline h-3 w-3" />AndroidManifest.xml</div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => downloadFile("AndroidManifest.xml", manifestsQ.data!.androidManifest)}
                  >
                    <Download className="mr-1.5 h-3.5 w-3.5" /> Download
                  </Button>
                </div>
                <pre className="max-h-56 overflow-auto rounded-md border border-border/60 bg-muted/40 p-3 text-[11px]">
                  {manifestsQ.data.androidManifest}
                </pre>
              </>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
