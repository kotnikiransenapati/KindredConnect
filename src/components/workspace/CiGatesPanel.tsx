import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import {
  ShieldCheck, ShieldAlert, ShieldQuestion, Gauge, Accessibility,
  TestTube, Loader2, Play, ChevronDown, ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import { listCiGates, runCiGate } from "@/lib/ci-gates.functions";

type Kind = "lighthouse" | "smoke" | "a11y";
const kindMeta: Record<Kind, { label: string; icon: typeof Gauge; color: string }> = {
  lighthouse: { label: "Lighthouse", icon: Gauge, color: "text-emerald-400" },
  smoke: { label: "Smoke E2E", icon: TestTube, color: "text-cyan-400" },
  a11y: { label: "Accessibility", icon: Accessibility, color: "text-violet-400" },
};

export function CiGatesPanel({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const list = useServerFn(listCiGates);
  const run = useServerFn(runCiGate);
  const q = useQuery({
    queryKey: ["ci-gates", projectId],
    queryFn: () => list({ data: { projectId } }),
    refetchInterval: 5000,
  });

  const [kind, setKind] = useState<Kind>("lighthouse");
  const [url, setUrl] = useState("");
  const [threshold, setThreshold] = useState(70);
  const [assertionsText, setAssertionsText] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  const runMut = useMutation({
    mutationFn: () => {
      const assertions = assertionsText.split("\n").map((a) => a.trim()).filter(Boolean);
      return run({ data: { projectId, kind, targetUrl: url, threshold, assertions: kind === "smoke" ? assertions : undefined } });
    },
    onSuccess: (res) => {
      if (res.status === "passed") toast.success(`Gate passed — ${res.score}/100`);
      else if (res.status === "failed") toast.error(`Gate failed — ${res.score}/100`);
      else toast.error(`Gate errored — ${("error" in res && res.error) || ""}`);
      qc.invalidateQueries({ queryKey: ["ci-gates", projectId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="rounded-2xl border border-border/60 bg-card/40 p-4">
      <div className="mb-3 flex items-center gap-2">
        <ShieldCheck className="h-4 w-4 text-primary" />
        <h3 className="font-display text-sm font-semibold">CI Gates</h3>
        <span className="ml-auto text-xs text-muted-foreground">Lighthouse · Smoke · Accessibility</span>
      </div>

      <div className="mb-3 grid gap-2 rounded-lg border border-border/40 bg-background/30 p-3">
        <div className="grid grid-cols-[140px_1fr_92px] gap-2">
          <Select value={kind} onValueChange={(v) => setKind(v as Kind)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="lighthouse">Lighthouse</SelectItem>
              <SelectItem value="smoke">Smoke E2E</SelectItem>
              <SelectItem value="a11y">Accessibility</SelectItem>
            </SelectContent>
          </Select>
          <Input placeholder="https://your-deploy.lovable.app" value={url} onChange={(e) => setUrl(e.target.value)} />
          <Input type="number" min={0} max={100} value={threshold} onChange={(e) => setThreshold(Number(e.target.value || 0))} />
        </div>
        {kind === "smoke" && (
          <Textarea
            rows={3}
            placeholder={"One assertion per line (substring of the rendered HTML).\nExamples:\nWelcome to\nGet started"}
            value={assertionsText}
            onChange={(e) => setAssertionsText(e.target.value)}
          />
        )}
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-muted-foreground">Deploys with score &lt; threshold are flagged failed.</span>
          <Button size="sm" disabled={!url || runMut.isPending} onClick={() => runMut.mutate()}>
            {runMut.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />} Run gate
          </Button>
        </div>
      </div>

      {q.isLoading ? (
        <div className="py-6 text-center text-xs text-muted-foreground">Loading…</div>
      ) : (q.data?.gates ?? []).length === 0 ? (
        <div className="py-6 text-center text-xs text-muted-foreground">No gate runs yet.</div>
      ) : (
        <ul className="grid gap-2">
          {(q.data?.gates ?? []).map((g) => {
            const meta = kindMeta[g.kind as Kind];
            const Icon = meta?.icon ?? Gauge;
            const StatusIcon =
              g.status === "passed" ? ShieldCheck :
              g.status === "failed" || g.status === "error" ? ShieldAlert :
              ShieldQuestion;
            const statusColor =
              g.status === "passed" ? "text-emerald-400" :
              g.status === "failed" || g.status === "error" ? "text-rose-400" :
              "text-muted-foreground";
            const open = expanded === g.id;
            return (
              <li key={g.id} className="rounded-lg border border-border/40 bg-background/30">
                <button
                  type="button"
                  onClick={() => setExpanded(open ? null : g.id)}
                  className="flex w-full items-center gap-3 p-3 text-left"
                >
                  {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                  <Icon className={`h-3.5 w-3.5 ${meta?.color ?? ""}`} />
                  <span className="text-xs">{meta?.label ?? g.kind}</span>
                  <Badge variant="outline" className="text-[10px]">
                    {typeof g.score === "number" ? `${g.score}/100` : g.status}
                  </Badge>
                  <span className="ml-2 truncate text-[11px] text-muted-foreground">{g.target_url}</span>
                  <StatusIcon className={`ml-auto h-4 w-4 ${statusColor}`} />
                </button>
                {open && (
                  <pre className="max-h-72 overflow-auto border-t border-border/40 bg-background/60 p-3 text-[11px] leading-relaxed">
{JSON.stringify(g.report, null, 2)}
{g.error ? `\n\nerror: ${g.error}` : ""}
                  </pre>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
