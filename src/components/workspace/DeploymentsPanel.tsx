import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createDeployment, listDeployments, rollbackDeployment } from "@/lib/deployments.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Rocket, RotateCcw, ExternalLink, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

export function DeploymentsPanel({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const fetchList = useServerFn(listDeployments);
  const doDeploy = useServerFn(createDeployment);
  const doRollback = useServerFn(rollbackDeployment);
  const [label, setLabel] = useState("");

  const listQ = useQuery({
    queryKey: ["deployments", projectId],
    queryFn: () => fetchList({ data: { projectId } }),
  });

  const deployM = useMutation({
    mutationFn: () => doDeploy({ data: { projectId, label: label || undefined } }),
    onSuccess: (d) => {
      toast.success(`Deployed v${d.version_num}`);
      setLabel("");
      qc.invalidateQueries({ queryKey: ["deployments", projectId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rollbackM = useMutation({
    mutationFn: (id: string) => doRollback({ data: { projectId, deploymentId: id } }),
    onSuccess: () => {
      toast.success("Rolled back");
      qc.invalidateQueries({ queryKey: ["deployments", projectId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="rounded-2xl border border-border/60 bg-card/70 p-4 shadow-card backdrop-blur">
      <div className="mb-3 flex items-center gap-2">
        <Rocket className="h-4 w-4 text-brand" />
        <h3 className="text-sm font-semibold">Deployments</h3>
      </div>
      <div className="mb-3 flex gap-2">
        <Input
          placeholder="Optional label (e.g. v1.2 launch)"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          className="h-8 text-xs"
        />
        <Button size="sm" onClick={() => deployM.mutate()} disabled={deployM.isPending}>
          {deployM.isPending ? "Deploying…" : "Deploy"}
        </Button>
      </div>
      <ul className="space-y-1.5 max-h-64 overflow-auto">
        {listQ.data?.deployments.map((d) => {
          const url = `/p/${d.slug}/${d.version_num}`;
          const liveUrl = `/p/${d.slug}`;
          return (
            <li key={d.id} className="flex items-center gap-2 rounded-lg border border-border/40 bg-background/40 px-2 py-1.5 text-xs">
              <span className="font-mono text-muted-foreground">v{d.version_num}</span>
              {d.is_current && (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] text-emerald-300">
                  <CheckCircle2 className="h-2.5 w-2.5" /> live
                </span>
              )}
              {d.label && <span className="truncate text-foreground/80">{d.label}</span>}
              <span className="ml-auto text-muted-foreground">{d.file_count} files</span>
              <a href={url} target="_blank" rel="noreferrer" className="rounded p-1 hover:bg-card" title="Open version">
                <ExternalLink className="h-3 w-3" />
              </a>
              {!d.is_current && (
                <button
                  onClick={() => rollbackM.mutate(d.id)}
                  className="rounded p-1 hover:bg-card"
                  title="Roll back to this version"
                >
                  <RotateCcw className="h-3 w-3" />
                </button>
              )}
              {d.is_current && (
                <a href={liveUrl} target="_blank" rel="noreferrer" className="text-brand hover:underline">
                  live →
                </a>
              )}
            </li>
          );
        })}
        {(!listQ.data || listQ.data.deployments.length === 0) && (
          <li className="text-xs text-muted-foreground">No deployments yet. Click Deploy to publish a versioned snapshot.</li>
        )}
      </ul>
    </div>
  );
}
