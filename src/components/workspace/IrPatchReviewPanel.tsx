import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getProjectIr } from "@/lib/ir.functions";
import { applyIrPatchSet, createIrPatchSet, getIrPatchSet, listIrPatchSets, rejectIrPatchSet } from "@/lib/ir-patches.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CheckCircle2, FileDiff, GitPullRequestArrow, Loader2, ShieldCheck, XCircle } from "lucide-react";
import { toast } from "sonner";

type PatchFile = {
  path: string;
  status: "added" | "modified" | "removed" | "unchanged";
  linesAdded: number;
  linesRemoved: number;
  hunks: Array<{ kind: "context" | "add" | "remove"; oldLine: number | null; newLine: number | null; text: string }>;
};

const statusTone: Record<string, string> = {
  reviewing: "border-sky-500/40 bg-sky-500/10 text-sky-600",
  applied: "border-emerald-500/40 bg-emerald-500/10 text-emerald-600",
  rejected: "border-muted bg-muted text-muted-foreground",
  draft: "border-amber-500/40 bg-amber-500/10 text-amber-600",
};

export function IrPatchReviewPanel({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const getIr = useServerFn(getProjectIr);
  const listFn = useServerFn(listIrPatchSets);
  const detailFn = useServerFn(getIrPatchSet);
  const createFn = useServerFn(createIrPatchSet);
  const applyFn = useServerFn(applyIrPatchSet);
  const rejectFn = useServerFn(rejectIrPatchSet);
  const [selected, setSelected] = useState<string>("");

  const irQ = useQuery({ queryKey: ["project-ir", projectId], queryFn: () => getIr({ data: { projectId } }) });
  const listQ = useQuery({ queryKey: ["ir-patch-sets", projectId], queryFn: () => listFn({ data: { projectId } }), refetchInterval: 15_000 });
  const detailQ = useQuery({
    enabled: !!selected,
    queryKey: ["ir-patch-set", projectId, selected],
    queryFn: () => detailFn({ data: { projectId, patchSetId: selected } }),
  });

  const stats = useMemo(() => {
    const rows = listQ.data?.patchSets ?? [];
    return {
      reviewing: rows.filter((row) => row.status === "reviewing").length,
      applied: rows.filter((row) => row.status === "applied").length,
      changed: rows.reduce((sum, row: any) => sum + ((row.stats?.added ?? 0) + (row.stats?.modified ?? 0) + (row.stats?.removed ?? 0)), 0),
    };
  }, [listQ.data]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["ir-patch-sets", projectId] });
    qc.invalidateQueries({ queryKey: ["ir-patch-set", projectId, selected] });
    qc.invalidateQueries({ queryKey: ["project-files", projectId] });
    qc.invalidateQueries({ queryKey: ["project-ir", projectId] });
  };

  const createM = useMutation({
    mutationFn: async () => {
      const ir = irQ.data?.ir;
      if (!ir) throw new Error("IR is still loading");
      const targetIr = createProductionPatch(ir);
      return createFn({ data: { projectId, targetIr, summary: "Production readiness patch: routes, CTA, auth/database adapter scaffolding, and generated docs" } });
    },
    onSuccess: (r) => { toast.success("Patch set created"); setSelected(r.patchSetId); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const applyM = useMutation({
    mutationFn: (patchSetId: string) => applyFn({ data: { projectId, patchSetId } }),
    onSuccess: (r) => { toast.success(`Applied patch: ${r.written} wrote, ${r.deleted} removed`); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const rejectM = useMutation({
    mutationFn: (patchSetId: string) => rejectFn({ data: { projectId, patchSetId } }),
    onSuccess: () => { toast.success("Patch rejected"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const files = (detailQ.data?.patchSet.files ?? []) as PatchFile[];

  return (
    <Card className="overflow-hidden border-border/60 bg-card/50">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          <GitPullRequestArrow className="size-4" /> IR Patch Review
          <Badge variant="outline" className="text-[10px]">B6 diff-and-patch</Badge>
          <span className="ml-auto flex gap-1 text-[11px] font-normal text-muted-foreground">
            <Badge variant="outline" className="text-[10px]">{stats.reviewing} open</Badge>
            <Badge variant="outline" className="text-[10px]">{stats.changed} changed files</Badge>
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-2 md:grid-cols-3">
          <Metric label="Open reviews" value={String(stats.reviewing)} />
          <Metric label="Applied patches" value={String(stats.applied)} />
          <Metric label="Latest IR version" value={String(irQ.data?.version ?? 0)} />
        </div>

        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border/60 bg-background/50 p-2">
          <ShieldCheck className="size-4 text-emerald-500" />
          <p className="flex-1 text-xs text-muted-foreground">Every generated change is reviewed as a deterministic patch before touching project files, reducing risky blind writes.</p>
          <Button size="sm" onClick={() => createM.mutate()} disabled={createM.isPending || irQ.isLoading}>
            {createM.isPending ? <Loader2 className="mr-1 size-3 animate-spin" /> : <FileDiff className="mr-1 size-3" />} Create readiness patch
          </Button>
        </div>

        <Tabs defaultValue="reviews">
          <TabsList>
            <TabsTrigger value="reviews">Reviews</TabsTrigger>
            <TabsTrigger value="diff" disabled={!selected}>Diff</TabsTrigger>
          </TabsList>
          <TabsContent value="reviews" className="space-y-2">
            {(listQ.data?.patchSets ?? []).map((patch: any) => (
              <button key={patch.id} type="button" onClick={() => setSelected(patch.id)} className={`w-full rounded-lg border p-3 text-left transition hover:bg-muted/40 ${selected === patch.id ? "border-primary/60 bg-primary/5" : "border-border/60 bg-background/40"}`}>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className={statusTone[patch.status] ?? ""}>{patch.status}</Badge>
                  <span className="text-sm font-medium">{patch.summary}</span>
                  <span className="ml-auto text-[11px] text-muted-foreground">{new Date(patch.created_at).toLocaleString()}</span>
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  +{patch.stats?.linesAdded ?? 0} / -{patch.stats?.linesRemoved ?? 0} · {patch.stats?.added ?? 0} added · {patch.stats?.modified ?? 0} modified · {patch.stats?.removed ?? 0} removed
                </div>
              </button>
            ))}
            {!listQ.data?.patchSets?.length && <p className="text-sm text-muted-foreground">No patch reviews yet. Create a readiness patch to see file-level changes.</p>}
          </TabsContent>
          <TabsContent value="diff" className="space-y-3">
            {detailQ.isLoading ? <div className="h-24 animate-pulse rounded-lg bg-muted/40" /> : null}
            {detailQ.data?.patchSet ? (
              <>
                <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border/60 p-2">
                  <Badge variant="outline" className={statusTone[detailQ.data.patchSet.status] ?? ""}>{detailQ.data.patchSet.status}</Badge>
                  <span className="text-sm font-medium">{detailQ.data.patchSet.summary}</span>
                  <div className="ml-auto flex gap-2">
                    <Button size="sm" variant="outline" disabled={detailQ.data.patchSet.status !== "reviewing" || rejectM.isPending} onClick={() => rejectM.mutate(detailQ.data!.patchSet.id)}><XCircle className="mr-1 size-3" /> Reject</Button>
                    <Button size="sm" disabled={detailQ.data.patchSet.status !== "reviewing" || applyM.isPending} onClick={() => applyM.mutate(detailQ.data!.patchSet.id)}><CheckCircle2 className="mr-1 size-3" /> Apply</Button>
                  </div>
                </div>
                <ScrollArea className="h-[460px] rounded-lg border border-border/60 bg-[#09090f]">
                  <div className="space-y-3 p-3">
                    {files.map((file) => <DiffFile key={file.path} file={file} />)}
                    {!files.length && <p className="text-sm text-muted-foreground">No file changes in this patch.</p>}
                  </div>
                </ScrollArea>
              </>
            ) : null}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border border-border/60 bg-background/40 p-2"><div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div><div className="text-lg font-semibold">{value}</div></div>;
}

function DiffFile({ file }: { file: PatchFile }) {
  return (
    <div className="overflow-hidden rounded-md border border-white/10 bg-black/30">
      <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2 text-xs text-slate-200">
        <Badge variant="outline" className="border-white/20 text-[10px] text-slate-200">{file.status}</Badge>
        <span className="font-mono">{file.path}</span>
        <span className="ml-auto text-emerald-400">+{file.linesAdded}</span><span className="text-red-400">-{file.linesRemoved}</span>
      </div>
      <pre className="overflow-x-auto p-2 text-[11px] leading-relaxed">
        {file.hunks.map((line, idx) => {
          const cls = line.kind === "add" ? "bg-emerald-500/10 text-emerald-200" : line.kind === "remove" ? "bg-red-500/10 text-red-200" : "text-slate-400";
          const prefix = line.kind === "add" ? "+" : line.kind === "remove" ? "-" : " ";
          return <div key={idx} className={cls}><span className="mr-2 inline-block w-12 select-none text-right text-slate-500">{line.newLine ?? line.oldLine ?? ""}</span>{prefix} {line.text}</div>;
        })}
      </pre>
    </div>
  );
}

function createProductionPatch(ir: any) {
  const home = ir.pages?.find((page: any) => page.route === "/") ?? { route: "/", title: "Home", description: "Production app generated by Foundry", auth: "public", layout: "default", components: [] };
  const hasPricing = ir.pages?.some((page: any) => page.route === "/pricing");
  const nextPages = [...(ir.pages ?? []).filter((page: any) => page.route !== "/"), {
    ...home,
    title: home.title || `${ir.name} Home`,
    components: [
      ...(home.components ?? []),
      { id: `patch-hero-${Date.now()}`, type: "hero", props: { eyebrow: "Production ready", title: ir.name, subtitle: ir.description || "A generated web, iOS, and Android product with portable runtime adapters.", cta: "Start building", secondaryCta: "Review pipeline" } },
      { id: `patch-cta-${Date.now()}`, type: "cta", props: { title: "Ship across web and native", subtitle: "Generated routes, data models, auth, database, preview, and deployment artifacts stay traceable through the IR pipeline.", button: "Generate app" } },
    ],
  }];
  if (!hasPricing) nextPages.push({ route: "/pricing", title: "Pricing", description: "Flexible plan page", auth: "public", layout: "default", components: [{ id: `patch-pricing-${Date.now()}`, type: "pricing", props: { title: "Plans for every launch", tiers: ["Starter", "Growth", "Enterprise"] } }] });
  return { ...ir, pages: nextPages.sort((a: any, b: any) => a.route.localeCompare(b.route)), integrations: ensureIntegration(ensureIntegration(ir.integrations ?? [], "auth", "portable-auth"), "db", "portable-database") };
}

function ensureIntegration(integrations: any[], kind: string, provider: string) {
  return integrations.some((item) => item.kind === kind) ? integrations : [...integrations, { kind, provider, config: { mode: "adapter-driven" } }];
}