// Real-time collaborative text editor: broadcasts cursor positions + text
// deltas through a Supabase channel scoped to project+path, persists the
// authoritative document into project_files via RLS. Last-writer-wins on the
// remote payload; cursors decay after 8s of inactivity.
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { upsertProjectFile } from "@/lib/collab.functions";
import { Button } from "@/components/ui/button";
import { Save, Users } from "lucide-react";

type Presence = { user_id: string; name: string; color: string; pos: number; ts: number };
type DocBroadcast = { user_id: string; content: string; rev: number; ts: number };

const COLORS = ["#f472b6", "#a78bfa", "#60a5fa", "#34d399", "#fbbf24", "#fb7185", "#22d3ee", "#c084fc"];
const colorFor = (id: string) => {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return COLORS[Math.abs(h) % COLORS.length];
};

export function CollabEditor({
  projectId, path, initialContent, version,
}: { projectId: string; path: string; initialContent: string; version: number }) {
  const [text, setText] = useState(initialContent);
  const [presence, setPresence] = useState<Record<string, Presence>>({});
  const [dirty, setDirty] = useState(false);
  const meRef = useRef<{ id: string; name: string } | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const revRef = useRef(version);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const qc = useQueryClient();

  const saveFn = useServerFn(upsertProjectFile);
  const saveMu = useMutation({
    mutationFn: () => saveFn({ data: { projectId, path, content: text } }),
    onSuccess: () => {
      setDirty(false);
      qc.invalidateQueries({ queryKey: ["project-files", projectId] });
    },
  });

  // Reset when switching files
  useEffect(() => { setText(initialContent); setDirty(false); revRef.current = version; }, [path, initialContent, version]);

  // Channel lifecycle (scoped to project — path is filtered in payload)
  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !mounted) return;
      const { data: profile } = await supabase
        .from("profiles").select("display_name").eq("id", user.id).maybeSingle();
      meRef.current = {
        id: user.id,
        name: profile?.display_name ?? user.email?.split("@")[0] ?? "User",
      };

      const ch = supabase.channel(`collab-doc:${projectId}:${path}`, {
        config: { broadcast: { self: false } },
      });
      ch.on("broadcast", { event: "doc" }, ({ payload }) => {
        const p = payload as DocBroadcast;
        if (p.user_id === meRef.current?.id) return;
        if (p.rev <= revRef.current) return;
        revRef.current = p.rev;
        setText(p.content);
        setDirty(true);
      });
      ch.on("broadcast", { event: "cursor" }, ({ payload }) => {
        const p = payload as Presence;
        if (p.user_id === meRef.current?.id) return;
        setPresence((prev) => ({ ...prev, [p.user_id]: p }));
      });
      ch.subscribe();
      channelRef.current = ch;
    })();

    // Decay stale cursors
    const gc = setInterval(() => {
      const cutoff = Date.now() - 8_000;
      setPresence((p) => Object.fromEntries(Object.entries(p).filter(([, v]) => v.ts > cutoff)));
    }, 2_000);

    return () => {
      mounted = false;
      clearInterval(gc);
      if (channelRef.current) supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    };
  }, [projectId, path]);

  // Broadcast text (debounced 250ms) when user edits
  const broadcastText = useCallback((next: string) => {
    const ch = channelRef.current;
    const me = meRef.current;
    if (!ch || !me) return;
    revRef.current += 1;
    ch.send({
      type: "broadcast",
      event: "doc",
      payload: { user_id: me.id, content: next, rev: revRef.current, ts: Date.now() } satisfies DocBroadcast,
    });
  }, []);

  const broadcastCursor = useCallback((pos: number) => {
    const ch = channelRef.current;
    const me = meRef.current;
    if (!ch || !me) return;
    ch.send({
      type: "broadcast",
      event: "cursor",
      payload: { user_id: me.id, name: me.name, color: colorFor(me.id), pos, ts: Date.now() } satisfies Presence,
    });
  }, []);

  // Debounced broadcast on text change
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!dirty) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => broadcastText(text), 250);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [text, dirty, broadcastText]);

  // Render remote-cursor overlay markers above the textarea position
  const remote = useMemo(() => Object.values(presence).filter((p) => p.pos >= 0 && p.pos <= text.length), [presence, text.length]);

  return (
    <section className="rounded-2xl border border-border/60 bg-card/70 shadow-card backdrop-blur">
      <div className="flex items-center gap-2 border-b border-border/60 px-4 py-2">
        <Users className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="font-mono text-xs text-muted-foreground">{path}</span>
        <div className="flex -space-x-1">
          {remote.slice(0, 5).map((p) => (
            <span key={p.user_id} title={p.name}
              className="grid h-5 w-5 place-items-center rounded-full border border-background text-[9px] font-semibold text-background"
              style={{ background: p.color }}>
              {p.name[0]?.toUpperCase() ?? "?"}
            </span>
          ))}
        </div>
        {dirty && <span className="text-[10px] text-amber-400">● unsaved</span>}
        <Button size="sm" variant="ghost" className="ml-auto h-7 px-2 text-xs"
          onClick={() => saveMu.mutate()} disabled={!dirty || saveMu.isPending}>
          <Save className="mr-1 h-3 w-3" />
          {saveMu.isPending ? "Saving…" : "Save"}
        </Button>
      </div>
      <div className="relative">
        <textarea
          ref={taRef}
          value={text}
          spellCheck={false}
          onChange={(e) => { setText(e.target.value); setDirty(true); }}
          onKeyUp={(e) => broadcastCursor((e.target as HTMLTextAreaElement).selectionStart)}
          onClick={(e) => broadcastCursor((e.target as HTMLTextAreaElement).selectionStart)}
          className="block max-h-[60vh] min-h-[280px] w-full resize-y bg-transparent p-4 font-mono text-xs leading-relaxed outline-none"
        />
        {remote.length > 0 && (
          <div className="pointer-events-none absolute right-2 top-2 flex flex-col items-end gap-1">
            {remote.map((p) => (
              <span key={p.user_id} className="rounded-full px-2 py-0.5 text-[9px] font-medium text-background"
                style={{ background: p.color }}>
                {p.name} · {p.pos}
              </span>
            ))}
          </div>
        )}
      </div>
      {saveMu.error && (
        <div className="border-t border-destructive/40 bg-destructive/10 px-4 py-2 text-[11px] text-destructive">
          {(saveMu.error as Error).message}
        </div>
      )}
    </section>
  );
}
