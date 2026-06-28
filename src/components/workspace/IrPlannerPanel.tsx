// B2 — Planner panel: prompt → Planner→Critic loop → optional apply.
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { runIrPlanner, listPlanRuns } from "@/lib/ir-planner.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Sparkles, Bot, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";

export function IrPlannerPanel({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const run = useServerFn(runIrPlanner);
  const list = useServerFn(listPlanRuns);
  const [prompt, setPrompt] = useState("Build a SaaS landing page with pricing, FAQ, and a contact form. Add a /dashboard authenticated page that lists projects.");
  const [apply, setApply] = useState(true);

  const runsQ = useQuery({
    queryKey: ["ir-plan-runs", projectId],
    queryFn: () => list({ data: { projectId } }),
    refetchInterval: 5000,
  });

  const m = useMutation({
    mutationFn: () => run({ data: { projectId, prompt, apply } }),
    onSuccess: (r) => {
      toast[r.ok ? "success" : "error"](r.ok ? `Planner OK in ${r.attempts} attempt(s)` : `Planner failed after ${r.attempts} attempts`);
      qc.invalidateQueries({ queryKey: ["ir-plan-runs", projectId] });
      if (r.appliedRevisionId) {
        qc.invalidateQueries({ queryKey: ["project-ir", projectId] });
        qc.invalidateQueries({ queryKey: ["ir-revs", projectId] });
        qc.invalidateQueries({ queryKey: ["ir-codegen", projectId] });
      }
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Planner crashed"),
  });

  return (
    <Card className="border-border/60">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Bot className="size-4" /> Planner → Critic
          <Badge variant="secondary">Gemini 2.5 Flash</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <Textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Describe the app you want — pages, data, auth, integrations…"
          className="min-h-[110px] text-sm"
        />
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Switch id="apply" checked={apply} onCheckedChange={setApply} />
            <Label htmlFor="apply" className="text-xs">Apply on success (saves as new IR revision)</Label>
          </div>
          <Button size="sm" onClick={() => m.mutate()} disabled={m.isPending || prompt.trim().length < 8} className="ml-auto">
            <Sparkles className="size-3.5 mr-1" /> {m.isPending ? "Planning…" : "Run planner"}
          </Button>
        </div>

        <div>
          <p className="mb-1.5 text-xs font-medium text-muted-foreground">Recent runs</p>
          <ul className="max-h-[260px] overflow-auto rounded-md border border-border divide-y divide-border">
            {(runsQ.data?.runs ?? []).map((r) => {
              const errs = Array.isArray(r.errors) ? r.errors as Array<{ attempt: number; message: string }> : [];
              return (
                <li key={r.id} className="px-3 py-2 text-xs">
                  <div className="flex items-center gap-2">
                    {r.status === "succeeded" ? <CheckCircle2 className="size-3.5 text-emerald-500" />
                      : r.status === "failed" || r.status === "error" ? <XCircle className="size-3.5 text-destructive" />
                      : <Sparkles className="size-3.5 text-amber-500" />}
                    <Badge variant="outline">{r.status}</Badge>
                    <Badge variant="secondary">{r.attempts}× attempts</Badge>
                    {r.applied_revision_id ? <Badge>applied</Badge> : null}
                    <span className="ml-auto tabular-nums text-muted-foreground">
                      {r.tokens_in}+{r.tokens_out}t · {new Date(r.created_at).toLocaleTimeString()}
                    </span>
                  </div>
                  <p className="mt-1 truncate text-muted-foreground">{r.prompt}</p>
                  {errs.length > 0 ? (
                    <ul className="mt-1 list-disc pl-5 text-[11px] text-destructive/80">
                      {errs.slice(0, 3).map((e, i) => <li key={i}>#{e.attempt} {e.message}</li>)}
                    </ul>
                  ) : null}
                </li>
              );
            })}
            {runsQ.data?.runs.length === 0 ? <li className="p-3 text-xs text-muted-foreground">No planner runs yet.</li> : null}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
