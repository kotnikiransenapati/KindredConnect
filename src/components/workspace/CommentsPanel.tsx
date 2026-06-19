import { useEffect, useState, useMemo } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { listComments, postComment, updateComment, deleteComment } from "@/lib/comments.functions";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { MessageSquare, Check, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

function renderBody(body: string) {
  // Highlight @mentions
  const parts = body.split(/(@[a-zA-Z0-9_.-]{2,40})/g);
  return parts.map((p, i) =>
    p.startsWith("@") ? (
      <span key={i} className="rounded bg-brand/15 px-1 text-brand">{p}</span>
    ) : (
      <span key={i}>{p}</span>
    ),
  );
}

export function CommentsPanel({ projectId, anchorPath }: { projectId: string; anchorPath?: string | null }) {
  const qc = useQueryClient();
  const fetchList = useServerFn(listComments);
  const doPost = useServerFn(postComment);
  const doUpdate = useServerFn(updateComment);
  const doDelete = useServerFn(deleteComment);
  const [draft, setDraft] = useState("");
  const [userId, setUserId] = useState<string | null>(null);

  const listQ = useQuery({
    queryKey: ["comments", projectId],
    queryFn: () => fetchList({ data: { projectId } }),
  });

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
  }, []);

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel(`project:${projectId}:comments`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "project_comments", filter: `project_id=eq.${projectId}` },
        () => {
          qc.invalidateQueries({ queryKey: ["comments", projectId] });
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [projectId, qc]);

  const filtered = useMemo(() => {
    const all = listQ.data?.comments ?? [];
    return anchorPath ? all.filter((c) => c.anchor_path === anchorPath) : all;
  }, [listQ.data, anchorPath]);

  const postM = useMutation({
    mutationFn: () => doPost({ data: { projectId, body: draft.trim(), anchorPath: anchorPath ?? null } }),
    onSuccess: () => { setDraft(""); qc.invalidateQueries({ queryKey: ["comments", projectId] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const resolveM = useMutation({
    mutationFn: (c: { id: string; resolved: boolean }) => doUpdate({ data: { id: c.id, resolved: !c.resolved } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["comments", projectId] }),
  });

  const deleteM = useMutation({
    mutationFn: (id: string) => doDelete({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["comments", projectId] }),
  });

  return (
    <div className="rounded-2xl border border-border/60 bg-card/70 p-4 shadow-card backdrop-blur">
      <div className="mb-3 flex items-center gap-2">
        <MessageSquare className="h-4 w-4 text-brand" />
        <h3 className="text-sm font-semibold">Comments</h3>
        {anchorPath && (
          <span className="ml-2 truncate rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">on {anchorPath}</span>
        )}
        <span className="ml-auto text-xs text-muted-foreground">{filtered.length}</span>
      </div>
      <ul className="mb-3 max-h-72 space-y-2 overflow-auto">
        {filtered.map((c) => (
          <li key={c.id} className={`rounded-lg border border-border/40 bg-background/40 p-2 text-xs ${c.resolved ? "opacity-60" : ""}`}>
            <div className="mb-1 flex items-center gap-2">
              <div className="grid h-5 w-5 place-items-center overflow-hidden rounded-full bg-muted text-[9px] font-semibold">
                {c.author.avatar_url ? (
                  <img src={c.author.avatar_url} alt="" className="h-full w-full object-cover" />
                ) : (
                  (c.author.display_name ?? "U").slice(0, 1).toUpperCase()
                )}
              </div>
              <span className="font-semibold">{c.author.display_name ?? "User"}</span>
              <span className="text-[10px] text-muted-foreground">
                {formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}
              </span>
              <div className="ml-auto flex gap-1">
                <button
                  className="rounded p-1 text-muted-foreground hover:bg-card hover:text-foreground"
                  title={c.resolved ? "Reopen" : "Resolve"}
                  onClick={() => resolveM.mutate({ id: c.id, resolved: c.resolved })}
                >
                  <Check className="h-3 w-3" />
                </button>
                {c.author_id === userId && (
                  <button
                    className="rounded p-1 text-muted-foreground hover:bg-card hover:text-destructive"
                    title="Delete"
                    onClick={() => deleteM.mutate(c.id)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                )}
              </div>
            </div>
            <div className="whitespace-pre-wrap break-words text-foreground/90">{renderBody(c.body)}</div>
            {c.anchor_path && !anchorPath && (
              <div className="mt-1 text-[10px] text-muted-foreground">↳ {c.anchor_path}</div>
            )}
          </li>
        ))}
        {filtered.length === 0 && (
          <li className="text-xs text-muted-foreground">No comments yet. Use @name to mention a teammate.</li>
        )}
      </ul>
      <div className="flex gap-2">
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Leave a comment… use @name to mention"
          rows={2}
          className="min-h-[60px] flex-1 resize-none text-xs"
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && draft.trim()) postM.mutate();
          }}
        />
        <Button size="sm" disabled={!draft.trim() || postM.isPending} onClick={() => postM.mutate()}>
          {postM.isPending ? "…" : "Post"}
        </Button>
      </div>
    </div>
  );
}
