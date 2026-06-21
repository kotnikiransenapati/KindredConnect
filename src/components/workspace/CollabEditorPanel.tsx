import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  archiveSession, createSession, joinSession, listComments, listOps,
  listParticipants, listSessions, postComment, presenceHeartbeat,
  resolveComment, submitOp,
} from "@/lib/collab.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Archive, CheckCircle2, MessageSquare, Users, Wand2 } from "lucide-react";

export function CollabEditorPanel({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const sessionsFn = useServerFn(listSessions);
  const createFn = useServerFn(createSession);
  const archiveFn = useServerFn(archiveSession);
  const joinFn = useServerFn(joinSession);
  const participantsFn = useServerFn(listParticipants);
  const heartbeatFn = useServerFn(presenceHeartbeat);
  const opFn = useServerFn(submitOp);
  const opsFn = useServerFn(listOps);
  const commentsFn = useServerFn(listComments);
  const postFn = useServerFn(postComment);
  const resolveFn = useServerFn(resolveComment);

  const sessions = useQuery({ queryKey: ["collab-sessions", projectId], queryFn: () => sessionsFn({ data: { projectId } }), refetchInterval: 15_000 });
  const [activeId, setActiveId] = useState<string>("");
  useEffect(() => { if (!activeId && sessions.data?.[0]?.id) setActiveId(sessions.data[0].id); }, [sessions.data, activeId]);
  const active = useMemo(() => sessions.data?.find((s: any) => s.id === activeId), [sessions.data, activeId]);

  const participants = useQuery({ enabled: !!activeId, queryKey: ["collab-participants", activeId], queryFn: () => participantsFn({ data: { sessionId: activeId, projectId } }), refetchInterval: 5_000 });
  const ops = useQuery({ enabled: !!activeId, queryKey: ["collab-ops", activeId], queryFn: () => opsFn({ data: { sessionId: activeId, projectId, sinceVersion: 0, limit: 200 } }), refetchInterval: 5_000 });
  const comments = useQuery({ enabled: !!activeId, queryKey: ["collab-comments", activeId], queryFn: () => commentsFn({ data: { sessionId: activeId, projectId } }), refetchInterval: 8_000 });

  useEffect(() => {
    if (!activeId) return;
    const t = setInterval(() => { heartbeatFn({ data: { sessionId: activeId, projectId, status: "online" } }).catch(() => {}); }, 12_000);
    return () => clearInterval(t);
  }, [activeId, projectId, heartbeatFn]);

  const [newSession, setNewSession] = useState({ documentPath: "src/routes/index.tsx", title: "Home route", initialContent: "Hello, world!" });
  const [join, setJoin] = useState({ displayName: "Editor" });
  const [opForm, setOpForm] = useState({ kind: "insert" as const, position: 0, text: "✨", length: 0 });
  const [comment, setComment] = useState("");

  const create = useMutation({
    mutationFn: () => createFn({ data: { ...newSession, projectId } }),
    onSuccess: (r: any) => { toast.success("Session created"); setActiveId(r.id); qc.invalidateQueries({ queryKey: ["collab-sessions", projectId] }); },
    onError: (e: any) => toast.error(e.message),
  });
  const archive = useMutation({
    mutationFn: (id: string) => archiveFn({ data: { id, projectId } }),
    onSuccess: () => { toast.success("Archived"); qc.invalidateQueries({ queryKey: ["collab-sessions", projectId] }); },
    onError: (e: any) => toast.error(e.message),
  });
  const joinM = useMutation({
    mutationFn: () => joinFn({ data: { sessionId: activeId, projectId, displayName: join.displayName } }),
    onSuccess: () => { toast.success("Joined session"); qc.invalidateQueries({ queryKey: ["collab-participants", activeId] }); },
    onError: (e: any) => toast.error(e.message),
  });
  const sendOp = useMutation({
    mutationFn: () => opFn({ data: {
      sessionId: activeId, projectId,
      parentVersion: Number(active?.head_version ?? 0),
      opKind: opForm.kind,
      payload: opForm.kind === "insert" ? { position: opForm.position, text: opForm.text } : { position: opForm.position, length: opForm.length },
      clientId: crypto.randomUUID().slice(0, 8),
    } }),
    onSuccess: () => { toast.success("Op applied"); qc.invalidateQueries({ queryKey: ["collab-sessions", projectId] }); qc.invalidateQueries({ queryKey: ["collab-ops", activeId] }); },
    onError: (e: any) => toast.error(e.message),
  });
  const sendComment = useMutation({
    mutationFn: () => postFn({ data: { sessionId: activeId, projectId, body: comment } }),
    onSuccess: () => { toast.success("Comment posted"); setComment(""); qc.invalidateQueries({ queryKey: ["collab-comments", activeId] }); },
    onError: (e: any) => toast.error(e.message),
  });
  const toggleResolve = useMutation({
    mutationFn: (vars: { id: string; resolved: boolean }) => resolveFn({ data: { id: vars.id, projectId, resolved: vars.resolved } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["collab-comments", activeId] }),
  });

  const snapshotText = String(active?.snapshot?.text ?? "");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Wand2 className="h-4 w-4" /> Live Collaborative Editor</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Active session</Label>
            <Select value={activeId} onValueChange={setActiveId}>
              <SelectTrigger><SelectValue placeholder="Select a session" /></SelectTrigger>
              <SelectContent>
                {(sessions.data ?? []).map((s: any) => (
                  <SelectItem key={s.id} value={s.id}>{s.title} · v{s.head_version} · {s.status}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {active && (
              <div className="flex gap-2 text-xs text-muted-foreground">
                <Badge variant="outline">{active.document_path}</Badge>
                <Button size="sm" variant="ghost" onClick={() => archive.mutate(active.id)}><Archive className="mr-1 h-3 w-3" /> Archive</Button>
              </div>
            )}
          </div>
          <div className="space-y-2 rounded-md border p-3">
            <Label className="text-xs">New session</Label>
            <Input placeholder="document path" value={newSession.documentPath} onChange={e => setNewSession(s => ({ ...s, documentPath: e.target.value }))} />
            <Input placeholder="title" value={newSession.title} onChange={e => setNewSession(s => ({ ...s, title: e.target.value }))} />
            <Textarea rows={2} placeholder="initial content" value={newSession.initialContent} onChange={e => setNewSession(s => ({ ...s, initialContent: e.target.value }))} />
            <Button size="sm" onClick={() => create.mutate()} disabled={create.isPending}>Create</Button>
          </div>
        </div>

        <Tabs defaultValue="editor">
          <TabsList>
            <TabsTrigger value="editor">Editor</TabsTrigger>
            <TabsTrigger value="presence"><Users className="mr-1 h-3 w-3" /> Presence</TabsTrigger>
            <TabsTrigger value="ops">Ops log</TabsTrigger>
            <TabsTrigger value="comments"><MessageSquare className="mr-1 h-3 w-3" /> Comments</TabsTrigger>
          </TabsList>

          <TabsContent value="editor" className="space-y-3">
            <div className="rounded-md border bg-muted/40 p-3 font-mono text-sm whitespace-pre-wrap min-h-32">{snapshotText || <span className="text-muted-foreground">— empty —</span>}</div>
            <div className="grid gap-2 md:grid-cols-4">
              <Select value={opForm.kind} onValueChange={(v: any) => setOpForm(s => ({ ...s, kind: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="insert">insert</SelectItem>
                  <SelectItem value="delete">delete</SelectItem>
                </SelectContent>
              </Select>
              <Input type="number" placeholder="position" value={opForm.position} onChange={e => setOpForm(s => ({ ...s, position: Number(e.target.value) }))} />
              {opForm.kind === "insert"
                ? <Input placeholder="text" value={opForm.text} onChange={e => setOpForm(s => ({ ...s, text: e.target.value }))} />
                : <Input type="number" placeholder="length" value={opForm.length} onChange={e => setOpForm(s => ({ ...s, length: Number(e.target.value) }))} />}
              <Button onClick={() => sendOp.mutate()} disabled={!activeId || sendOp.isPending}>Apply op</Button>
            </div>
          </TabsContent>

          <TabsContent value="presence" className="space-y-3">
            <div className="flex gap-2">
              <Input placeholder="Your display name" value={join.displayName} onChange={e => setJoin({ displayName: e.target.value })} />
              <Button onClick={() => joinM.mutate()} disabled={!activeId}>Join</Button>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {(participants.data ?? []).map((p: any) => (
                <div key={p.id} className="flex items-center gap-2 rounded-md border p-2 text-sm">
                  <span className="h-3 w-3 rounded-full" style={{ background: p.color }} />
                  <span className="font-medium">{p.display_name}</span>
                  <Badge variant="outline" className="ml-auto">{p.status}</Badge>
                </div>
              ))}
              {!participants.data?.length && <div className="text-sm text-muted-foreground">No one here yet — join to appear.</div>}
            </div>
          </TabsContent>

          <TabsContent value="ops">
            <div className="max-h-72 space-y-1 overflow-auto rounded-md border p-2 text-xs font-mono">
              {(ops.data ?? []).map((o: any) => (
                <div key={o.id} className="flex gap-2">
                  <span className="text-muted-foreground">v{o.version}</span>
                  <Badge variant="outline">{o.op_kind}</Badge>
                  <span className="truncate">{JSON.stringify(o.payload)}</span>
                </div>
              ))}
              {!ops.data?.length && <div className="text-muted-foreground">no ops yet</div>}
            </div>
          </TabsContent>

          <TabsContent value="comments" className="space-y-3">
            <div className="flex gap-2">
              <Textarea rows={2} placeholder="Add a comment…" value={comment} onChange={e => setComment(e.target.value)} />
              <Button onClick={() => sendComment.mutate()} disabled={!activeId || !comment.trim()}>Post</Button>
            </div>
            <div className="space-y-2">
              {(comments.data ?? []).map((c: any) => (
                <div key={c.id} className="rounded-md border p-2 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">{new Date(c.created_at).toLocaleString()}</span>
                    {c.resolved_at && <Badge variant="outline" className="text-green-600">resolved</Badge>}
                    <Button size="sm" variant="ghost" className="ml-auto" onClick={() => toggleResolve.mutate({ id: c.id, resolved: !c.resolved_at })}>
                      <CheckCircle2 className="h-3 w-3" />
                    </Button>
                  </div>
                  <div>{c.body}</div>
                </div>
              ))}
              {!comments.data?.length && <div className="text-sm text-muted-foreground">No comments yet.</div>}
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
