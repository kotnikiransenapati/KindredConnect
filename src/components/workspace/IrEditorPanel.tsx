// B1 — IR Editor: view current IR, validate, save, and preview deterministic codegen.
import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getProjectIr, saveProjectIr, listIrRevisions, previewIrCodegen } from "@/lib/ir.functions";
import { IrSchema, lintIr, hashIr, type Ir } from "@/lib/ir.shared";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { FileCode2, Save, RefreshCw, History, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

export function IrEditorPanel({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const fetchIr = useServerFn(getProjectIr);
  const saveIr = useServerFn(saveProjectIr);
  const listRevs = useServerFn(listIrRevisions);
  const previewCode = useServerFn(previewIrCodegen);

  const irQ = useQuery({
    queryKey: ["project-ir", projectId],
    queryFn: () => fetchIr({ data: { projectId } }),
  });
  const revsQ = useQuery({
    queryKey: ["ir-revs", projectId],
    queryFn: () => listRevs({ data: { projectId } }),
  });
  const codeQ = useQuery({
    queryKey: ["ir-codegen", projectId],
    queryFn: () => previewCode({ data: { projectId } }),
    enabled: !!irQ.data,
  });

  const [draft, setDraft] = useState("");
  useEffect(() => { if (irQ.data) setDraft(JSON.stringify(irQ.data.ir, null, 2)); }, [irQ.data]);

  const parsed = useMemo(() => {
    try { return { ok: true as const, ir: IrSchema.parse(JSON.parse(draft || "{}")) }; }
    catch (e) { return { ok: false as const, err: e instanceof Error ? e.message : String(e) }; }
  }, [draft]);

  const issues = useMemo(() => (parsed.ok ? lintIr(parsed.ir) : []), [parsed]);
  const localHash = useMemo(() => (parsed.ok ? hashIr(parsed.ir) : ""), [parsed]);

  const save = useMutation({
    mutationFn: async () => {
      if (!parsed.ok) throw new Error(parsed.err);
      return saveIr({ data: { projectId, ir: parsed.ir as Ir, source: "manual" } });
    },
    onSuccess: (r) => {
      if (!r.ok) { toast.error("IR has errors — fix before saving"); return; }
      toast.success(`Saved v${r.version}`);
      qc.invalidateQueries({ queryKey: ["project-ir", projectId] });
      qc.invalidateQueries({ queryKey: ["ir-revs", projectId] });
      qc.invalidateQueries({ queryKey: ["ir-codegen", projectId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Save failed"),
  });

  return (
    <Card className="border-border/60">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          <FileCode2 className="size-4" /> IR Editor
          {irQ.data ? <Badge variant="secondary">v{irQ.data.version}</Badge> : null}
          {parsed.ok ? (
            <Badge variant="outline" className="font-mono text-[10px]">{localHash.slice(0, 12)}</Badge>
          ) : (
            <Badge variant="destructive">invalid JSON</Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="editor">
          <TabsList>
            <TabsTrigger value="editor">Editor</TabsTrigger>
            <TabsTrigger value="codegen">Codegen ({codeQ.data?.count ?? 0})</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
          </TabsList>

          <TabsContent value="editor" className="space-y-3 mt-3">
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              spellCheck={false}
              className="font-mono text-xs h-[360px] resize-y"
            />
            {!parsed.ok ? (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
                <AlertTriangle className="size-3.5 inline mr-1" />{parsed.err}
              </div>
            ) : issues.length > 0 ? (
              <ul className="rounded-md border border-amber-500/30 bg-amber-500/5 p-2 text-xs space-y-1">
                {issues.map((i, idx) => (
                  <li key={idx}>
                    <Badge variant={i.severity === "error" ? "destructive" : "secondary"} className="mr-2">{i.severity}</Badge>
                    <span className="font-mono">{i.path}</span> — {i.message}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-muted-foreground">No lint issues.</p>
            )}
            <div className="flex gap-2">
              <Button size="sm" onClick={() => save.mutate()} disabled={!parsed.ok || save.isPending || (parsed.ok && issues.some((i) => i.severity === "error"))}>
                <Save className="size-3.5 mr-1" /> Save revision
              </Button>
              <Button size="sm" variant="outline" onClick={() => { if (irQ.data) setDraft(JSON.stringify(irQ.data.ir, null, 2)); }}>
                <RefreshCw className="size-3.5 mr-1" /> Reset
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="codegen" className="mt-3">
            <div className="text-xs text-muted-foreground mb-2">
              Deterministic codegen — IR hash <span className="font-mono">{codeQ.data?.ir_hash.slice(0, 16)}</span> → {codeQ.data?.count ?? 0} files.
            </div>
            <ul className="max-h-[360px] overflow-auto rounded-md border border-border divide-y divide-border">
              {(codeQ.data?.files ?? []).map((f) => (
                <li key={f.path} className="px-3 py-1.5 text-xs flex items-center justify-between gap-2">
                  <span className="font-mono truncate">{f.path}</span>
                  <span className="text-muted-foreground tabular-nums">{f.content.length}b</span>
                </li>
              ))}
              {codeQ.data?.files.length === 0 ? <li className="p-3 text-xs text-muted-foreground">Empty IR — save a project first.</li> : null}
            </ul>
          </TabsContent>

          <TabsContent value="history" className="mt-3">
            <ul className="max-h-[320px] overflow-auto rounded-md border border-border divide-y divide-border">
              {(revsQ.data?.revisions ?? []).map((r) => (
                <li key={r.id} className="px-3 py-2 text-xs">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">v{r.version}</Badge>
                    <Badge variant="outline">{r.source}</Badge>
                    <span className="font-mono text-muted-foreground">{r.ir_hash.slice(0, 12)}</span>
                    <span className="ml-auto text-muted-foreground">{new Date(r.created_at).toLocaleString()}</span>
                  </div>
                  {r.note ? <p className="mt-1 text-muted-foreground truncate">{r.note}</p> : null}
                </li>
              ))}
              {revsQ.data?.revisions.length === 0 ? (
                <li className="p-3 text-xs text-muted-foreground"><History className="size-3.5 inline mr-1" />No revisions yet.</li>
              ) : null}
            </ul>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
