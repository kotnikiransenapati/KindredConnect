// Real-time collaborator cursors: broadcasts the current user's active
// file path through a Supabase broadcast channel scoped to the project,
// and exposes which other users are viewing which file.
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type Cursor = { user_id: string; display_name: string; color: string; path: string | null; ts: number };

const COLORS = ["#f472b6", "#a78bfa", "#60a5fa", "#34d399", "#fbbf24", "#fb7185", "#22d3ee", "#c084fc"];
function colorFor(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return COLORS[Math.abs(h) % COLORS.length];
}

export function useCollabCursors(projectId: string, activePath: string | null) {
  const [cursors, setCursors] = useState<Record<string, Cursor>>({});
  const meRef = useRef<{ id: string; name: string } | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !mounted) return;
      const { data: profile } = await supabase
        .from("profiles").select("display_name").eq("id", user.id).maybeSingle();
      meRef.current = { id: user.id, name: profile?.display_name ?? user.email?.split("@")[0] ?? "User" };

      const ch = supabase.channel(`collab:${projectId}`, { config: { broadcast: { self: false } } });
      ch.on("broadcast", { event: "cursor" }, ({ payload }) => {
        const c = payload as Cursor;
        if (c.user_id === meRef.current?.id) return;
        setCursors((prev) => ({ ...prev, [c.user_id]: c }));
      });
      ch.subscribe();
      channelRef.current = ch;
    })();

    // GC stale cursors every 10s
    const gc = setInterval(() => {
      setCursors((prev) => {
        const cutoff = Date.now() - 30_000;
        const next: Record<string, Cursor> = {};
        for (const [k, v] of Object.entries(prev)) if (v.ts > cutoff) next[k] = v;
        return next;
      });
    }, 10_000);

    return () => {
      mounted = false;
      clearInterval(gc);
      if (channelRef.current) supabase.removeChannel(channelRef.current);
    };
  }, [projectId]);

  // Broadcast our own cursor whenever path changes (throttled).
  useEffect(() => {
    const ch = channelRef.current;
    if (!ch || !meRef.current) return;
    const me = meRef.current;
    const t = setTimeout(() => {
      ch.send({
        type: "broadcast",
        event: "cursor",
        payload: { user_id: me.id, display_name: me.name, color: colorFor(me.id), path: activePath, ts: Date.now() } satisfies Cursor,
      });
    }, 150);
    return () => clearTimeout(t);
  }, [activePath]);

  return cursors;
}

export function CollabFileIndicator({ cursors, path }: { cursors: Record<string, { display_name: string; color: string; path: string | null }>; path: string }) {
  const here = Object.values(cursors).filter((c) => c.path === path);
  if (here.length === 0) return null;
  return (
    <div className="ml-2 flex -space-x-1">
      {here.slice(0, 4).map((c, i) => (
        <span
          key={i}
          title={`${c.display_name} is here`}
          className="grid h-4 w-4 place-items-center rounded-full border border-background text-[8px] font-semibold text-background"
          style={{ background: c.color }}
        >
          {c.display_name[0]?.toUpperCase() ?? "?"}
        </span>
      ))}
      {here.length > 4 && <span className="ml-1 text-[10px] text-muted-foreground">+{here.length - 4}</span>}
    </div>
  );
}
