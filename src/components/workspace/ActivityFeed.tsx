// Project activity feed — recent member/system events.

import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { listProjectActivity, type ActivityRow } from "@/lib/activity.functions";
import { formatDistanceToNow } from "date-fns";
import { Activity } from "lucide-react";

const HUMAN: Record<string, string> = {
  "project.created_from_template": "created project from template",
  "project.created": "created project",
  "file.created": "created file",
  "file.updated": "edited file",
  "file.deleted": "deleted file",
  "member.invited": "invited a member",
  "member.removed": "removed a member",
  "version.created": "saved a version",
  "version.restored": "restored a version",
  "chat.message": "sent a message",
};

function describe(ev: ActivityRow) {
  const label = HUMAN[ev.action] ?? ev.action.replace(/\./g, " ");
  return ev.target ? `${label} — ${String(ev.target).slice(0, 60)}` : label;
}

export function ActivityFeed({ projectId }: { projectId: string }) {
  const fetchFn = useServerFn(listProjectActivity);
  const q = useQuery({
    queryKey: ["activity", projectId],
    queryFn: () => fetchFn({ data: { projectId, limit: 30 } }),
    refetchInterval: 30_000,
  });

  return (
    <div className="rounded-2xl border border-border/60 bg-card/60 p-5 shadow-card">
      <div className="mb-4 flex items-center gap-2 font-display text-sm font-semibold">
        <Activity className="h-4 w-4 text-brand" /> Activity
      </div>
      {q.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-10 animate-pulse rounded-lg bg-muted/30" />
          ))}
        </div>
      ) : !q.data?.events.length ? (
        <p className="text-sm text-muted-foreground">No activity yet.</p>
      ) : (
        <ul className="space-y-3 text-sm">
          {q.data.events.map((ev) => (
            <li key={ev.id} className="flex items-start gap-3">
              <div className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />
              <div className="min-w-0 flex-1">
                <div className="truncate">{describe(ev)}</div>
                <div className="text-[11px] text-muted-foreground">
                  {formatDistanceToNow(new Date(ev.created_at), { addSuffix: true })}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
