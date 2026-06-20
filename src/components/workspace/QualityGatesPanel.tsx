import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { runQualityGates, listQualityReports } from "@/lib/quality.functions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ShieldAlert, Gauge, FlaskConical, Loader2, Play, AlertTriangle, AlertCircle, Info } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";

type Kind = "qa" | "security" | "performance";
type Severity = "info" | "warn" | "error";
type Finding = { severity: Severity; rule: string; message: string; path?: string; line?: number };
type Report = {
  id: string;
  kind: Kind;
  score: number;
  status: "pass" | "warn" | "fail";
  findings: Finding[];
  summary: string;
  created_at: string;
};

const KIND_META: Record<Kind, { label: string; icon: typeof Gauge }> = {
  qa: { label: "QA", icon: FlaskConical },
  security: { label: "Security", icon: ShieldAlert },
  performance: { label: "Performance", icon: Gauge },
};

const SEV_ICON: Record<Severity, typeof Info> = {
  info: Info,
  warn: AlertTriangle,
  error: AlertCircle,
};

function statusColor(s: Report["status"]) {
  return s === "pass" ? "text-emerald-500" : s === "warn" ? "text-amber-500" : "text-red-500";
}

export function QualityGatesPanel({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const runFn = useServerFn(runQualityGates);
  const listFn = useServerFn(listQualityReports);
  const [openId, setOpenId] = useState<string | null>(null);

  const reportsQ = useQuery({
    queryKey: ["quality-reports", projectId],
    queryFn: () => listFn({ data: { projectId, limit: 9 } }),
    staleTime: 15_000,
  });

  const runMut = useMutation({
    mutationFn: () => runFn({ data: { projectId } }),
    onSuccess: (r) => {
      const failed = r.reports.filter((x) => x.status === "fail").length;
      if (failed > 0) toast.error(`${failed} gate(s) failed`);
      else toast.success("All gates passed");
      qc.invalidateQueries({ queryKey: ["quality-reports", projectId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const reports = (reportsQ.data?.reports ?? []) as Report[];
  // Latest per kind
  const latest = (["qa", "security", "performance"] as const).map(
    (k) => reports.find((r) => r.kind === k) ?? null,
  );

  return (
    <section className="rounded-2xl border border-border/60 bg-card/40 p-4">
      <header className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-muted-foreground" />
          <h2 className="font-display text-sm font-semibold">Quality gates</h2>
        </div>
        <Button size="sm" onClick={() => runMut.mutate()} disabled={runMut.isPending}>
          {runMut.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Play className="mr-1.5 h-3.5 w-3.5" />}
          Run scans
        </Button>
      </header>

      <div className="mb-3 grid gap-2 sm:grid-cols-3">
        {(["qa", "security", "performance"] as const).map((k, i) => {
          const r = latest[i];
          const Meta = KIND_META[k];
          const Icon = Meta.icon;
          return (
            <div key={k} className="rounded-md border border-border/40 bg-background/30 p-2.5">
              <div className="mb-1.5 flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-medium">
                  <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                  {Meta.label}
                </div>
                {r ? (
                  <span className={`text-[10px] font-semibold uppercase ${statusColor(r.status)}`}>{r.status}</span>
                ) : (
                  <span className="text-[10px] text-muted-foreground">—</span>
                )}
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-xl font-semibold tabular-nums">{r?.score ?? "—"}</span>
                <span className="text-[10px] text-muted-foreground">/100</span>
              </div>
              <Progress value={r?.score ?? 0} className="mt-1 h-1" />
              <p className="mt-1.5 line-clamp-2 text-[10px] text-muted-foreground">{r?.summary ?? "Not yet scanned"}</p>
            </div>
          );
        })}
      </div>

      <details className="group">
        <summary className="cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground">
          Recent runs ({reports.length})
        </summary>
        <ul className="mt-2 space-y-1.5">
          {reports.map((r) => {
            const Meta = KIND_META[r.kind];
            const Icon = Meta.icon;
            const open = openId === r.id;
            return (
              <li key={r.id} className="rounded-md border border-border/40 bg-background/30">
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-2 px-2.5 py-1.5 text-left"
                  onClick={() => setOpenId(open ? null : r.id)}
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-xs font-medium">{Meta.label}</span>
                    <Badge variant="outline" className={`text-[9px] ${statusColor(r.status)}`}>{r.status}</Badge>
                    <span className="truncate text-[10px] text-muted-foreground">{r.summary}</span>
                  </div>
                  <span className="text-[10px] tabular-nums text-muted-foreground">{r.score}</span>
                </button>
                {open && (
                  <ul className="border-t border-border/40 px-2.5 py-1.5">
                    {r.findings.length === 0 ? (
                      <li className="py-1 text-[11px] text-muted-foreground">No findings.</li>
                    ) : (
                      r.findings.slice(0, 25).map((f, j) => {
                        const SIcon = SEV_ICON[f.severity];
                        return (
                          <li key={j} className="flex items-start gap-1.5 py-0.5 text-[11px]">
                            <SIcon className={`mt-0.5 h-3 w-3 shrink-0 ${
                              f.severity === "error" ? "text-red-500" : f.severity === "warn" ? "text-amber-500" : "text-muted-foreground"
                            }`} />
                            <span className="font-mono text-[10px] text-muted-foreground">{f.rule}</span>
                            <span className="min-w-0 flex-1">{f.message}</span>
                            {f.path && (
                              <span className="shrink-0 truncate font-mono text-[10px] text-muted-foreground">
                                {f.path}{f.line ? `:${f.line}` : ""}
                              </span>
                            )}
                          </li>
                        );
                      })
                    )}
                    {r.findings.length > 25 && (
                      <li className="pt-1 text-[10px] text-muted-foreground">+{r.findings.length - 25} more…</li>
                    )}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      </details>
    </section>
  );
}
