import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Globe, Shield, ShieldCheck, ShieldAlert, Trash2, Loader2, Copy } from "lucide-react";
import { toast } from "sonner";
import {
  listProjectDomains, addProjectDomain,
  verifyProjectDomain, deleteProjectDomain,
} from "@/lib/domains.functions";

const REGIONS = ["global", "us", "eu", "ap"] as const;

export function DomainsPanel({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const list = useServerFn(listProjectDomains);
  const add = useServerFn(addProjectDomain);
  const verify = useServerFn(verifyProjectDomain);
  const del = useServerFn(deleteProjectDomain);

  const q = useQuery({ queryKey: ["domains", projectId], queryFn: () => list({ data: { projectId } }) });
  const [host, setHost] = useState("");
  const [region, setRegion] = useState<(typeof REGIONS)[number]>("global");

  const addMut = useMutation({
    mutationFn: () => add({ data: { projectId, hostname: host, region } }),
    onSuccess: () => { toast.success("Domain added — verify DNS to activate"); setHost(""); qc.invalidateQueries({ queryKey: ["domains", projectId] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const verifyMut = useMutation({
    mutationFn: (id: string) => verify({ data: { projectId, id } }),
    onSuccess: (r) => { toast[r.verified ? "success" : "error"](r.verified ? "Verified" : "TXT record not found yet"); qc.invalidateQueries({ queryKey: ["domains", projectId] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const delMut = useMutation({
    mutationFn: (id: string) => del({ data: { projectId, id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["domains", projectId] }),
  });

  return (
    <div className="space-y-3 rounded-2xl border border-border/60 bg-card/60 p-4">
      <header className="flex items-center gap-2 font-display">
        <Globe className="h-4 w-4 text-brand" /> Custom domains
      </header>

      <div className="flex flex-wrap gap-2">
        <Input
          placeholder="app.example.com"
          value={host}
          onChange={(e) => setHost(e.target.value)}
          className="flex-1 min-w-[180px] font-mono text-xs"
        />
        <select
          value={region}
          onChange={(e) => setRegion(e.target.value as (typeof REGIONS)[number])}
          className="rounded-md border border-border/60 bg-background px-2 text-xs"
        >
          {REGIONS.map((r) => <option key={r} value={r}>{r.toUpperCase()}</option>)}
        </select>
        <Button size="sm" onClick={() => addMut.mutate()} disabled={addMut.isPending || !host}>
          {addMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Add"}
        </Button>
      </div>

      <ul className="space-y-2 text-sm">
        {(q.data?.domains ?? []).length === 0 && (
          <li className="text-xs text-muted-foreground">No domains attached.</li>
        )}
        {(q.data?.domains ?? []).map((d) => {
          const Icon = d.status === "verified" ? ShieldCheck : d.status === "failed" ? ShieldAlert : Shield;
          return (
            <li key={d.id} className="rounded-md border border-border/40 p-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <Icon className={`h-3.5 w-3.5 ${d.status === "verified" ? "text-emerald-500" : d.status === "failed" ? "text-rose-500" : "text-muted-foreground"}`} />
                  <span className="truncate font-mono text-xs">{d.hostname}</span>
                  <Badge variant="outline" className="h-5 px-1.5 text-[10px]">{d.region}</Badge>
                </div>
                <div className="flex items-center gap-1">
                  <Button size="sm" variant="ghost" onClick={() => verifyMut.mutate(d.id)} disabled={verifyMut.isPending}>Verify</Button>
                  <Button size="sm" variant="ghost" onClick={() => delMut.mutate(d.id)} title="Remove">
                    <Trash2 className="h-3.5 w-3.5 text-rose-500" />
                  </Button>
                </div>
              </div>
              {d.status !== "verified" && (
                <div className="mt-2 rounded bg-background/60 p-2 font-mono text-[11px] text-muted-foreground">
                  <div className="flex items-center justify-between gap-2">
                    <span>Add TXT <code>_foundry-challenge.{d.hostname}</code></span>
                    <button
                      onClick={() => { navigator.clipboard.writeText(d.verification_token); toast.success("Copied"); }}
                      className="inline-flex items-center gap-1 text-foreground hover:text-brand"
                      type="button"
                    >
                      <Copy className="h-3 w-3" /> token
                    </button>
                  </div>
                  <div className="mt-1 break-all">{d.verification_token}</div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
