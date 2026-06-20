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
import { Bell, Send, Trash2, Loader2, Plus, Link2, FileCode2 } from "lucide-react";
import { toast } from "sonner";
import {
  listPushCampaigns, upsertPushCampaign, sendPushCampaign, deletePushCampaign, listPushDevices,
  listDeepLinks, upsertDeepLink, deleteDeepLink, generateDeepLinkFiles,
} from "@/lib/push.functions";

export function PushPanel({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const listC = useServerFn(listPushCampaigns);
  const upsertC = useServerFn(upsertPushCampaign);
  const sendC = useServerFn(sendPushCampaign);
  const delC = useServerFn(deletePushCampaign);
  const listD = useServerFn(listPushDevices);
  const listL = useServerFn(listDeepLinks);
  const upsertL = useServerFn(upsertDeepLink);
  const delL = useServerFn(deleteDeepLink);
  const genL = useServerFn(generateDeepLinkFiles);

  const camps = useQuery({ queryKey: ["push-camps", projectId], queryFn: () => listC({ data: { projectId } }), refetchInterval: 4000 });
  const devices = useQuery({ queryKey: ["push-devs", projectId], queryFn: () => listD({ data: { projectId } }) });
  const links = useQuery({ queryKey: ["deep-links", projectId], queryFn: () => listL({ data: { projectId } }) });

  // campaign form
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [target, setTarget] = useState<"all" | "user" | "segment">("all");
  const [targetValue, setTargetValue] = useState("");

  const createMut = useMutation({
    mutationFn: () => upsertC({ data: { projectId, title, body, target, targetValue: targetValue || null } }),
    onSuccess: () => { toast.success("Campaign saved"); setTitle(""); setBody(""); setTargetValue(""); qc.invalidateQueries({ queryKey: ["push-camps", projectId] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const sendMut = useMutation({
    mutationFn: (id: string) => sendC({ data: { projectId, id } }),
    onSuccess: (r) => { toast.success(`Sent: ${r.sent} · failed: ${r.failed}${r.note ? ` — ${r.note}` : ""}`); qc.invalidateQueries({ queryKey: ["push-camps", projectId] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const delMut = useMutation({
    mutationFn: (id: string) => delC({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["push-camps", projectId] }),
  });

  // deep-link form
  const [linkPath, setLinkPath] = useState("/");
  const [linkSlug, setLinkSlug] = useState("");
  const [appleAppId, setAppleAppId] = useState("");
  const [androidPackage, setAndroidPackage] = useState("");
  const [sha256, setSha256] = useState("");

  const addLinkMut = useMutation({
    mutationFn: () => upsertL({ data: { projectId, path: linkPath, screenSlug: linkSlug } }),
    onSuccess: () => { toast.success("Deep link saved"); setLinkPath("/"); setLinkSlug(""); qc.invalidateQueries({ queryKey: ["deep-links", projectId] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const delLinkMut = useMutation({
    mutationFn: (id: string) => delL({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["deep-links", projectId] }),
  });
  const genMut = useMutation({
    mutationFn: () => genL({ data: { projectId, appleAppId, androidPackage, sha256Fingerprint: sha256 } }),
    onSuccess: (r) => toast.success(`Wrote ${r.written.length} files`),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="rounded-2xl border border-border/60 bg-card/40 p-4">
      <div className="mb-3 flex items-center gap-2">
        <Bell className="h-4 w-4 text-primary" />
        <h3 className="font-display text-sm font-semibold">Push & Deep Links</h3>
        <span className="ml-auto text-xs text-muted-foreground">
          {(devices.data?.devices ?? []).length} device{(devices.data?.devices ?? []).length === 1 ? "" : "s"} registered
        </span>
      </div>

      {/* Campaign composer */}
      <div className="mb-3 grid gap-2 rounded-lg border border-border/40 bg-background/30 p-3">
        <Input placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
        <Textarea rows={2} placeholder="Body" value={body} onChange={(e) => setBody(e.target.value)} />
        <div className="grid grid-cols-[140px_1fr_auto] gap-2">
          <Select value={target} onValueChange={(v) => setTarget(v as typeof target)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All devices</SelectItem>
              <SelectItem value="user">Specific user</SelectItem>
              <SelectItem value="segment">Platform segment</SelectItem>
            </SelectContent>
          </Select>
          <Input
            placeholder={target === "user" ? "user UUID" : target === "segment" ? "ios | android" : "—"}
            disabled={target === "all"}
            value={targetValue}
            onChange={(e) => setTargetValue(e.target.value)}
          />
          <Button size="sm" disabled={!title || !body || createMut.isPending} onClick={() => createMut.mutate()}>
            {createMut.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />} Save
          </Button>
        </div>
      </div>

      <ul className="mb-4 grid gap-2">
        {(camps.data?.campaigns ?? []).map((c) => (
          <li key={c.id} className="flex items-center gap-2 rounded-md border border-border/40 bg-background/30 p-2 text-xs">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate font-medium">{c.title}</span>
                <Badge variant="outline" className="text-[10px]">{c.target}</Badge>
                <Badge className="text-[10px]">{c.status}</Badge>
                {c.status === "sent" && <span className="text-muted-foreground">✓{c.sent_count} ✗{c.fail_count}</span>}
              </div>
              <p className="truncate text-muted-foreground">{c.body}</p>
              {c.error && <p className="text-rose-400">{c.error}</p>}
            </div>
            <Button size="sm" variant="ghost" disabled={sendMut.isPending} onClick={() => sendMut.mutate(c.id)}>
              <Send className="h-3 w-3" />
            </Button>
            <Button size="sm" variant="ghost" onClick={() => delMut.mutate(c.id)}>
              <Trash2 className="h-3 w-3" />
            </Button>
          </li>
        ))}
      </ul>

      {/* Deep links */}
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold">
        <Link2 className="h-3.5 w-3.5 text-cyan-400" /> Universal / App links
      </div>
      <div className="mb-2 grid gap-2 rounded-lg border border-border/40 bg-background/30 p-3">
        <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
          <Input placeholder="/path/:id" value={linkPath} onChange={(e) => setLinkPath(e.target.value)} />
          <Input placeholder="screen-slug" value={linkSlug} onChange={(e) => setLinkSlug(e.target.value.toLowerCase())} />
          <Button size="sm" disabled={!linkPath || !linkSlug || addLinkMut.isPending} onClick={() => addLinkMut.mutate()}>
            {addLinkMut.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
          </Button>
        </div>
        <ul className="grid gap-1">
          {(links.data?.links ?? []).map((l) => (
            <li key={l.id} className="flex items-center gap-2 rounded border border-border/30 px-2 py-1 text-[11px]">
              <code className="font-mono">{l.path}</code>
              <span className="text-muted-foreground">→ {l.screen_slug}</span>
              {!l.enabled && <Badge variant="secondary" className="text-[10px]">disabled</Badge>}
              <Button size="sm" variant="ghost" className="ml-auto h-6 w-6 p-0" onClick={() => delLinkMut.mutate(l.id)}>
                <Trash2 className="h-3 w-3" />
              </Button>
            </li>
          ))}
        </ul>
        <div className="grid grid-cols-3 gap-2">
          <Input placeholder="TEAMID.bundle.id" value={appleAppId} onChange={(e) => setAppleAppId(e.target.value)} />
          <Input placeholder="com.acme.app" value={androidPackage} onChange={(e) => setAndroidPackage(e.target.value)} />
          <Input placeholder="SHA256 AA:BB:CC…" value={sha256} onChange={(e) => setSha256(e.target.value)} />
        </div>
        <Button size="sm" variant="outline" disabled={genMut.isPending} onClick={() => genMut.mutate()}>
          {genMut.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileCode2 className="h-3 w-3" />}
          Generate /.well-known files
        </Button>
      </div>
    </div>
  );
}
