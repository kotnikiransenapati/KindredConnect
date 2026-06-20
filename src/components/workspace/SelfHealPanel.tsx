import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import { HeartPulse, Loader2, Undo2, GitPullRequest, AlertTriangle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { listHealingEvents, triggerSelfHeal } from "@/lib/self-heal.functions";
import { supabase } from "@/integrations/supabase/client";

export function SelfHealPanel({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const list = useServerFn(listHealingEvents);
  const heal = useServerFn(triggerSelfHeal);

  const events = useQuery({
    queryKey: ["self-heal", projectId],
    queryFn: () => list({ data: { projectId } }),
    refetchInterval: 8_000,
  });

  // Latest failing CI gate (for default selection)
  const failedGates = useQuery({
    queryKey: ["failed-gates", projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ci_gates").select("id,kind,status,deployment_id,created_at,score")
        .eq("project_id", projectId).eq("status", "failed")
        .order("created_at", { ascending: false }).limit(10);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
    refetchInterval: 10_000,
  });

  const [selectedGate, setSelectedGate] = useState<string>("");
  const [mode, setMode] = useState<"auto" | "rollback" | "proposal">("auto");

  const run = useMutation({
    mutationFn: async () => {
      const gate = failedGates.data?.find((g) => g.id === selectedGate) ?? failedGates.data?.[0];
      if (!gate?.deployment_id) throw new Error("Pick a failed CI gate with a linked deployment.");
      return heal({ data: { projectId, deploymentId: gate.deployment_id, ciGateId: gate.id, mode } });
    },
    onSuccess: (r) => {
      toast.success(`Self-heal: ${r.action}${"rolledBackTo" in r ? " — reverted" : ""}`);
      qc.invalidateQueries({ queryKey: ["self-heal", projectId] });
      qc.invalidateQueries({ queryKey: ["agent-proposals", projectId] });
      qc.invalidateQueries({ queryKey: ["deployments", projectId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <section className="rounded-2xl border border-border/60 bg-card/40 p-4">
      <header className="mb-3 flex items-center gap-2">
        <HeartPulse className="h-4 w-4 text-primary" />
        <h2 className="font-display text-sm font-semibold">Self-healing deploys</h2>
        <Badge variant="outline" className="ml-auto text-[10px]">auto-rollback · AI fixes</Badge>
      </header>

      <div className="mb-4 grid gap-2 rounded-xl border border-border/60 bg-background/50 p-3">
        <div className="grid gap-2 sm:grid-cols-[1fr_160px_120px]">
          <Select value={selectedGate} onValueChange={setSelectedGate}>
            <SelectTrigger><SelectValue placeholder="Pick a failed CI gate" /></SelectTrigger>
            <SelectContent>
              {(failedGates.data ?? []).length === 0 && <div className="px-2 py-1.5 text-xs text-muted-foreground">No failing gates right now 🎉</div>}
              {failedGates.data?.map((g) => (
                <SelectItem key={g.id} value={g.id}>
                  {g.kind} · score {g.score ?? "n/a"} · {new Date(g.created_at).toLocaleString()}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={mode} onValueChange={(v) => setMode(v as typeof mode)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">Auto (best)</SelectItem>
              <SelectItem value="rollback">Rollback only</SelectItem>
              <SelectItem value="proposal">AI proposal</SelectItem>
            </SelectContent>
          </Select>
          <Button size="sm" onClick={() => run.mutate()} disabled={run.isPending || !(failedGates.data?.length)}>
            {run.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <HeartPulse className="mr-1.5 h-3.5 w-3.5" />}
            Heal
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1"><Undo2 className="h-3 w-3" /> Rollback</span> flips <code className="font-mono">is_current</code> to the last successful deployment.
          {" "}<span className="inline-flex items-center gap-1"><GitPullRequest className="h-3 w-3" /> Proposal</span> drafts a fix you can apply from the Background Agents panel.
        </p>
      </div>

      <div className="space-y-2">
        {events.data?.length === 0 && <p className="text-xs text-muted-foreground">No healing events yet.</p>}
        {events.data?.map((e) => (
          <div key={e.id} className="rounded-lg border border-border/60 bg-background/40 p-3 text-xs">
            <div className="flex items-center gap-2">
              {e.status === "succeeded" ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> :
                e.status === "failed" ? <AlertTriangle className="h-3.5 w-3.5 text-destructive" /> :
                <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />}
              <Badge variant="outline" className="text-[10px] capitalize">{e.action}</Badge>
              <span className="text-muted-foreground">{new Date(e.created_at).toLocaleString()}</span>
              <Badge variant={e.status === "succeeded" ? "default" : e.status === "failed" ? "destructive" : "outline"} className="ml-auto text-[10px]">
                {e.status}
              </Badge>
            </div>
            <p className="mt-1">{e.summary}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
