import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Users } from "lucide-react";

interface PresenceUser {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  color: string;
  online_at: string;
}

const COLORS = [
  "#f472b6", "#a78bfa", "#60a5fa", "#34d399",
  "#fbbf24", "#fb7185", "#22d3ee", "#c084fc",
];
function colorFor(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return COLORS[Math.abs(h) % COLORS.length];
}

export function PresenceBar({ projectId }: { projectId: string }) {
  const [users, setUsers] = useState<PresenceUser[]>([]);

  useEffect(() => {
    let mounted = true;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !mounted) return;
      const { data: profile } = await supabase
        .from("profiles").select("display_name, avatar_url")
        .eq("id", user.id).maybeSingle();

      const me: PresenceUser = {
        user_id: user.id,
        display_name: profile?.display_name ?? user.email?.split("@")[0] ?? "User",
        avatar_url: profile?.avatar_url ?? null,
        color: colorFor(user.id),
        online_at: new Date().toISOString(),
      };

      channel = supabase.channel(`project:${projectId}:presence`, {
        config: { presence: { key: user.id } },
      });

      channel
        .on("presence", { event: "sync" }, () => {
          if (!channel || !mounted) return;
          const state = channel.presenceState<PresenceUser>();
          const list: PresenceUser[] = [];
          for (const arr of Object.values(state)) {
            const first = arr[0] as PresenceUser | undefined;
            if (first) list.push(first);
          }
          setUsers(list);
        })
        .subscribe(async (status) => {
          if (status === "SUBSCRIBED" && channel) {
            await channel.track(me);
          }
        });
    })();

    return () => {
      mounted = false;
      if (channel) supabase.removeChannel(channel);
    };
  }, [projectId]);

  if (users.length === 0) return null;
  const visible = users.slice(0, 5);
  const extra = users.length - visible.length;

  return (
    <div className="flex items-center gap-2 rounded-full border border-border/60 bg-card/60 px-2.5 py-1 text-xs backdrop-blur">
      <Users className="h-3.5 w-3.5 text-muted-foreground" />
      <div className="flex -space-x-2">
        {visible.map((u) => (
          <div
            key={u.user_id}
            title={u.display_name}
            className="grid h-6 w-6 place-items-center overflow-hidden rounded-full border-2 border-background text-[10px] font-semibold text-white"
            style={{ background: u.color }}
          >
            {u.avatar_url ? (
              <img src={u.avatar_url} alt={u.display_name} className="h-full w-full object-cover" />
            ) : (
              u.display_name.slice(0, 1).toUpperCase()
            )}
          </div>
        ))}
      </div>
      {extra > 0 && <span className="text-muted-foreground">+{extra}</span>}
      <span className="text-muted-foreground">{users.length} online</span>
    </div>
  );
}
