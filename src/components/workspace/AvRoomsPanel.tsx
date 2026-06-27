import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Video, Mic, MicOff, VideoOff, DoorOpen, LockKeyhole, CircleDot } from "lucide-react";
import {
  listRooms, createRoom, updateRoom, joinRoom, leaveRoom, listParticipants,
} from "@/lib/av-rooms.functions";

export function AvRoomsPanel({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const list = useServerFn(listRooms);
  const create = useServerFn(createRoom);
  const update = useServerFn(updateRoom);
  const join = useServerFn(joinRoom);
  const leave = useServerFn(leaveRoom);
  const parts = useServerFn(listParticipants);

  const roomsQ = useQuery({
    queryKey: ["av-rooms", projectId],
    queryFn: () => list({ data: { projectId } }),
    refetchInterval: 8000,
  });
  const rooms = (roomsQ.data ?? []) as any[];
  const [activeId, setActiveId] = useState<string | null>(null);
  const partsQ = useQuery({
    queryKey: ["av-parts", activeId],
    queryFn: () => parts({ data: { projectId, roomId: activeId! } }),
    enabled: !!activeId,
    refetchInterval: 4000,
  });

  const [form, setForm] = useState({ name: "", topic: "", maxParticipants: 8, recording: false });
  const createM = useMutation({
    mutationFn: () => create({ data: { projectId, ...form, mode: "mesh" as const } }),
    onSuccess: () => { toast.success("Room created"); setForm({ name: "", topic: "", maxParticipants: 8, recording: false }); qc.invalidateQueries({ queryKey: ["av-rooms", projectId] }); },
    onError: (e: any) => toast.error(e.message),
  });
  const setStatus = useMutation({
    mutationFn: (v: { id: string; status: "open" | "locked" | "ended" }) =>
      update({ data: { projectId, id: v.id, status: v.status } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["av-rooms", projectId] }),
    onError: (e: any) => toast.error(e.message),
  });
  const joinM = useMutation({
    mutationFn: (id: string) => join({ data: { projectId, roomId: id, displayName: "Me" } }),
    onSuccess: (_r, id) => { setActiveId(id); toast.success("Joined"); },
    onError: (e: any) => toast.error(e.message),
  });
  const leaveM = useMutation({
    mutationFn: (id: string) => leave({ data: { projectId, roomId: id } }),
    onSuccess: () => { setActiveId(null); toast.success("Left room"); qc.invalidateQueries({ queryKey: ["av-parts"] }); },
  });

  const openCount = useMemo(() => rooms.filter((r) => r.status === "open").length, [rooms]);

  return (
    <Card className="border-border/60 bg-card/40">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Video className="h-4 w-4 text-primary" /> Live Rooms
          <Badge variant="outline" className="ml-2">{openCount} open</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2 md:grid-cols-[1fr_1fr_120px_auto]">
          <Input placeholder="Room name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Input placeholder="Topic (optional)" value={form.topic} onChange={(e) => setForm({ ...form, topic: e.target.value })} />
          <Input type="number" min={2} max={50} value={form.maxParticipants}
            onChange={(e) => setForm({ ...form, maxParticipants: Number(e.target.value) || 8 })} />
          <Button onClick={() => createM.mutate()} disabled={!form.name.trim() || createM.isPending}>Create</Button>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Label className="flex items-center gap-1">
            <input type="checkbox" checked={form.recording} onChange={(e) => setForm({ ...form, recording: e.target.checked })} />
            Enable recording
          </Label>
        </div>

        <div className="space-y-2">
          {rooms.length === 0 && <p className="text-xs text-muted-foreground">No rooms yet.</p>}
          {rooms.map((r) => (
            <div key={r.id} className="rounded-lg border border-border/60 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="font-medium text-sm">{r.name}</div>
                  {r.topic && <div className="text-xs text-muted-foreground">{r.topic}</div>}
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={r.status === "open" ? "default" : r.status === "locked" ? "secondary" : "outline"}>
                    {r.status}
                  </Badge>
                  {r.recording && <Badge variant="destructive" className="gap-1"><CircleDot className="h-3 w-3" /> REC</Badge>}
                  <Badge variant="outline">{r.mode}</Badge>
                  <Badge variant="outline">cap {r.max_participants}</Badge>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {r.status !== "ended" && (
                  <Button size="sm" variant="outline" onClick={() => joinM.mutate(r.id)}>
                    <DoorOpen className="mr-1 h-3.5 w-3.5" /> Join
                  </Button>
                )}
                {activeId === r.id && (
                  <Button size="sm" variant="ghost" onClick={() => leaveM.mutate(r.id)}>Leave</Button>
                )}
                {r.status === "open" && (
                  <Button size="sm" variant="ghost" onClick={() => setStatus.mutate({ id: r.id, status: "locked" })}>
                    <LockKeyhole className="mr-1 h-3.5 w-3.5" /> Lock
                  </Button>
                )}
                {r.status === "locked" && (
                  <Button size="sm" variant="ghost" onClick={() => setStatus.mutate({ id: r.id, status: "open" })}>Unlock</Button>
                )}
                {r.status !== "ended" && (
                  <Button size="sm" variant="ghost" className="text-destructive"
                    onClick={() => setStatus.mutate({ id: r.id, status: "ended" })}>End</Button>
                )}
              </div>

              {activeId === r.id && (
                <div className="mt-3 rounded-md border border-border/40 bg-background/40 p-2">
                  <div className="mb-1 text-[11px] uppercase tracking-wide text-muted-foreground">Participants</div>
                  {(partsQ.data ?? []).length === 0 ? (
                    <p className="text-xs text-muted-foreground">Just you.</p>
                  ) : (
                    <ul className="space-y-1 text-xs">
                      {(partsQ.data as any[]).map((p) => (
                        <li key={p.id} className="flex items-center justify-between">
                          <span>{p.display_name} <span className="text-muted-foreground">({p.role})</span></span>
                          <span className="flex items-center gap-1 text-muted-foreground">
                            {p.audio ? <Mic className="h-3 w-3" /> : <MicOff className="h-3 w-3" />}
                            {p.video ? <Video className="h-3 w-3" /> : <VideoOff className="h-3 w-3" />}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
