import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { listIntegrations, installIntegration } from "@/lib/integrations.functions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plug, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";

export function IntegrationsPanel({ projectId }: { projectId: string }) {
  const fetchList = useServerFn(listIntegrations);
  const install = useServerFn(installIntegration);
  const qc = useQueryClient();
  const [pending, setPending] = useState<string | null>(null);

  const listQ = useQuery({
    queryKey: ["integrations-catalog"],
    queryFn: () => fetchList(),
    staleTime: 5 * 60_000,
  });

  const installMut = useMutation({
    mutationFn: (slug: string) => install({ data: { projectId, slug, overwrite: false } }),
    onMutate: (slug) => setPending(slug),
    onSuccess: (r) => {
      toast.success(`Installed ${r.name}`, {
        description:
          (r.written.length ? `Wrote ${r.written.length} file(s). ` : "") +
          (r.skipped.length ? `Skipped ${r.skipped.length} existing. ` : "") +
          (r.envVars.length ? `Set: ${r.envVars.join(", ")}` : ""),
      });
      qc.invalidateQueries({ queryKey: ["project-files", projectId] });
    },
    onError: (e: Error) => toast.error(e.message),
    onSettled: () => setPending(null),
  });

  return (
    <section className="rounded-2xl border border-border/60 bg-card/40 p-4">
      <header className="mb-3 flex items-center gap-2">
        <Plug className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-medium">Integrations</h2>
      </header>
      {listQ.isLoading ? (
        <div className="h-24 animate-pulse rounded-lg bg-muted/30" />
      ) : (
        <ul className="grid gap-2">
          {(listQ.data ?? []).map((i) => {
            const busy = pending === i.slug && installMut.isPending;
            return (
              <li key={i.slug} className="rounded-lg border border-border/50 bg-background/40 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{i.name}</span>
                      <Badge variant="secondary" className="text-[10px] uppercase">{i.category}</Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{i.description}</p>
                    {i.envVars.length > 0 && (
                      <p className="mt-1 text-[11px] text-muted-foreground/80">
                        Requires: <code className="rounded bg-muted/60 px-1">{i.envVars.join(", ")}</code>
                      </p>
                    )}
                  </div>
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => installMut.mutate(i.slug)}>
                    {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                    <span className="ml-1.5">Install</span>
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
