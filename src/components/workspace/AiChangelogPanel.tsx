import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { toast } from "sonner";
import { FileText, Sparkles, CheckCircle2, Archive } from "lucide-react";
import {
  listSources, ingestSource, generateEntry, listEntries, setEntryStatus, editEntry,
} from "@/lib/ai-changelog.functions";

const KINDS = ["commit", "pr", "issue", "deploy", "manual"] as const;

export function AiChangelogPanel({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const lSrc = useServerFn(listSources);
  const ingest = useServerFn(ingestSource);
  const gen = useServerFn(generateEntry);
  const lEnt = useServerFn(listEntries);
  const setStat = useServerFn(setEntryStatus);
  const edit = useServerFn(editEntry);

  const sourcesQ = useQuery({ queryKey: ["cl-src", projectId], queryFn: () => lSrc({ data: { projectId, onlyUnconsumed: false } }), refetchInterval: 10_000 });
  const entriesQ = useQuery({ queryKey: ["cl-ent", projectId], queryFn: () => lEnt({ data: { projectId } }), refetchInterval: 10_000 });

  const [form, setForm] = useState({ kind: "commit" as (typeof KINDS)[number], ref: "", title: "", body: "" });
  const ingestM = useMutation({
    mutationFn: () => ingest({ data: { projectId, ...form } }),
    onSuccess: () => { toast.success("Source ingested"); setForm({ ...form, ref: "", title: "", body: "" }); qc.invalidateQueries({ queryKey: ["cl-src", projectId] }); },
    onError: (e: any) => toast.error(e.message),
  });
  const genM = useMutation({
    mutationFn: () => gen({ data: { projectId } }),
    onSuccess: () => { toast.success("Entry drafted"); qc.invalidateQueries({ queryKey: ["cl-ent", projectId] }); qc.invalidateQueries({ queryKey: ["cl-src", projectId] }); },
    onError: (e: any) => toast.error(e.message),
  });
  const statM = useMutation({
    mutationFn: (v: { id: string; status: "draft" | "review" | "published" | "archived" }) => setStat({ data: { projectId, ...v } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["cl-ent", projectId] }),
    onError: (e: any) => toast.error(e.message),
  });

  const [editing, setEditing] = useState<Record<string, { title: string; summary: string }>>({});
  const editM = useMutation({
    mutationFn: (id: string) => edit({ data: { projectId, id, ...editing[id] } }),
    onSuccess: () => { toast.success("Saved"); qc.invalidateQueries({ queryKey: ["cl-ent", projectId] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const sources = (sourcesQ.data ?? []) as any[];
  const entries = (entriesQ.data ?? []) as any[];
  const unconsumed = sources.filter((s) => !s.consumed_at).length;

  return (
    <Card className="border-border/60 bg-card/40">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <FileText className="h-4 w-4 text-primary" /> AI Changelog
          <Badge variant="outline" className="ml-2">{unconsumed} pending</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="sources">
          <TabsList>
            <TabsTrigger value="sources">Sources</TabsTrigger>
            <TabsTrigger value="entries">Entries</TabsTrigger>
          </TabsList>
          <TabsContent value="sources" className="space-y-3 pt-3">
            <div className="grid gap-2 md:grid-cols-[120px_1fr_1fr_auto]">
              <Select value={form.kind} onValueChange={(v) => setForm({ ...form, kind: v as any })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{KINDS.map((k) => <SelectItem key={k} value={k}>{k}</SelectItem>)}</SelectContent>
              </Select>
              <Input placeholder="ref (e.g. abc123 or #42)" value={form.ref} onChange={(e) => setForm({ ...form, ref: e.target.value })} />
              <Input placeholder="title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
              <Button onClick={() => ingestM.mutate()} disabled={!form.ref || !form.title || ingestM.isPending}>Ingest</Button>
            </div>
            <Textarea placeholder="body / notes (optional)" value={form.body}
              onChange={(e) => setForm({ ...form, body: e.target.value })} className="min-h-[60px]" />
            <Button variant="secondary" onClick={() => genM.mutate()} disabled={!unconsumed || genM.isPending}>
              <Sparkles className="mr-1 h-4 w-4" /> Generate entry from {unconsumed} pending
            </Button>
            <div className="max-h-60 overflow-auto rounded-md border border-border/60 text-xs">
              {sources.length === 0 ? (
                <div className="p-2 text-muted-foreground">No sources yet.</div>
              ) : sources.map((s) => (
                <div key={s.id} className="flex items-center justify-between border-b border-border/40 px-2 py-1.5 last:border-0">
                  <span><Badge variant="outline" className="mr-1">{s.kind}</Badge>{s.ref} — {s.title}</span>
                  {s.consumed_at ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> : <span className="text-muted-foreground">pending</span>}
                </div>
              ))}
            </div>
          </TabsContent>
          <TabsContent value="entries" className="space-y-3 pt-3">
            {entries.length === 0 && <p className="text-xs text-muted-foreground">No entries yet — ingest sources and generate.</p>}
            {entries.map((e) => {
              const draft = editing[e.id] ?? { title: e.title, summary: e.summary };
              return (
                <div key={e.id} className="rounded-lg border border-border/60 p-3">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <Badge>{e.version}</Badge>
                    <Badge variant="outline">{e.category}</Badge>
                    <Badge variant="outline">{e.impact}</Badge>
                    <Badge variant="outline">{e.audience}</Badge>
                    <Badge variant={e.status === "published" ? "default" : "secondary"} className="ml-auto">{e.status}</Badge>
                  </div>
                  <Input className="mb-2" value={draft.title}
                    onChange={(ev) => setEditing({ ...editing, [e.id]: { ...draft, title: ev.target.value } })} />
                  <Textarea className="min-h-[100px] font-mono text-xs" value={draft.summary}
                    onChange={(ev) => setEditing({ ...editing, [e.id]: { ...draft, summary: ev.target.value } })} />
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <Button size="sm" variant="outline" onClick={() => editM.mutate(e.id)}>Save edits</Button>
                    {e.status === "draft" && <Button size="sm" onClick={() => statM.mutate({ id: e.id, status: "review" })}>Submit review</Button>}
                    {e.status === "review" && <Button size="sm" onClick={() => statM.mutate({ id: e.id, status: "published" })}>Publish</Button>}
                    {e.status === "published" && (
                      <Button size="sm" variant="ghost" onClick={() => statM.mutate({ id: e.id, status: "archived" })}>
                        <Archive className="mr-1 h-3.5 w-3.5" /> Archive
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
