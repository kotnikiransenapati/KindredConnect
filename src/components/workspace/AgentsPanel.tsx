import React, { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { startAgentRun, listAgentRuns, getAgentRun, cancelAgentRun } from "@/lib/agents.functions";
import { runQueuedTasks, listTaskMessages } from "@/lib/agents-worker.functions";
import { AGENTS, AGENT_BY_ROLE, type AgentRole } from "@/lib/agents.catalog";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sparkles, Loader2, Square, CheckCircle2, XCircle, Circle, PlayCircle } from "lucide-react";
import { toast } from "sonner";

const STATUS_ICON: Record<string, React.ReactNode> = {
  queued: <Circle className="h-3.5 w-3.5 text-muted-foreground" />,
  running: <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />,
  succeeded: <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />,
  failed: <XCircle className="h-3.5 w-3.5 text-destructive" />,
  skipped: <Square className="h-3.5 w-3.5 text-muted-foreground" />,
  needs_review: <PlayCircle className="h-3.5 w-3.5 text-amber-500" />,
};

export function AgentsPanel({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const fetchRuns = useServerFn(listAgentRuns);
  const fetchRun = useServerFn(getAgentRun);
  const startFn = useServerFn(startAgentRun);
  const cancelFn = useServerFn(cancelAgentRun);
  const runWorker = useServerFn(runQueuedTasks);

  const [goal, setGoal] = useState("");
  const [selected, setSelected] = useState<Set<AgentRole>>(
    new Set(["architect", "frontend", "backend", "mobile", "qa", "security"]),
  );
  const [activeRun, setActiveRun] = useState<string | null>(null);

  const runsQ = useQuery({
    queryKey: ["agent-runs", projectId],
    queryFn: () => fetchRuns({ data: { projectId } }),
    refetchInterval: 4000,
  });

  const runQ = useQuery({
    queryKey: ["agent-run", activeRun],
    queryFn: () => fetchRun({ data: { runId: activeRun! } }),
    enabled: !!activeRun,
    refetchInterval: 2500,
  });

  const startM = useMutation({
    mutationFn: () => startFn({ data: { projectId, goal, roles: [...selected] } }),
    onSuccess: (res) => {
      toast.success(`Swarm started — ${res.roles.length} agents dispatched`);
      setGoal("");
      setActiveRun(res.runId);
      qc.invalidateQueries({ queryKey: ["agent-runs", projectId] });
      // Kick off the worker loop (fire-and-forget — the UI streams progress).
      runWorker({ data: { runId: res.runId } })
        .then((r) =>
          toast.success(`Swarm complete — ${r.total - r.failed}/${r.total} succeeded`),
        )
        .catch((e: Error) => toast.error(`Swarm failed: ${e.message}`))
        .finally(() => {
          qc.invalidateQueries({ queryKey: ["agent-runs", projectId] });
          qc.invalidateQueries({ queryKey: ["agent-run", res.runId] });
        });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const cancelM = useMutation({
    mutationFn: (runId: string) => cancelFn({ data: { runId } }),
    onSuccess: () => {
      toast.message("Run cancelled");
      qc.invalidateQueries({ queryKey: ["agent-runs", projectId] });
      if (activeRun) qc.invalidateQueries({ queryKey: ["agent-run", activeRun] });
    },
  });

  const toggle = (r: AgentRole) => {
    const next = new Set(selected);
    next.has(r) ? next.delete(r) : next.add(r);
    setSelected(next);
  };

  // Realtime: invalidate the active run query on any agent_tasks change for it.
  useEffect(() => {
    if (!activeRun) return;
    const channel = supabase
      .channel(`agent-run-${activeRun}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "agent_tasks", filter: `run_id=eq.${activeRun}` },
        () => qc.invalidateQueries({ queryKey: ["agent-run", activeRun] }),
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "agent_runs", filter: `id=eq.${activeRun}` },
        () => {
          qc.invalidateQueries({ queryKey: ["agent-run", activeRun] });
          qc.invalidateQueries({ queryKey: ["agent-runs", projectId] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeRun, projectId, qc]);

  return (
    <Card className="border-border/60 bg-card/40 backdrop-blur">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="h-4 w-4 text-primary" /> Agent Swarm
          <span className="ml-auto text-xs font-normal text-muted-foreground">
            {AGENTS.length} specialists available
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Textarea
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          placeholder="Describe what you want built. e.g. 'Add a stripe-billed pricing page with 3 tiers and a mobile-friendly checkout.'"
          rows={3}
          className="resize-none"
        />

        <div className="flex flex-wrap gap-1.5">
          {AGENTS.filter((a) => a.role !== "orchestrator" && a.role !== "reviewer").map((a) => {
            const on = selected.has(a.role);
            return (
              <button
                key={a.role}
                onClick={() => toggle(a.role)}
                title={a.description}
                className={`flex items-center gap-1 rounded-full border px-2 py-1 text-xs transition ${
                  on
                    ? "border-primary/60 bg-primary/15 text-foreground"
                    : "border-border/60 bg-background/40 text-muted-foreground hover:text-foreground"
                }`}
              >
                <span>{a.emoji}</span>
                <span>{a.name}</span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">
            {selected.size} agents will run in parallel with a reviewer loop.
          </p>
          <Button
            size="sm"
            onClick={() => startM.mutate()}
            disabled={startM.isPending || !goal.trim() || selected.size === 0}
          >
            {startM.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mr-1.5 h-3.5 w-3.5" />}
            Launch swarm
          </Button>
        </div>

        {/* Runs list */}
        <div className="rounded-lg border border-border/60">
          <div className="border-b border-border/60 px-3 py-2 text-xs font-medium text-muted-foreground">
            Recent runs
          </div>
          <ScrollArea className="h-40">
            <div className="divide-y divide-border/40">
              {(runsQ.data?.runs ?? []).length === 0 && (
                <div className="p-3 text-xs text-muted-foreground">No runs yet.</div>
              )}
              {(runsQ.data?.runs ?? []).map((r) => (
                <button
                  key={r.id}
                  onClick={() => setActiveRun(r.id)}
                  className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition hover:bg-accent/40 ${
                    activeRun === r.id ? "bg-accent/40" : ""
                  }`}
                >
                  {STATUS_ICON[r.status] ?? STATUS_ICON.queued}
                  <span className="flex-1 truncate">{r.goal}</span>
                  <Badge variant="outline" className="text-[10px]">{r.status}</Badge>
                </button>
              ))}
            </div>
          </ScrollArea>
        </div>

        {/* Active run timeline */}
        {activeRun && runQ.data && (
          <div className="rounded-lg border border-border/60">
            <div className="flex items-center justify-between border-b border-border/60 px-3 py-2">
              <div className="text-xs font-medium">Task timeline</div>
              {(runQ.data.run.status === "running" || runQ.data.run.status === "queued") && (
                <Button size="sm" variant="ghost" onClick={() => cancelM.mutate(activeRun)}>
                  Cancel
                </Button>
              )}
            </div>
            <ScrollArea className="h-56">
              <ol className="space-y-0">
                {runQ.data.tasks.map((t) => {
                  const def = AGENT_BY_ROLE[t.role as AgentRole];
                  return (
                    <li key={t.id} className="flex items-start gap-2 border-b border-border/30 px-3 py-2 last:border-b-0">
                      <span className="mt-0.5">{STATUS_ICON[t.status] ?? STATUS_ICON.queued}</span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 text-xs">
                          <span>{def?.emoji}</span>
                          <span className="font-medium">{def?.name ?? t.role}</span>
                          <span className="text-muted-foreground">— {t.title}</span>
                        </div>
                        {t.error && <div className="mt-0.5 text-[11px] text-destructive">{t.error}</div>}
                      </div>
                      {t.tokens > 0 && (
                        <span className="text-[10px] text-muted-foreground">{t.tokens} tok</span>
                      )}
                    </li>
                  );
                })}
              </ol>
            </ScrollArea>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
