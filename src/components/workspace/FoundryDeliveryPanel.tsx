// Foundry v3 H3/H4/I1 — Delivery panel: backlog, acceptance contracts, build runs.
import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import {
  compileAcceptanceContracts,
  compileBacklog,
  listAcceptanceContracts,
  listBacklogItems,
  listBuildRuns,
  markAcceptanceResult,
  triggerBuildRun,
  updateBacklogStatus,
} from "@/lib/foundry-delivery.functions";

const priorityClass: Record<string, string> = {
  critical: "bg-red-500/15 text-red-300 border-red-500/40",
  high: "bg-orange-500/15 text-orange-300 border-orange-500/40",
  medium: "bg-amber-500/15 text-amber-300 border-amber-500/40",
  low: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40",
};

const statusClass: Record<string, string> = {
  planned: "bg-slate-500/15 text-slate-300 border-slate-500/40",
  in_progress: "bg-sky-500/15 text-sky-300 border-sky-500/40",
  blocked: "bg-red-500/15 text-red-300 border-red-500/40",
  done: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40",
  dropped: "bg-zinc-500/15 text-zinc-400 border-zinc-500/40",
  passing: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40",
  failing: "bg-red-500/15 text-red-300 border-red-500/40",
  pending: "bg-slate-500/15 text-slate-300 border-slate-500/40",
  quarantined: "bg-amber-500/15 text-amber-300 border-amber-500/40",
  succeeded: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40",
  failed: "bg-red-500/15 text-red-300 border-red-500/40",
  running: "bg-sky-500/15 text-sky-300 border-sky-500/40",
  queued: "bg-slate-500/15 text-slate-300 border-slate-500/40",
};

export function FoundryDeliveryPanel({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const listBacklog = useServerFn(listBacklogItems);
  const listContracts = useServerFn(listAcceptanceContracts);
  const listRuns = useServerFn(listBuildRuns);
  const compileBacklogFn = useServerFn(compileBacklog);
  const compileContractsFn = useServerFn(compileAcceptanceContracts);
  const triggerRunFn = useServerFn(triggerBuildRun);
  const updateStatusFn = useServerFn(updateBacklogStatus);
  const markResultFn = useServerFn(markAcceptanceResult);

  const backlogQuery = useQuery({ queryKey: ["foundry-backlog", projectId], queryFn: () => listBacklog({ data: { projectId } }) });
  const contractsQuery = useQuery({ queryKey: ["foundry-contracts", projectId], queryFn: () => listContracts({ data: { projectId } }) });
  const runsQuery = useQuery({ queryKey: ["foundry-runs", projectId], queryFn: () => listRuns({ data: { projectId } }) });

  const compileMutation = useMutation({
    mutationFn: () => compileBacklogFn({ data: { projectId } }),
    onSuccess: () => { toast.success("Backlog compiled"); qc.invalidateQueries({ queryKey: ["foundry-backlog", projectId] }); },
    onError: (e: any) => toast.error(e?.message ?? "Backlog failed"),
  });
  const contractMutation = useMutation({
    mutationFn: () => compileContractsFn({ data: { projectId } }),
    onSuccess: () => { toast.success("Acceptance contracts compiled"); qc.invalidateQueries({ queryKey: ["foundry-contracts", projectId] }); },
    onError: (e: any) => toast.error(e?.message ?? "Contracts failed"),
  });
  const [target, setTarget] = useState<string>("all");
  const runMutation = useMutation({
    mutationFn: () => triggerRunFn({ data: { projectId, target: target as any } }),
    onSuccess: () => { toast.success("Build run completed"); qc.invalidateQueries({ queryKey: ["foundry-runs", projectId] }); },
    onError: (e: any) => toast.error(e?.message ?? "Build failed"),
  });

  const items = (backlogQuery.data?.items ?? []) as any[];
  const contracts = (contractsQuery.data?.contracts ?? []) as any[];
  const runs = (runsQuery.data?.runs ?? []) as any[];

  const summary = useMemo(() => {
    const total = items.length;
    const done = items.filter((i) => i.status === "done").length;
    return { total, done, percent: total ? Math.round((done / total) * 100) : 0 };
  }, [items]);

  const contractSummary = useMemo(() => {
    const total = contracts.length;
    const passing = contracts.filter((c) => c.status === "passing").length;
    return { total, passing, percent: total ? Math.round((passing / total) * 100) : 0 };
  }, [contracts]);

  return (
    <Card className="border-white/10 bg-gradient-to-br from-slate-950/60 via-slate-900/60 to-slate-950/60">
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="text-base flex items-center gap-2">
            <span className="inline-block size-2 rounded-full bg-emerald-400 shadow-[0_0_18px_2px_rgba(16,185,129,0.6)]" />
            Foundry Delivery — Backlog · Contracts · Builds
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">Autonomous backlog compiler, Given/When/Then acceptance graph, and isolated build executor.</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>Backlog {summary.done}/{summary.total} ({summary.percent}%)</span>
          <Separator orientation="vertical" className="h-4" />
          <span>Contracts {contractSummary.passing}/{contractSummary.total} ({contractSummary.percent}%)</span>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="backlog" className="w-full">
          <TabsList>
            <TabsTrigger value="backlog">Backlog</TabsTrigger>
            <TabsTrigger value="contracts">Acceptance</TabsTrigger>
            <TabsTrigger value="builds">Builds</TabsTrigger>
          </TabsList>

          <TabsContent value="backlog" className="space-y-3">
            <div className="flex justify-end">
              <Button size="sm" disabled={compileMutation.isPending} onClick={() => compileMutation.mutate()}>
                {compileMutation.isPending ? "Compiling…" : "Recompile backlog"}
              </Button>
            </div>
            <ScrollArea className="h-[360px] rounded border border-white/10">
              <div className="divide-y divide-white/5">
                {items.length === 0 && <div className="p-6 text-sm text-muted-foreground">No backlog yet. Compile from the latest blueprint.</div>}
                {items.map((item) => (
                  <div key={item.id} className="p-3 flex flex-col gap-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">#{item.sequence} {item.title}</div>
                        <div className="text-xs text-muted-foreground line-clamp-2">{item.description}</div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge variant="outline" className={priorityClass[item.priority] ?? ""}>{item.priority}</Badge>
                        <Badge variant="outline" className={statusClass[item.status] ?? ""}>{item.status}</Badge>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{item.kind}</span>
                      <span>·</span>
                      <span>{item.owner}</span>
                      <span>·</span>
                      <span>{item.estimate_points} pt</span>
                      <div className="ml-auto flex gap-1">
                        {(["in_progress", "blocked", "done", "dropped"] as const).map((next) => (
                          <Button key={next} variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => updateStatusFn({ data: { projectId, itemId: item.id, status: next } }).then(() => qc.invalidateQueries({ queryKey: ["foundry-backlog", projectId] }))}>
                            {next.replace("_", " ")}
                          </Button>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="contracts" className="space-y-3">
            <div className="flex justify-end">
              <Button size="sm" disabled={contractMutation.isPending} onClick={() => contractMutation.mutate()}>
                {contractMutation.isPending ? "Synthesizing…" : "Recompile contracts"}
              </Button>
            </div>
            <ScrollArea className="h-[360px] rounded border border-white/10">
              <div className="divide-y divide-white/5">
                {contracts.length === 0 && <div className="p-6 text-sm text-muted-foreground">No acceptance contracts yet.</div>}
                {contracts.map((c) => (
                  <div key={c.id} className="p-3 flex flex-col gap-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">{c.surface} · {c.flow}</div>
                        <div className="text-xs text-muted-foreground">v{c.version} · {(c.then_assertions ?? []).length} assertions</div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge variant="outline" className={priorityClass[c.severity] ?? ""}>{c.severity}</Badge>
                        <Badge variant="outline" className={statusClass[c.status] ?? ""}>{c.status}</Badge>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-[11px] text-muted-foreground">
                      <div><span className="text-foreground/80 font-medium">Given</span> · {(c.given ?? []).length}</div>
                      <div><span className="text-foreground/80 font-medium">When</span> · {(c.when_steps ?? []).length}</div>
                      <div><span className="text-foreground/80 font-medium">Then</span> · {(c.then_assertions ?? []).length}</div>
                    </div>
                    <div className="flex gap-1 justify-end">
                      {(["passing", "failing", "quarantined", "pending"] as const).map((s) => (
                        <Button key={s} variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => markResultFn({ data: { projectId, contractId: c.id, status: s } }).then(() => qc.invalidateQueries({ queryKey: ["foundry-contracts", projectId] }))}>
                          mark {s}
                        </Button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="builds" className="space-y-3">
            <div className="flex items-center justify-end gap-2">
              <select value={target} onChange={(e) => setTarget(e.target.value)} className="h-8 rounded border border-white/10 bg-transparent text-xs px-2">
                {["all", "web", "ios", "android", "pwa", "desktop", "widget", "backend"].map((t) => <option key={t} value={t} className="bg-slate-900">{t}</option>)}
              </select>
              <Button size="sm" disabled={runMutation.isPending} onClick={() => runMutation.mutate()}>
                {runMutation.isPending ? "Running…" : "Trigger build"}
              </Button>
            </div>
            <ScrollArea className="h-[360px] rounded border border-white/10">
              <div className="divide-y divide-white/5">
                {runs.length === 0 && <div className="p-6 text-sm text-muted-foreground">No build runs yet.</div>}
                {runs.map((run) => (
                  <div key={run.id} className="p-3 flex flex-col gap-2">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-medium">Run #{run.run_number} · {run.target}</div>
                        <div className="text-xs text-muted-foreground font-mono truncate">{run.pipeline_hash}</div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge variant="outline" className={statusClass[run.status] ?? ""}>{run.status}</Badge>
                        <span className="text-xs text-muted-foreground">{Math.round((run.duration_ms ?? 0) / 100) / 10}s</span>
                      </div>
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      Stages: {(run.stages ?? []).length} · Artifacts: {(run.artifacts ?? []).length} · Gates: {(run.gates ?? []).length}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
