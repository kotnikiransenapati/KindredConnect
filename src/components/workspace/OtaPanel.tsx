import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { publishOtaBundle, listOtaBundles, getOtaBundleUrl } from "@/lib/ota.functions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Cloud, CloudUpload, Loader2, Download, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";

type Channel = "production" | "beta" | "internal";

export function OtaPanel({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const publishFn = useServerFn(publishOtaBundle);
  const listFn = useServerFn(listOtaBundles);
  const urlFn = useServerFn(getOtaBundleUrl);

  const [channel, setChannel] = useState<Channel>("production");
  const [notes, setNotes] = useState("");

  const bundlesQ = useQuery({
    queryKey: ["ota-bundles", projectId],
    queryFn: () => listFn({ data: { projectId, limit: 10 } }),
    staleTime: 15_000,
  });

  const publishMut = useMutation({
    mutationFn: () => publishFn({ data: { projectId, channel, notes: notes || undefined } }),
    onSuccess: (r) => {
      toast.success(`Published v${r.version} on ${r.channel}`, {
        description: `${(r.size_bytes / 1024).toFixed(1)} KB · sha256 ${r.sha256.slice(0, 12)}…`,
      });
      setNotes("");
      qc.invalidateQueries({ queryKey: ["ota-bundles", projectId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const downloadMut = useMutation({
    mutationFn: async (bundleId: string) => {
      const { url } = await urlFn({ data: { projectId, bundleId } });
      window.open(url, "_blank", "noopener");
      return url;
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const bundles = bundlesQ.data?.bundles ?? [];

  return (
    <section className="rounded-2xl border border-border/60 bg-card/40 p-4">
      <header className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Cloud className="h-4 w-4 text-muted-foreground" />
          <h2 className="font-display text-sm font-semibold">Mobile OTA bundles</h2>
        </div>
        <Badge variant="outline" className="font-mono text-[10px]">
          <ShieldCheck className="mr-1 h-3 w-3" /> sha256 signed
        </Badge>
      </header>

      <p className="mb-3 text-xs text-muted-foreground">
        Publish your current source as a versioned, hash-verified JS payload. Your wrapped
        Capacitor shell fetches the latest manifest at launch and updates in place — no app-store re-review.
      </p>

      <div className="mb-3 grid gap-2 sm:grid-cols-[140px_1fr_auto]">
        <Select value={channel} onValueChange={(v) => setChannel(v as Channel)}>
          <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="production">Production</SelectItem>
            <SelectItem value="beta">Beta</SelectItem>
            <SelectItem value="internal">Internal</SelectItem>
          </SelectContent>
        </Select>
        <Input
          placeholder="Release notes (optional)"
          value={notes}
          maxLength={500}
          onChange={(e) => setNotes(e.target.value)}
          className="h-9"
        />
        <Button size="sm" onClick={() => publishMut.mutate()} disabled={publishMut.isPending}>
          {publishMut.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <CloudUpload className="mr-1.5 h-3.5 w-3.5" />}
          Publish
        </Button>
      </div>

      <ul className="space-y-1.5">
        {bundles.length === 0 ? (
          <li className="rounded-md border border-dashed border-border/40 p-3 text-center text-xs text-muted-foreground">
            No bundles published yet.
          </li>
        ) : (
          bundles.map((b) => (
            <li key={b.id} className="flex items-center justify-between gap-2 rounded-md border border-border/40 bg-background/30 px-2.5 py-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-xs font-medium">
                  <span>v{b.version}</span>
                  <Badge variant="secondary" className="text-[9px]">{b.channel}</Badge>
                  <span className="font-mono text-[10px] text-muted-foreground">{b.sha256.slice(0, 10)}…</span>
                </div>
                <div className="text-[10px] text-muted-foreground">
                  {new Date(b.created_at).toLocaleString()} · {(b.size_bytes / 1024).toFixed(1)} KB
                </div>
              </div>
              <Button size="sm" variant="ghost" onClick={() => downloadMut.mutate(b.id)} disabled={downloadMut.isPending}>
                <Download className="h-3.5 w-3.5" />
              </Button>
            </li>
          ))
        )}
      </ul>
    </section>
  );
}
