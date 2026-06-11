// Notification bell — dropdown of recent notifications, unread count badge,
// mark-read on click, mark-all-read, delete. Polls every 60s while open page.

import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Bell, Check, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import {
  listNotifications, markNotificationRead, markAllNotificationsRead, deleteNotification,
} from "@/lib/notifications.functions";
import { formatDistanceToNow } from "date-fns";
import { Link } from "@tanstack/react-router";

export function NotificationsBell() {
  const fetchList = useServerFn(listNotifications);
  const markRead = useServerFn(markNotificationRead);
  const markAll = useServerFn(markAllNotificationsRead);
  const del = useServerFn(deleteNotification);
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ["notifications"],
    queryFn: () => fetchList(),
    refetchInterval: 60_000,
  });

  const inv = () => qc.invalidateQueries({ queryKey: ["notifications"] });
  const readMut = useMutation({ mutationFn: (id: string) => markRead({ data: { id } }), onSuccess: inv });
  const allMut = useMutation({ mutationFn: () => markAll(), onSuccess: inv });
  const delMut = useMutation({ mutationFn: (id: string) => del({ data: { id } }), onSuccess: inv });

  const unread = q.data?.unread ?? 0;
  const items = q.data?.notifications ?? [];

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Notifications">
          <Bell className="h-5 w-5" />
          {unread > 0 && (
            <Badge className="absolute -right-1 -top-1 h-5 min-w-5 justify-center rounded-full bg-brand p-0 px-1 text-[10px] text-brand-foreground">
              {unread > 9 ? "9+" : unread}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 p-0">
        <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
          <div className="font-display text-sm font-semibold">Notifications</div>
          {unread > 0 && (
            <Button variant="ghost" size="sm" onClick={() => allMut.mutate()} disabled={allMut.isPending}>
              <Check className="mr-1 h-3 w-3" /> Mark all read
            </Button>
          )}
        </div>
        <div className="max-h-96 overflow-y-auto">
          {items.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">You're all caught up.</div>
          ) : (
            <ul className="divide-y divide-border/60">
              {items.map((n) => (
                <li key={n.id} className={`group relative px-4 py-3 ${n.read_at ? "" : "bg-brand/5"}`}>
                  <div className="flex items-start gap-3">
                    <div className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.read_at ? "bg-muted" : "bg-brand"}`} />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium">{n.title}</div>
                      {n.body && <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{n.body}</p>}
                      <div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground">
                        <span>{formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}</span>
                        {n.link && (
                          <a
                            href={n.link}
                            onClick={() => !n.read_at && readMut.mutate(n.id)}
                            className="text-brand hover:underline"
                          >
                            Open →
                          </a>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => delMut.mutate(n.id)}
                      className="opacity-0 transition-opacity group-hover:opacity-100"
                      aria-label="Dismiss"
                    >
                      <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
