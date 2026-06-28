import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listPipelineEvents, runPipelineReplay } from "@/lib/pipeline-observability.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Activity, AlertTriangle, CheckCircle2, Clock3, PlayCircle, Route } from "lucide-react";
import { toast } from "sonner";

const statusTone: Record<string, string> = {
  succeeded: "border-emerald-500/40 bg-emerald-500/10 text-emerald-600",
  queued: "border-sky-500/40 bg-sky-500/10 text-sky-600",
  running: "border-blue-500/40 bg-blue-500/10 text-blue-600",
  blocked: "border-amber-500/40 bg-amber-500/10 text-amber-600",
  skipped: "border-muted bg-muted text-muted-foreground",
  failed: "bg-destructive text-destructive-foreground",
};

export function PipelineTimelinePanel({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listPipelineEvents);
  const runFn = useServerFn(runPipelineReplay);

  const eventsQ = useQuery({ queryKey: ["pipeline-events", projectId], queryFn: () => listFn({ data: { projectId } }), refetchInterval: 10_000 });
  const runM = useMutation({
    mutationFn: () => runFn({ data: { projectId } }),
    onSuccess: (r) => { toast.success(`Pipeline replay created: ${r.runId}`); qc.invalidateQueries({ queryKey: ["pipeline-events", projectId] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const runs = useMemo(() => {
    const groups = new Map<string, any[]>();
    for (const event of eventsQ.data?.events ?? []) {
      groups.set(event.run_id, [...(groups.get(event.run_id) ?? []), event]);
    }
    return [...groups.entries()].map(([runId, events]) => ({ runId, events: events.sort((a, b) => a.sequence - b.sequence) }));
  }, [eventsQ.data]);
  const latest = runs[0]?.events ?? [];
  const completed = latest.filter((event) => event.status === "succeeded" || event.status === "queued").length;
  const progress = latest.length ? Math.round((completed / latest.length) * 100) : 0;
  const hasBlocker = latest.some((event) => event.status === "blocked" || event.status === "failed");

  return (
    <Card className="border-border/60 bg-card/50">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          <Route className="size-4" /> Pipeline Observability
          <Badge variant="outline" className="text-[10px]">B7 replayable timeline</Badge>
          <Button size="sm" className="ml-auto" onClick={() => runM.mutate()} disabled={runM.isPending}>
            <PlayCircle className="mr-1 size-3.5" /> {runM.isPending ? "Replaying…" : "Replay pipeline"}
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2 md:grid-cols-4">
          <Metric label="Runs captured" value={String(runs.length)} />
          <Metric label="Latest stages" value={String(latest.length)} />
          <Metric label="Readiness" value={`${progress}%`} />
          <Metric label="State" value={hasBlocker ? "Blocked" : latest.length ? "Ready" : "Idle"} />
        </div>
        <div className="rounded-lg border border-border/60 bg-background/40 p-3">
          <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
            <Activity className="size-3.5" /> Latest run {runs[0]?.runId ?? "—"}
          </div>
          <Progress value={progress} className="h-2" />
        </div>
        <ScrollArea className="h-[360px] rounded-lg border border-border/60">
          <div className="space-y-3 p-3">
            {runs.map((run) => (
              <div key={run.runId} className="rounded-lg border border-border/60 bg-background/40 p-3">
                <div className="mb-3 flex items-center gap-2">
                  <Badge variant="secondary" className="font-mono text-[10px]">{run.runId}</Badge>
                  <span className="ml-auto text-[11px] text-muted-foreground">{new Date(run.events[0]?.created_at).toLocaleString()}</span>
                </div>
                <div className="relative space-y-2 before:absolute before:left-[11px] before:top-2 before:h-[calc(100%-16px)] before:w-px before:bg-border">
                  {run.events.map((event: any) => (
                    <div key={event.id} className="relative flex gap-3 pl-0">
                      <span className="relative z-10 mt-1 flex size-6 items-center justify-center rounded-full border bg-background">
                        {event.status === "succeeded" ? <CheckCircle2 className="size-3.5 text-emerald-500" /> : event.status === "blocked" || event.status === "failed" ? <AlertTriangle className="size-3.5 text-amber-500" /> : <Clock3 className="size-3.5 text-sky-500" />}
                      </span>
                      <div className="min-w-0 flex-1 rounded-md border border-border/60 p-2 text-xs">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-[11px]">{event.sequence}. {event.stage}</span>
                          <Badge variant="outline" className={statusTone[event.status] ?? ""}>{event.status}</Badge>
                          <Badge variant="outline" className="text-[10px]">{event.severity}</Badge>
                        </div>
                        <p className="mt-1 text-muted-foreground">{event.message}</p>
                        {event.payload ? <pre className="mt-2 max-h-24 overflow-auto rounded bg-muted/40 p-2 text-[10px] text-muted-foreground">{JSON.stringify(event.payload, null, 2)}</pre> : null}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {!runs.length && <p className="p-4 text-sm text-muted-foreground">No pipeline replay has been captured yet.</p>}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border border-border/60 bg-background/40 p-2"><div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div><div className="text-lg font-semibold">{value}</div></div>;
}