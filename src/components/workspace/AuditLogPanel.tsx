// Compliance / audit log viewer with CSV/JSON export.
import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listAuditLog, exportAuditLog } from "@/lib/audit.functions";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ShieldCheck, Download, RotateCw } from "lucide-react";
import { toast } from "sonner";

export function AuditLogPanel({ projectId }: { projectId: string }) {
  const [days, setDays] = useState(30);
  const [action, setAction] = useState<string>("all");
  const listFn = useServerFn(listAuditLog);
  const exportFn = useServerFn(exportAuditLog);

  const q = useQuery({
    queryKey: ["audit", projectId, days, action],
    queryFn: () => listFn({ data: { projectId, days, action: action === "all" ? undefined : action, limit: 200 } }),
    refetchInterval: 30_000,
  });

  const exportMu = useMutation({
    mutationFn: (format: "csv" | "json") => exportFn({ data: { projectId, days: 90, format } }),
    onSuccess: (res: any) => {
      const blob = new Blob([res.body], { type: res.mime });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = res.filename; a.click();
      URL.revokeObjectURL(url);
      toast.success("Export downloaded");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const entries = q.data?.entries ?? [];
  const knownActions = Array.from(new Set(entries.map((e: any) => e.action))).sort();

  return (
    <section className="rounded-2xl border border-border/60 bg-card/70 p-4 shadow-card backdrop-blur">
      <header className="mb-3 flex items-center gap-2">
        <ShieldCheck className="h-4 w-4 text-emerald-400" />
        <h3 className="font-display text-sm font-semibold">Compliance · Audit log</h3>
        <Button size="icon" variant="ghost" className="ml-auto h-7 w-7" onClick={() => q.refetch()}>
          <RotateCw className="h-3 w-3" />
        </Button>
        <Button size="sm" variant="outline" className="h-7 text-[11px]"
          disabled={exportMu.isPending} onClick={() => exportMu.mutate("csv")}>
          <Download className="mr-1 h-3 w-3" /> CSV
        </Button>
        <Button size="sm" variant="ghost" className="h-7 text-[11px]"
          disabled={exportMu.isPending} onClick={() => exportMu.mutate("json")}>
          JSON
        </Button>
      </header>

      <div className="mb-3 flex gap-2">
        <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
          <SelectTrigger className="h-7 w-24 text-[11px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {[7, 30, 90, 180, 365].map((n) => <SelectItem key={n} value={String(n)}>{n} days</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={action} onValueChange={setAction}>
          <SelectTrigger className="h-7 flex-1 text-[11px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All actions</SelectItem>
            {knownActions.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="max-h-[420px] space-y-1 overflow-y-auto">
        {q.isLoading && <p className="text-[11px] text-muted-foreground">Loading…</p>}
        {!q.isLoading && entries.length === 0 && (
          <p className="text-[11px] text-muted-foreground">No audit events in window.</p>
        )}
        {entries.map((e: any) => (
          <details key={e.id} className="rounded-md border border-border/60 bg-background/40 px-2.5 py-1.5 text-[11px]">
            <summary className="flex cursor-pointer items-center gap-2">
              <span className="w-32 truncate font-mono text-muted-foreground">
                {new Date(e.created_at).toISOString().slice(0, 19).replace("T", " ")}
              </span>
              <span className="rounded-full bg-brand/15 px-2 py-0.5 text-[10px] font-medium text-brand">
                {e.action}
              </span>
              <span className="truncate text-muted-foreground">
                {e.resource_type}{e.resource_id ? `:${e.resource_id.slice(0, 8)}` : ""}
              </span>
              <span className="ml-auto truncate text-[10px] text-muted-foreground">
                {e.actor_id ? e.actor_id.slice(0, 8) : "system"} · {e.ip ?? "—"}
              </span>
            </summary>
            <pre className="mt-2 overflow-auto rounded bg-background/60 p-2 text-[10px]">
              {JSON.stringify({ metadata: e.metadata, user_agent: e.user_agent }, null, 2)}
            </pre>
          </details>
        ))}
      </div>
    </section>
  );
}
