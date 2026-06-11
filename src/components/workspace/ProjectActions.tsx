import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listVersions, snapshotProject, restoreVersion, toggleShare } from "@/lib/versions.functions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { History, Share2, Camera, RotateCcw, Copy, Check } from "lucide-react";
import { toast } from "sonner";

interface Props { projectId: string; isPublic: boolean; shareToken: string | null }

export function ProjectActions({ projectId, isPublic, shareToken }: Props) {
  const qc = useQueryClient();
  const snap = useServerFn(snapshotProject);
  const list = useServerFn(listVersions);
  const restore = useServerFn(restoreVersion);
  const share = useServerFn(toggleShare);

  const [open, setOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const versionsQ = useQuery({
    queryKey: ["versions", projectId],
    queryFn: () => list({ data: { projectId } }),
    enabled: open,
  });

  const snapMut = useMutation({
    mutationFn: () => snap({ data: { projectId } }),
    onSuccess: () => {
      toast.success("Snapshot saved");
      qc.invalidateQueries({ queryKey: ["versions", projectId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const restoreMut = useMutation({
    mutationFn: (versionId: string) => restore({ data: { projectId, versionId } }),
    onSuccess: () => {
      toast.success("Version restored");
      qc.invalidateQueries({ queryKey: ["project-files", projectId] });
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const shareMut = useMutation({
    mutationFn: (enabled: boolean) => share({ data: { projectId, enabled } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project", projectId] });
      toast.success("Share settings updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const shareUrl = shareToken ? `${typeof window !== "undefined" ? window.location.origin : ""}/share/${shareToken}` : "";

  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" size="sm" onClick={() => snapMut.mutate()} disabled={snapMut.isPending}>
        <Camera className="mr-1.5 h-3.5 w-3.5" /> Snapshot
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm">
            <History className="mr-1.5 h-3.5 w-3.5" /> History
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader><DialogTitle>Version history</DialogTitle></DialogHeader>
          <div className="max-h-[60vh] space-y-2 overflow-y-auto">
            {versionsQ.data?.versions.length === 0 && (
              <p className="text-sm text-muted-foreground">No snapshots yet. Save one to enable restore.</p>
            )}
            {versionsQ.data?.versions.map((v) => (
              <div key={v.id} className="flex items-center gap-3 rounded-lg border border-border/60 bg-background/40 p-3">
                <div className="flex-1">
                  <div className="text-sm font-medium">{v.label || `Snapshot · ${new Date(v.created_at).toLocaleString()}`}</div>
                  <div className="text-xs text-muted-foreground">{v.file_count} files · {new Date(v.created_at).toLocaleString()}</div>
                </div>
                <Button size="sm" variant="ghost" onClick={() => restoreMut.mutate(v.id)} disabled={restoreMut.isPending}>
                  <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Restore
                </Button>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={shareOpen} onOpenChange={setShareOpen}>
        <DialogTrigger asChild>
          <Button size="sm" className="bg-gradient-brand text-brand-foreground">
            <Share2 className="mr-1.5 h-3.5 w-3.5" /> Share
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader><DialogTitle>Share project</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-lg border border-border/60 p-3">
              <div>
                <div className="text-sm font-medium">Public link</div>
                <div className="text-xs text-muted-foreground">Anyone with the link can view the live preview.</div>
              </div>
              <Switch checked={isPublic} onCheckedChange={(v) => shareMut.mutate(v)} disabled={shareMut.isPending} />
            </div>
            {isPublic && shareUrl && (
              <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-background/40 p-2">
                <code className="flex-1 truncate text-xs">{shareUrl}</code>
                <Button size="icon" variant="ghost" onClick={() => {
                  navigator.clipboard.writeText(shareUrl);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }}>
                  {copied ? <Check className="h-3.5 w-3.5 text-brand" /> : <Copy className="h-3.5 w-3.5" />}
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
