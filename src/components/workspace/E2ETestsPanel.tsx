import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { FlaskConical, Wand2, Loader2, Trash2, CheckCircle2, XCircle, FileCode2 } from "lucide-react";
import { toast } from "sonner";
import { listE2eTests, generateE2eTest, deleteE2eTest } from "@/lib/e2e-tests.functions";

export function E2ETestsPanel({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const list = useServerFn(listE2eTests);
  const gen = useServerFn(generateE2eTest);
  const del = useServerFn(deleteE2eTest);

  const q = useQuery({
    queryKey: ["e2e-tests", projectId],
    queryFn: () => list({ data: { projectId } }),
    refetchInterval: 6_000,
  });

  const [name, setName] = useState("");
  const [story, setStory] = useState("");

  const create = useMutation({
    mutationFn: async () => gen({ data: { projectId, name, userStory: story } }),
    onSuccess: (r) => {
      toast.success(`Spec generated → ${r.specPath}`);
      setName(""); setStory("");
      qc.invalidateQueries({ queryKey: ["e2e-tests", projectId] });
      qc.invalidateQueries({ queryKey: ["project-files", projectId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => del({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["e2e-tests", projectId] }),
  });

  return (
    <section className="rounded-2xl border border-border/60 bg-card/40 p-4">
      <header className="mb-3 flex items-center gap-2">
        <FlaskConical className="h-4 w-4 text-primary" />
        <h2 className="font-display text-sm font-semibold">E2E tests · Playwright</h2>
        <Badge variant="outline" className="ml-auto text-[10px]">user-story → spec</Badge>
      </header>

      <div className="mb-4 grid gap-2 rounded-xl border border-border/60 bg-background/50 p-3">
        <Input placeholder="Feature name (e.g. Checkout flow)" value={name} onChange={(e) => setName(e.target.value)} />
        <Textarea
          rows={4}
          placeholder={'User story — e.g. "As a returning customer, I can add 2 items to the cart, apply a 10% promo, and complete checkout with a saved card."'}
          value={story}
          onChange={(e) => setStory(e.target.value)}
        />
        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <span>Writes <code className="font-mono">tests/e2e/&lt;slug&gt;.spec.ts</code> into project files.</span>
          <Button size="sm" onClick={() => create.mutate()} disabled={create.isPending || name.length < 2 || story.length < 12}>
            {create.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Wand2 className="mr-1.5 h-3.5 w-3.5" />}
            Generate spec
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        {q.data?.length === 0 && <p className="text-xs text-muted-foreground">No E2E tests yet.</p>}
        {q.data?.map((t) => (
          <div key={t.id} className="rounded-lg border border-border/60 bg-background/40 p-3 text-xs">
            <div className="flex items-center gap-2">
              {t.status === "ready" ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> :
                t.status === "error" ? <XCircle className="h-3.5 w-3.5 text-destructive" /> :
                <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />}
              <span className="font-medium">{t.name}</span>
              <code className="ml-1 inline-flex items-center gap-1 rounded bg-muted/40 px-1.5 py-0.5 font-mono text-[10px]">
                <FileCode2 className="h-3 w-3" /> {t.spec_path}
              </code>
              {t.last_run_status && (
                <Badge variant={t.last_run_status === "passed" ? "default" : "destructive"} className="ml-1 text-[10px]">
                  {t.last_run_status}
                </Badge>
              )}
              <Button size="sm" variant="ghost" className="ml-auto h-7 text-destructive" onClick={() => remove.mutate(t.id)}>
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
            {t.error && <p className="mt-1 text-destructive">{t.error}</p>}
            <p className="mt-1 line-clamp-2 text-muted-foreground">{t.user_story}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
