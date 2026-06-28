// Foundry v3 Phase H1/H2 — production blueprint graph + verified artifact matrix.
import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Boxes, CheckCircle2, FileCode2, GitBranch, RefreshCw, Rocket, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  approveBlueprint,
  listArtifactPlans,
  listProductionBlueprints,
  materializeArtifactPlan,
  synthesizeBlueprint,
  synthesizeVerifiedArtifactPlan,
} from "@/lib/foundry-production.functions";

interface Props { projectId: string }

type BlueprintRow = {
  id: string;
  version: number;
  name: string;
  status: string;
  summary: string | null;
  readiness_score: number;
  warnings: string[];
  surfaces: Array<{ target: string; experience: string; criticalFlows?: string[] }>;
  security_controls: string[];
  release_criteria: string[];
  created_at: string;
};

type ArtifactPlanRow = {
  id: string;
  version: number;
  status: string;
  pipeline_hash: string;
  target_matrix: Record<string, { enabled: boolean; outputs: string[]; gates: string[] }>;
  stages: Array<{ id: string; title: string; owner: string; risk: string; gates: string[]; outputs: string[] }>;
  gates: string[];
  risk_register: Array<{ id: string; risk: string; mitigation: string; severity: string }>;
  generated_files: string[];
  created_at: string;
};

export function FoundryProductionStudioPanel({ projectId }: Props) {
  const qc = useQueryClient();
  const [tab, setTab] = useState<"blueprint" | "artifacts">("blueprint");
  const fnListBlueprints = useServerFn(listProductionBlueprints);
  const fnSynthesizeBlueprint = useServerFn(synthesizeBlueprint);
  const fnApproveBlueprint = useServerFn(approveBlueprint);
  const fnListPlans = useServerFn(listArtifactPlans);
  const fnSynthesizePlan = useServerFn(synthesizeVerifiedArtifactPlan);
  const fnMaterializePlan = useServerFn(materializeArtifactPlan);

  const blueprintsQ = useQuery({ queryKey: ["foundry-production-blueprints", projectId], queryFn: () => fnListBlueprints({ data: { projectId } }) });
  const plansQ = useQuery({ queryKey: ["foundry-artifact-plans", projectId], queryFn: () => fnListPlans({ data: { projectId } }) });
  const blueprints = (blueprintsQ.data?.blueprints ?? []) as BlueprintRow[];
  const plans = (plansQ.data?.plans ?? []) as ArtifactPlanRow[];
  const activeBlueprint = useMemo(() => blueprints.find((b) => b.status === "approved") ?? blueprints[0], [blueprints]);
  const latestPlan = plans[0];

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["foundry-production-blueprints", projectId] });
    qc.invalidateQueries({ queryKey: ["foundry-artifact-plans", projectId] });
  };
  const createBlueprint = useMutation({
    mutationFn: () => fnSynthesizeBlueprint({ data: { projectId } }),
    onSuccess: () => { toast.success("Production blueprint synthesized"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const approve = useMutation({
    mutationFn: (blueprintId: string) => fnApproveBlueprint({ data: { projectId, blueprintId } }),
    onSuccess: () => { toast.success("Blueprint approved"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const createPlan = useMutation({
    mutationFn: () => fnSynthesizePlan({ data: { projectId, blueprintId: activeBlueprint?.id } }),
    onSuccess: () => { toast.success("Verified artifact matrix generated"); invalidate(); setTab("artifacts"); },
    onError: (e: Error) => toast.error(e.message),
  });
  const materialize = useMutation({
    mutationFn: (planId: string) => fnMaterializePlan({ data: { projectId, planId } }),
    onSuccess: () => {
      toast.success("Production artifacts materialized into project files");
      invalidate();
      qc.invalidateQueries({ queryKey: ["project-files", projectId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card className="border-border/60">
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Boxes className="h-4 w-4 text-primary" /> Foundry Production Studio
        </CardTitle>
        <Badge variant="outline" className="text-xs">Phase H1–H2 · 10 left</Badge>
      </CardHeader>
      <CardContent>
        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="blueprint"><GitBranch className="mr-1.5 h-3.5 w-3.5" /> Blueprint Graph</TabsTrigger>
            <TabsTrigger value="artifacts"><FileCode2 className="mr-1.5 h-3.5 w-3.5" /> Artifact Matrix</TabsTrigger>
          </TabsList>

          <TabsContent value="blueprint" className="mt-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-muted-foreground">Production requirements synthesized from runtime adapters, generated files, security posture and release readiness.</p>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => createBlueprint.mutate()} disabled={createBlueprint.isPending}>
                  <RefreshCw className="mr-1 h-3.5 w-3.5" /> Synthesize
                </Button>
                <Button size="sm" onClick={() => createPlan.mutate()} disabled={!activeBlueprint || createPlan.isPending}>
                  <Rocket className="mr-1 h-3.5 w-3.5" /> Build matrix
                </Button>
              </div>
            </div>

            {activeBlueprint ? (
              <div className="rounded-md border border-border/60 p-3 text-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-medium">v{activeBlueprint.version} · {activeBlueprint.name}</h3>
                      <Badge variant={activeBlueprint.status === "approved" ? "default" : "outline"}>{activeBlueprint.status}</Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{activeBlueprint.summary}</p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => approve.mutate(activeBlueprint.id)} disabled={approve.isPending || activeBlueprint.status === "approved"}>
                    <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Approve
                  </Button>
                </div>
                <div className="mt-3 space-y-2">
                  <div className="flex items-center justify-between text-xs"><span>Readiness</span><span>{activeBlueprint.readiness_score}%</span></div>
                  <Progress value={activeBlueprint.readiness_score} />
                </div>
                <div className="mt-3 grid gap-2 md:grid-cols-2">
                  <div className="rounded border border-border/40 p-2">
                    <div className="text-xs font-medium">Surfaces</div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {(activeBlueprint.surfaces ?? []).map((surface) => <Badge key={surface.target} variant="secondary">{surface.target}</Badge>)}
                    </div>
                  </div>
                  <div className="rounded border border-border/40 p-2">
                    <div className="text-xs font-medium">Security controls</div>
                    <div className="mt-1 text-xs text-muted-foreground">{(activeBlueprint.security_controls ?? []).slice(0, 3).join(" · ")}</div>
                  </div>
                </div>
                {(activeBlueprint.warnings ?? []).length > 0 && (
                  <div className="mt-3 rounded border border-destructive/30 p-2 text-xs text-muted-foreground">
                    <div className="mb-1 flex items-center gap-1 font-medium text-destructive"><ShieldAlert className="h-3.5 w-3.5" /> Warnings</div>
                    <ul className="list-disc space-y-0.5 pl-5">
                      {activeBlueprint.warnings.slice(0, 4).map((warning) => <li key={warning}>{warning}</li>)}
                    </ul>
                  </div>
                )}
              </div>
            ) : (
              <p className="rounded-md border border-dashed border-border/60 p-4 text-xs text-muted-foreground">No production blueprint yet. Synthesize one to convert this project into a release-grade web, iOS and Android plan.</p>
            )}
          </TabsContent>

          <TabsContent value="artifacts" className="mt-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-muted-foreground">Deterministic build matrix covering UI, backend, mobile, tests, security gates, release provenance and canary promotion.</p>
              <Button size="sm" onClick={() => latestPlan && materialize.mutate(latestPlan.id)} disabled={!latestPlan || materialize.isPending}>
                <FileCode2 className="mr-1 h-3.5 w-3.5" /> Materialize files
              </Button>
            </div>
            {latestPlan ? (
              <div className="rounded-md border border-border/60 p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-medium">Plan v{latestPlan.version} <Badge variant="outline" className="ml-2">{latestPlan.pipeline_hash}</Badge></div>
                  <Badge variant={latestPlan.status === "materialized" ? "default" : "outline"}>{latestPlan.status}</Badge>
                </div>
                <div className="mt-3 grid gap-2 md:grid-cols-4">
                  {Object.entries(latestPlan.target_matrix ?? {}).filter(([, config]) => config.enabled).map(([target, config]) => (
                    <div key={target} className="rounded border border-border/40 p-2 text-xs">
                      <div className="font-medium uppercase">{target}</div>
                      <div className="mt-1 text-muted-foreground">{config.outputs.length} outputs · {config.gates.length} gates</div>
                    </div>
                  ))}
                </div>
                <div className="mt-3 space-y-2">
                  {(latestPlan.stages ?? []).map((stage) => (
                    <div key={stage.id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-border/40 p-2 text-xs">
                      <div>
                        <div className="font-medium">{stage.title}</div>
                        <div className="text-muted-foreground">{stage.owner} · {stage.outputs.length} outputs · {stage.gates.length} gates</div>
                      </div>
                      <Badge variant={stage.risk === "high" ? "destructive" : "outline"}>{stage.risk}</Badge>
                    </div>
                  ))}
                </div>
                {(latestPlan.generated_files ?? []).length > 0 && (
                  <div className="mt-3 text-xs text-muted-foreground">Materialized: {latestPlan.generated_files.join(", ")}</div>
                )}
              </div>
            ) : (
              <p className="rounded-md border border-dashed border-border/60 p-4 text-xs text-muted-foreground">No artifact matrix yet. Approve or synthesize a blueprint, then build the matrix.</p>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}