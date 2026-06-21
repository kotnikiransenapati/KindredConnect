import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createPairing,
  listPairings,
  revokePairing,
  listPreviewSessions,
  startPreviewSession,
} from "@/lib/device-pairing.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Smartphone, QrCode, ShieldOff, Radio, Copy, PlayCircle } from "lucide-react";
import { toast } from "sonner";

function relTime(iso?: string | null) {
  if (!iso) return "—";
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

const STATUS_VARIANTS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  pending: "secondary", paired: "default", revoked: "destructive", expired: "outline",
  idle: "outline", connecting: "secondary", live: "default", error: "destructive",
};

export function DevicePairingPanel({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const create = useServerFn(createPairing);
  const fetchPairs = useServerFn(listPairings);
  const revoke = useServerFn(revokePairing);
  const fetchSessions = useServerFn(listPreviewSessions);
  const startSession = useServerFn(startPreviewSession);

  const [lastToken, setLastToken] = useState<{ code: string; token: string; expiresAt: string } | null>(null);
  const [bundleUrl, setBundleUrl] = useState("");

  const pairsQ = useQuery({
    queryKey: ["device-pairings", projectId],
    queryFn: () => fetchPairs({ data: { projectId } }),
    refetchInterval: 4000,
  });
  const sessQ = useQuery({
    queryKey: ["preview-sessions", projectId],
    queryFn: () => fetchSessions({ data: { projectId } }),
    refetchInterval: 4000,
  });

  const createM = useMutation({
    mutationFn: () => create({ data: { projectId } }),
    onSuccess: (r: any) => {
      setLastToken({ code: r.pairing.code, token: r.token, expiresAt: r.pairing.expires_at });
      toast.success(`Pairing code ${r.pairing.code} — share securely.`);
      qc.invalidateQueries({ queryKey: ["device-pairings", projectId] });
    },
    onError: (e: any) => toast.error(e.message ?? "Failed to create pairing"),
  });
  const revokeM = useMutation({
    mutationFn: (id: string) => revoke({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["device-pairings", projectId] }),
  });
  const startM = useMutation({
    mutationFn: (pairingId?: string) =>
      startSession({ data: { projectId, pairingId, bundleUrl: bundleUrl || undefined } }),
    onSuccess: () => {
      toast.success("Preview session started");
      qc.invalidateQueries({ queryKey: ["preview-sessions", projectId] });
    },
    onError: (e: any) => toast.error(e.message ?? "Failed to start session"),
  });

  // auto-clear the one-time token after 60s for safety
  useEffect(() => {
    if (!lastToken) return;
    const t = setTimeout(() => setLastToken(null), 60_000);
    return () => clearTimeout(t);
  }, [lastToken]);

  const pairings = pairsQ.data?.pairings ?? [];
  const sessions = sessQ.data?.sessions ?? [];
  const pairedCount = pairings.filter((p: any) => p.status === "paired").length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Smartphone className="h-4 w-4" /> Live device preview
          <Badge variant="outline" className="ml-2">{pairedCount} paired</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={() => createM.mutate()} disabled={createM.isPending}>
            <QrCode className="mr-1.5 h-3.5 w-3.5" />
            {createM.isPending ? "Creating…" : "New pairing code"}
          </Button>
          <Input
            placeholder="Optional bundle URL (https://…)"
            value={bundleUrl}
            onChange={(e) => setBundleUrl(e.target.value)}
            className="max-w-md"
          />
          <Button size="sm" variant="secondary" onClick={() => startM.mutate(undefined)} disabled={startM.isPending}>
            <PlayCircle className="mr-1.5 h-3.5 w-3.5" /> Start preview
          </Button>
        </div>

        {lastToken && (
          <div className="rounded-lg border border-primary/40 bg-primary/5 p-3 text-sm">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-mono text-lg tracking-widest">{lastToken.code}</div>
                <div className="text-xs text-muted-foreground">
                  One-time token (shown once): <span className="font-mono">{lastToken.token}</span>
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  Expires {relTime(lastToken.expiresAt)} from now — paste into your device app.
                </div>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  navigator.clipboard.writeText(`${lastToken.code}:${lastToken.token}`);
                  toast.success("Copied to clipboard");
                }}
              >
                <Copy className="mr-1.5 h-3.5 w-3.5" /> Copy
              </Button>
            </div>
          </div>
        )}

        <div>
          <div className="mb-1.5 text-xs font-medium text-muted-foreground">Devices</div>
          <div className="space-y-1.5">
            {pairings.length === 0 && (
              <div className="rounded-md border border-dashed border-border/60 px-3 py-4 text-center text-xs text-muted-foreground">
                No devices paired yet.
              </div>
            )}
            {pairings.map((p: any) => (
              <div key={p.id} className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2 text-sm">
                <div className="flex items-center gap-2">
                  <Badge variant={STATUS_VARIANTS[p.status] ?? "outline"}>{p.status}</Badge>
                  <span className="font-mono text-xs">{p.code}</span>
                  <span className="text-xs text-muted-foreground">
                    {p.platform ?? "—"} · {p.device_name ?? "unknown"} · last seen {relTime(p.last_seen_at)}
                  </span>
                </div>
                {p.status === "paired" && (
                  <div className="flex items-center gap-1">
                    <Button size="sm" variant="ghost" onClick={() => startM.mutate(p.id)}>
                      <Radio className="mr-1.5 h-3.5 w-3.5" /> Preview
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => revokeM.mutate(p.id)}>
                      <ShieldOff className="mr-1.5 h-3.5 w-3.5" /> Revoke
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="mb-1.5 text-xs font-medium text-muted-foreground">Recent preview sessions</div>
          <div className="space-y-1.5">
            {sessions.length === 0 && (
              <div className="rounded-md border border-dashed border-border/60 px-3 py-3 text-center text-xs text-muted-foreground">
                No sessions yet.
              </div>
            )}
            {sessions.map((s: any) => (
              <div key={s.id} className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2 text-xs">
                <div className="flex items-center gap-2">
                  <Badge variant={STATUS_VARIANTS[s.status] ?? "outline"}>{s.status}</Badge>
                  <span className="text-muted-foreground">{s.bundle_version ?? "v?"}</span>
                  <span className="text-muted-foreground">events: {s.event_count}</span>
                  <span className="text-muted-foreground">{relTime(s.last_event_at)}</span>
                </div>
                {s.error && <span className="text-destructive truncate max-w-[40%]">{s.error}</span>}
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
