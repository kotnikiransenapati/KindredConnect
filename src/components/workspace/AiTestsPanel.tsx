import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  authorCase, deleteCase, listCases, listRuns, listSuites,
  runCase, testStats, upsertSuite,
} from "@/lib/ai-tests.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { FlaskConical, Play, Sparkles, Trash2 } from "lucide-react";

const tone: Record<string, string> = {
  passed: "border-emerald-500/40 bg-emerald-500/10 text-emerald-600",
  failed: "bg-destructive text-destructive-foreground",
  healed: "border-amber-500/40 bg-amber-500/10 text-amber-600",
  flaky: "border-amber-500/40 bg-amber-500/10 text-amber-600",
  pending: "border-muted bg-muted/60 text-muted-foreground",
  skipped: "border-muted bg-muted/60 text-muted-foreground",
};

export function AiTestsPanel({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const suitesFn = useServerFn(listSuites);
  const upsertSuiteFn = useServerFn(upsertSuite);
  const casesFn = useServerFn(listCases);
  const authorFn = useServerFn(authorCase);
  const delFn = useServerFn(deleteCase);
  const runFn = useServerFn(runCase);
  const runsFn = useServerFn(listRuns);
  const statsFn = useServerFn(testStats);

  const suites = useQuery({ queryKey: ["aitest-suites", projectId], queryFn: () => suitesFn({ data: { projectId } }) });
  const stats = useQuery({ queryKey: ["aitest-stats", projectId], queryFn: () => statsFn({ data: { projectId } }), refetchInterval: 30_000 });
  const [suiteId, setSuiteId] = useState("");
  useMemo(() => { if (!suiteId && suites.data?.[0]?.id) setSuiteId(suites.data[0].id); }, [suites.data, suiteId]);
  const cases = useQuery({ enabled: !!suiteId, queryKey: ["aitest-cases", suiteId], queryFn: () => casesFn({ data: { suiteId, projectId } }) });
  const [openCase, setOpenCase] = useState("");
  const runs = useQuery({ enabled: !!openCase, queryKey: ["aitest-runs", openCase], queryFn: () => runsFn({ data: { caseId: openCase, projectId } }), refetchInterval: 5_000 });

  const [suite, setSuite] = useState({ name: "Smoke suite", baseUrl: "https://example.com", target: "Critical flows" });
  const [tc, setTc] = useState({
    title: "Sign in happy path",
    userStory: "Go to /login\nType user@test.com into 'Email'\nType correct-horse-battery into 'Password'\nClick 'Sign in'\nExpect 'Dashboard'",
    selectorStrategy: "auto" as const,
    maxRetries: 3,
  });

  const saveSuite = useMutation({
    mutationFn: () => upsertSuiteFn({ data: { projectId, ...suite } }),
    onSuccess: (r: any) => { toast.success("Suite saved"); setSuiteId(r.id); qc.invalidateQueries({ queryKey: ["aitest-suites", projectId] }); },
    onError: (e: any) => toast.error(e.message),
  });
  const author = useMutation({
    mutationFn: () => authorFn({ data: { suiteId, projectId, ...tc } }),
    onSuccess: () => { toast.success("Case authored"); qc.invalidateQueries({ queryKey: ["aitest-cases", suiteId] }); },
    onError: (e: any) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: (id: string) => delFn({ data: { id, projectId } }),
    onSuccess: () => { toast.success("Deleted"); qc.invalidateQueries({ queryKey: ["aitest-cases", suiteId] }); },
  });
  const run = useMutation({
    mutationFn: (id: string) => runFn({ data: { caseId: id, projectId } }),
    onSuccess: (r: any) => { toast.success(`Final: ${r.final}`); qc.invalidateQueries({ queryKey: ["aitest-cases", suiteId] }); qc.invalidateQueries({ queryKey: ["aitest-stats", projectId] }); qc.invalidateQueries({ queryKey: ["aitest-runs", openCase] }); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2"><FlaskConical className="h-4 w-4" /> Agentic Playwright Author</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2 sm:grid-cols-5">
          {(["total","passed","failed","healed","flaky"] as const).map(k => (
            <div key={k} className="rounded-md border p-2"><div className="text-xs text-muted-foreground">{k}</div><div className="text-lg font-semibold">{(stats.data as any)?.[k] ?? 0}</div></div>
          ))}
        </div>
        <Tabs defaultValue="cases">
          <TabsList>
            <TabsTrigger value="cases">Cases</TabsTrigger>
            <TabsTrigger value="author"><Sparkles className="mr-1 h-3 w-3" />Author</TabsTrigger>
            <TabsTrigger value="suite">Suite</TabsTrigger>
          </TabsList>

          <TabsContent value="suite" className="space-y-2">
            <div className="grid gap-2 md:grid-cols-3">
              <Input placeholder="suite name" value={suite.name} onChange={e => setSuite(s => ({ ...s, name: e.target.value }))} />
              <Input placeholder="base url" value={suite.baseUrl} onChange={e => setSuite(s => ({ ...s, baseUrl: e.target.value }))} />
              <Input placeholder="target" value={suite.target} onChange={e => setSuite(s => ({ ...s, target: e.target.value }))} />
            </div>
            <Button onClick={() => saveSuite.mutate()} disabled={saveSuite.isPending}>Save suite</Button>
            <div className="space-y-1 text-sm">
              {(suites.data ?? []).map((s: any) => (
                <div key={s.id} className={`rounded-md border p-2 ${s.id === suiteId ? "bg-muted/50" : ""}`} onClick={() => setSuiteId(s.id)} role="button">
                  <div className="font-medium">{s.name}</div>
                  <div className="text-xs text-muted-foreground">{s.base_url} · {s.status}</div>
                </div>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="author" className="space-y-2">
            <Input placeholder="case title" value={tc.title} onChange={e => setTc(s => ({ ...s, title: e.target.value }))} />
            <Textarea rows={6} placeholder="User story (one step per line: Go to / Click / Type / Expect)" value={tc.userStory} onChange={e => setTc(s => ({ ...s, userStory: e.target.value }))} />
            <div className="grid gap-2 md:grid-cols-3">
              <Select value={tc.selectorStrategy} onValueChange={(v: any) => setTc(s => ({ ...s, selectorStrategy: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{["auto","role","testid","text","css"].map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
              </Select>
              <Input type="number" value={tc.maxRetries} onChange={e => setTc(s => ({ ...s, maxRetries: Number(e.target.value) }))} />
              <Button onClick={() => author.mutate()} disabled={!suiteId || author.isPending}><Sparkles className="mr-1 h-3 w-3" /> Generate spec</Button>
            </div>
          </TabsContent>

          <TabsContent value="cases" className="space-y-2">
            {(cases.data ?? []).map((c: any) => (
              <div key={c.id} className="rounded-md border p-2 text-sm">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{c.title}</span>
                  <Badge variant="outline" className={tone[c.last_status]}>{c.last_status}</Badge>
                  <span className="ml-auto flex gap-1">
                    <Button size="sm" variant="outline" onClick={() => run.mutate(c.id)}><Play className="h-3 w-3" /></Button>
                    <Button size="sm" variant="ghost" onClick={() => setOpenCase(openCase === c.id ? "" : c.id)}>Runs</Button>
                    <Button size="sm" variant="ghost" onClick={() => remove.mutate(c.id)}><Trash2 className="h-3 w-3" /></Button>
                  </span>
                </div>
                <pre className="mt-1 max-h-40 overflow-auto rounded bg-muted/40 p-2 text-xs">{c.spec_code}</pre>
                {openCase === c.id && (
                  <div className="mt-1 space-y-1">
                    {(runs.data ?? []).map((r: any) => (
                      <div key={r.id} className="flex items-center gap-2 text-xs">
                        <Badge variant="outline" className={tone[r.status]}>{r.status}</Badge>
                        <span>attempt {r.attempt} · {r.duration_ms}ms</span>
                        {r.failure_reason && <span className="text-destructive">{r.failure_reason}</span>}
                        {Array.isArray(r.healed_locators) && r.healed_locators.length > 0 && <Badge variant="outline" className="text-amber-600">healed</Badge>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {!cases.data?.length && <div className="text-sm text-muted-foreground">No cases yet — author one.</div>}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
