import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import {
  CalendarClock, Play, Trash2, Loader2, Plus, CheckCircle2, XCircle, GitPullRequest, FileDiff,
} from "lucide-react";
import { toast } from "sonner";
import {
  listAgentSchedules, upsertAgentSchedule, deleteAgentSchedule, triggerScheduleNow,
  listProposals, reviewProposal,
} from "@/lib/agent-schedules.functions";

const ROLE_OPTIONS = [
  "architect", "designer", "frontend", "backend", "mobile",
  "data", "integrations", "qa", "security", "perf", "reviewer", "release",
] as const;

const CRON_PRESETS: Array<{ label: string; value: string }> = [
  { label: "Every hour", value: "@hourly" },
  { label: "Every day at 09:00 UTC", value: "0 9 * * *" },
  { label: "Every Mon 09:00 UTC", value: "0 9 * * 1" },
  { label: "Every 15 min", value: "*/15 * * * *" },
  { label: "Custom", value: "" },
];

export function AgentSchedulesPanel({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const list = useServerFn(listAgentSchedules);
  const upsert = useServerFn(upsertAgentSchedule);
  const del = useServerFn(deleteAgentSchedule);
  const trigger = useServerFn(triggerScheduleNow);
  const listProps = useServerFn(listProposals);
  const review = useServerFn(reviewProposal);

  const schedQ = useQuery({
    queryKey: ["agent-schedules", projectId],
    queryFn: () => list({ data: { projectId } }),
    refetchInterval: 10_000,
  });

  const propsQ = useQuery({
    queryKey: ["agent-proposals", projectId],
    queryFn: () => listProps({ data: { projectId } }),
    refetchInterval: 8_000,
  });

  const [name, setName] = useState("");
  const [goal, setGoal] = useState("");
  const [cron, setCron] = useState("@hourly");
  const [enabled, setEnabled] = useState(true);
  const [roles, setRoles] = useState<string[]>(["architect", "frontend", "qa"]);

  const create = useMutation({
    mutationFn: async () => upsert({ data: { projectId, name, goal, cron, enabled, roles } }),
    onSuccess: () => {
      toast.success("Schedule created");
      setName(""); setGoal("");
      qc.invalidateQueries({ queryKey: ["agent-schedules", projectId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleEnabled = useMutation({
    mutationFn: async (s: { id: string; name: string; goal: string; cron: string; roles: string[]; enabled: boolean }) =>
      upsert({ data: { id: s.id, projectId, name: s.name, goal: s.goal, cron: s.cron, roles: s.roles, enabled: !s.enabled } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["agent-schedules", projectId] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => del({ data: { id } }),
    onSuccess: () => {
      toast.success("Schedule removed");
      qc.invalidateQueries({ queryKey: ["agent-schedules", projectId] });
    },
  });

  const runNow = useMutation({
    mutationFn: async (id: string) => trigger({ data: { id } }),
    onSuccess: () => toast.success("Will run on next tick"),
    onError: (e: Error) => toast.error(e.message),
  });

  const act = useMutation({
    mutationFn: async (v: { id: string; action: "approve" | "reject" | "apply" }) => review({ data: v }),
    onSuccess: (r) => {
      toast.success(`Proposal ${r.status}${"filesChanged" in r ? ` · ${r.filesChanged} files` : ""}`);
      qc.invalidateQueries({ queryKey: ["agent-proposals", projectId] });
      qc.invalidateQueries({ queryKey: ["project-files", projectId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <section className="rounded-2xl border border-border/60 bg-card/40 p-4">
      <header className="mb-3 flex items-center gap-2">
        <CalendarClock className="h-4 w-4 text-primary" />
        <h2 className="font-display text-sm font-semibold">Background agents</h2>
        <Badge variant="outline" className="ml-auto text-[10px]">cron · autonomous PRs</Badge>
      </header>

      {/* Composer */}
      <div className="mb-4 grid gap-2 rounded-xl border border-border/60 bg-background/50 p-3">
        <div className="grid gap-2 sm:grid-cols-[1fr_180px]">
          <Input placeholder="Name (e.g. Nightly cleanup)" value={name} onChange={(e) => setName(e.target.value)} />
          <Select value={CRON_PRESETS.find((p) => p.value === cron) ? cron : ""} onValueChange={(v) => v && setCron(v)}>
            <SelectTrigger><SelectValue placeholder="Cron preset" /></SelectTrigger>
            <SelectContent>
              {CRON_PRESETS.filter((p) => p.value).map((p) => (
                <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Input placeholder="Cron expression (UTC)" value={cron} onChange={(e) => setCron(e.target.value)} className="font-mono text-xs" />
        <Textarea placeholder="Goal — what should the agents do each run?" rows={3} value={goal} onChange={(e) => setGoal(e.target.value)} />
        <div className="flex flex-wrap gap-1.5">
          {ROLE_OPTIONS.map((r) => {
            const on = roles.includes(r);
            return (
              <button
                key={r}
                type="button"
                onClick={() => setRoles(on ? roles.filter((x) => x !== r) : [...roles, r])}
                className={`rounded-md border px-2 py-0.5 text-[11px] capitalize transition ${on ? "border-primary/60 bg-primary/15 text-primary" : "border-border/60 bg-background/40 text-muted-foreground hover:text-foreground"}`}
              >
                {r}
              </button>
            );
          })}
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Switch id="sched-enabled" checked={enabled} onCheckedChange={setEnabled} />
            <Label htmlFor="sched-enabled" className="text-xs">Enabled</Label>
          </div>
          <Button size="sm" onClick={() => create.mutate()} disabled={create.isPending || !name || goal.length < 8}>
            {create.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Plus className="mr-1.5 h-3.5 w-3.5" />}
            Create schedule
          </Button>
        </div>
      </div>

      {/* Schedules list */}
      <div className="space-y-2">
        {schedQ.data?.length === 0 && <p className="text-xs text-muted-foreground">No schedules yet.</p>}
        {schedQ.data?.map((s) => (
          <div key={s.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-border/60 bg-background/40 px-3 py-2 text-xs">
            <span className={`h-1.5 w-1.5 rounded-full ${s.enabled ? "bg-emerald-400" : "bg-muted"}`} />
            <span className="font-medium">{s.name}</span>
            <code className="rounded bg-muted/60 px-1.5 py-0.5 font-mono text-[10px]">{s.cron}</code>
            <span className="text-muted-foreground">
              next {new Date(s.next_run_at).toLocaleString()}
            </span>
            <div className="ml-auto flex items-center gap-1">
              <Button size="sm" variant="ghost" className="h-7" onClick={() => runNow.mutate(s.id)}>
                <Play className="h-3 w-3" />
              </Button>
              <Switch
                checked={s.enabled}
                onCheckedChange={() => toggleEnabled.mutate({ id: s.id, name: s.name, goal: s.goal, cron: s.cron, roles: s.roles ?? [], enabled: s.enabled })}
              />
              <Button size="sm" variant="ghost" className="h-7 text-destructive" onClick={() => remove.mutate(s.id)}>
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          </div>
        ))}
      </div>

      {/* Proposals */}
      <div className="mt-5 border-t border-border/60 pt-3">
        <header className="mb-2 flex items-center gap-2">
          <GitPullRequest className="h-3.5 w-3.5 text-primary" />
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Pending proposals</h3>
        </header>
        <div className="space-y-2">
          {(propsQ.data ?? []).length === 0 && <p className="text-xs text-muted-foreground">No proposals.</p>}
          {(propsQ.data ?? []).map((p) => {
            const diff = Array.isArray(p.diff) ? p.diff as Array<{ path: string }> : [];
            const isPending = p.status === "pending" || p.status === "approved";
            return (
              <div key={p.id} className="rounded-lg border border-border/60 bg-background/40 p-3 text-xs">
                <div className="mb-1 flex items-center gap-2">
                  {p.status === "applied" ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> :
                    p.status === "rejected" ? <XCircle className="h-3.5 w-3.5 text-destructive" /> :
                    <GitPullRequest className="h-3.5 w-3.5 text-primary" />}
                  <span className="font-medium">{p.title}</span>
                  <Badge variant="outline" className="ml-auto text-[10px] capitalize">{p.status}</Badge>
                </div>
                <p className="mb-2 text-muted-foreground">{p.summary}</p>
                <div className="mb-2 flex flex-wrap gap-1">
                  {diff.slice(0, 6).map((d, i) => (
                    <span key={i} className="inline-flex items-center gap-1 rounded bg-muted/40 px-1.5 py-0.5 font-mono text-[10px]">
                      <FileDiff className="h-3 w-3" /> {d.path}
                    </span>
                  ))}
                  {diff.length > 6 && <span className="text-[10px] text-muted-foreground">+{diff.length - 6} more</span>}
                </div>
                {isPending && (
                  <div className="flex gap-1.5">
                    <Button size="sm" className="h-7" onClick={() => act.mutate({ id: p.id, action: "apply" })}>Apply</Button>
                    <Button size="sm" variant="outline" className="h-7" onClick={() => act.mutate({ id: p.id, action: "approve" })}>Approve</Button>
                    <Button size="sm" variant="ghost" className="h-7 text-destructive" onClick={() => act.mutate({ id: p.id, action: "reject" })}>Reject</Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
