import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link2, FileText, Globe, Trash2, Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { ingestUrl, indexKnowledgeSource, listKnowledgeSources, deleteKnowledgeSource } from "@/lib/knowledge.functions";

interface Props { projectId: string }

export function KnowledgePanel({ projectId }: Props) {
  const qc = useQueryClient();
  const list = useServerFn(listKnowledgeSources);
  const ingest = useServerFn(ingestUrl);
  const index = useServerFn(indexKnowledgeSource);
  const del = useServerFn(deleteKnowledgeSource);

  const { data, isLoading } = useQuery({
    queryKey: ["knowledge-sources", projectId],
    queryFn: () => list({ data: { projectId } }),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["knowledge-sources", projectId] });

  const urlMut = useMutation({
    mutationFn: (url: string) => ingest({ data: { projectId, url } }),
    onSuccess: (r) => { toast.success(`Indexed ${r.chunks} chunks`); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const noteMut = useMutation({
    mutationFn: ({ title, content }: { title: string; content: string }) =>
      index({ data: { projectId, sourceType: "note", sourcePath: title, content } }),
    onSuccess: (r) => { toast.success(`Indexed ${r.chunks} chunks`); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const delMut = useMutation({
    mutationFn: (v: { sourceType: "file" | "url" | "note"; sourcePath: string }) =>
      del({ data: { projectId, ...v } }),
    onSuccess: () => { toast.success("Removed"); invalidate(); },
  });

  const [url, setUrl] = useState("");
  const [noteTitle, setNoteTitle] = useState("");
  const [noteBody, setNoteBody] = useState("");

  return (
    <div className="space-y-4 rounded-2xl border border-border/60 bg-card/70 p-4 shadow-card backdrop-blur">
      <div>
        <h3 className="text-sm font-semibold">Project knowledge</h3>
        <p className="text-xs text-muted-foreground">Indexed context the AI retrieves before each reply (RAG).</p>
      </div>

      <Tabs defaultValue="url">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="url"><Globe className="mr-1.5 h-3.5 w-3.5" />URL</TabsTrigger>
          <TabsTrigger value="note"><FileText className="mr-1.5 h-3.5 w-3.5" />Note</TabsTrigger>
        </TabsList>
        <TabsContent value="url" className="space-y-2 pt-3">
          <Input placeholder="https://docs.example.com/getting-started" value={url} onChange={(e) => setUrl(e.target.value)} />
          <Button size="sm" disabled={!url || urlMut.isPending} onClick={() => { urlMut.mutate(url); setUrl(""); }} className="w-full">
            {urlMut.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Plus className="mr-1.5 h-3.5 w-3.5" />}
            Ingest URL
          </Button>
        </TabsContent>
        <TabsContent value="note" className="space-y-2 pt-3">
          <Input placeholder="Title (e.g. brand guidelines)" value={noteTitle} onChange={(e) => setNoteTitle(e.target.value)} />
          <Textarea placeholder="Paste docs, requirements, examples…" value={noteBody} onChange={(e) => setNoteBody(e.target.value)} className="min-h-[100px]" />
          <Button size="sm" disabled={!noteTitle || !noteBody || noteMut.isPending}
            onClick={() => { noteMut.mutate({ title: noteTitle, content: noteBody }); setNoteTitle(""); setNoteBody(""); }}
            className="w-full">
            {noteMut.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Plus className="mr-1.5 h-3.5 w-3.5" />}
            Add note
          </Button>
        </TabsContent>
      </Tabs>

      <div className="space-y-1.5">
        {isLoading && <div className="text-xs text-muted-foreground">Loading…</div>}
        {data?.sources.length === 0 && <div className="rounded-lg border border-dashed border-border/60 p-3 text-xs text-muted-foreground">No sources yet.</div>}
        {data?.sources.map((s) => (
          <div key={`${s.source_type}:${s.source_path}`} className="flex items-center gap-2 rounded-lg border border-border/60 bg-background/40 px-2.5 py-1.5 text-xs">
            {s.source_type === "url" ? <Link2 className="h-3.5 w-3.5 text-brand" /> : <FileText className="h-3.5 w-3.5 text-brand" />}
            <span className="flex-1 truncate" title={s.source_path}>{s.source_path}</span>
            <span className="font-mono text-[10px] text-muted-foreground">{s.chunks}c · ~{s.tokens}t</span>
            <Button size="icon" variant="ghost" className="h-6 w-6"
              onClick={() => delMut.mutate({ sourceType: s.source_type as "file" | "url" | "note", sourcePath: s.source_path })}>
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
