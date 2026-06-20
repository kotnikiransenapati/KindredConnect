import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { GitCommit, History, RotateCcw, FileDiff, Loader2, Plus, Minus } from "lucide-react";
import { toast } from "sonner";
import {
  listVersions, snapshotProject, restoreVersion,
  getVersionDiff, getFileDiff,
} from "@/lib/versions.functions";

type FileStat = { path: string; status: "added" | "removed" | "modified" | "unchanged"; added: number; removed: number };

export function VersionsPanel({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const list = useServerFn(listVersions);
  const snap = useServerFn(snapshotProject);
  const restore = useServerFn(restoreVersion);
  const diff = useServerFn(getVersionDiff);
  const fileDiff = useServerFn(getFileDiff);

  const versionsQ = useQuery({
    queryKey: ["versions", projectId],
    queryFn: () => list({ data: { projectId } }),
  });

  const [fromId, setFromId] = useState<string | null>(null);
  const [toId, setToId] = useState<string | null>(null); // null = "Current"
  const [openFile, setOpenFile] = useState<string | null>(null);

  const snapMut = useMutation({
    mutationFn: (label: string) => snap({ data: { projectId, label: label || undefined } }),
    onSuccess: () => { toast.success("Snapshot saved"); qc.invalidateQueries({ queryKey: ["versions", projectId] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const restoreMut = useMutation({
    mutationFn: (versionId: string) => restore({ data: { projectId, versionId } }),
    onSuccess: (r) => toast.success(`Restored ${r.restored} files`),
    onError: (e: Error) => toast.error(e.message),
  });

  const diffQ = useQuery({
    queryKey: ["version-diff", projectId, fromId, toId],
    queryFn: () => diff({ data: { projectId, fromVersionId: fromId!, toVersionId: toId ?? undefined } }),
    enabled: !!fromId,
  });

  const fileDiffQ = useQuery({
    queryKey: ["file-diff", projectId, fromId, toId, openFile],
    queryFn: () => fileDiff({ data: { projectId, fromVersionId: fromId!, toVersionId: toId ?? undefined, path: openFile! } }),
    enabled: !!fromId && !!openFile,
  });

  const versions = versionsQ.data?.versions ?? [];

  return (
    <div className="space-y-3 rounded-2xl border border-border/60 bg-card/60 p-4">
      <header className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 font-display">
          <History className="h-4 w-4 text-brand" /> Versions
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => snapMut.mutate(new Date().toLocaleString())}
          disabled={snapMut.isPending}
        >
          {snapMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <GitCommit className="h-3.5 w-3.5" />}
          Snapshot
        </Button>
      </header>

      <ul className="max-h-60 space-y-1 overflow-auto text-sm">
        {versions.length === 0 && <li className="text-xs text-muted-foreground">No snapshots yet.</li>}
        {versions.map((v) => {
          const isFrom = fromId === v.id;
          const isTo = toId === v.id;
          return (
            <li key={v.id} className="flex items-center justify-between gap-2 rounded-md border border-border/40 px-2 py-1.5">
              <div className="min-w-0">
                <div className="truncate">{v.label ?? "Untitled snapshot"}</div>
                <div className="text-xs text-muted-foreground">
                  {new Date(v.created_at).toLocaleString()} · {v.file_count} files
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Button size="sm" variant={isFrom ? "default" : "ghost"} onClick={() => setFromId(v.id)} title="Diff from">A</Button>
                <Button size="sm" variant={isTo ? "default" : "ghost"} onClick={() => setToId(isTo ? null : v.id)} title="Diff to">B</Button>
                <Button size="sm" variant="ghost" onClick={() => restoreMut.mutate(v.id)} disabled={restoreMut.isPending} title="Restore">
                  <RotateCcw className="h-3.5 w-3.5" />
                </Button>
              </div>
            </li>
          );
        })}
      </ul>

      {fromId && (
        <section className="rounded-md border border-border/60 bg-background/40 p-3">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-1.5">
              <FileDiff className="h-3.5 w-3.5" /> Diff
              <span className="text-muted-foreground">A → {toId ? "B" : "Current"}</span>
            </div>
            {diffQ.data && (
              <div className="flex items-center gap-2 font-mono">
                <span className="text-emerald-500">+{diffQ.data.totals.added}</span>
                <span className="text-rose-500">−{diffQ.data.totals.removed}</span>
              </div>
            )}
          </div>

          {diffQ.isLoading ? (
            <div className="py-2 text-xs text-muted-foreground">Computing diff…</div>
          ) : (
            <ul className="mt-2 max-h-40 space-y-0.5 overflow-auto text-xs">
              {(diffQ.data?.files ?? []).filter((f: FileStat) => f.status !== "unchanged").map((f: FileStat) => (
                <li key={f.path}>
                  <button
                    onClick={() => setOpenFile(openFile === f.path ? null : f.path)}
                    className="flex w-full items-center justify-between rounded px-2 py-1 hover:bg-muted"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <Badge variant="outline" className="h-4 px-1 text-[10px]">{f.status[0].toUpperCase()}</Badge>
                      <span className="truncate font-mono">{f.path}</span>
                    </span>
                    <span className="flex items-center gap-2 font-mono">
                      <span className="text-emerald-500">+{f.added}</span>
                      <span className="text-rose-500">−{f.removed}</span>
                    </span>
                  </button>
                  {openFile === f.path && fileDiffQ.data && (
                    <pre className="mt-1 max-h-60 overflow-auto rounded bg-background/80 p-2 font-mono text-[11px] leading-snug">
                      {fileDiffQ.data.hunks.map((h, i) => (
                        <span key={i} className={h.added ? "block bg-emerald-500/10 text-emerald-300" : h.removed ? "block bg-rose-500/10 text-rose-300" : "block opacity-60"}>
                          {h.value.split("\n").filter((_, idx, arr) => !(idx === arr.length - 1 && _ === "")).map((line, li) => (
                            <span key={li} className="block">
                              {h.added ? <Plus className="mr-1 inline h-2.5 w-2.5" /> : h.removed ? <Minus className="mr-1 inline h-2.5 w-2.5" /> : <span className="mr-1 inline-block w-2.5" />}
                              {line}
                            </span>
                          ))}
                        </span>
                      ))}
                    </pre>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
