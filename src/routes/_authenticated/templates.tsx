import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { SiteHeader } from "@/components/site/SiteHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { listTemplates, createProjectFromTemplate, type TemplateRow } from "@/lib/templates.functions";
import { Sparkles, ArrowRight, Loader2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/templates")({
  head: () => ({ meta: [{ title: "Templates — Foundry" }] }),
  component: TemplatesPage,
});

function TemplatesPage() {
  const navigate = useNavigate();
  const fetchTpls = useServerFn(listTemplates);
  const fork = useServerFn(createProjectFromTemplate);
  const [picked, setPicked] = useState<TemplateRow | null>(null);
  const [name, setName] = useState("");

  const tplsQ = useQuery({ queryKey: ["templates"], queryFn: () => fetchTpls() });

  const forkMut = useMutation({
    mutationFn: (vars: { templateId: string; name: string }) => fork({ data: vars }),
    onSuccess: (r) => {
      toast.success("Project created");
      navigate({ to: "/app/$projectId", params: { projectId: r.project.id } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const templates = tplsQ.data?.templates ?? [];

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-7xl px-6 py-12">
        <div className="mb-10">
          <h1 className="font-display text-4xl font-semibold tracking-tight">Start from a template</h1>
          <p className="mt-1 text-sm text-muted-foreground">Pre-built starters — fork one and Foundry handles the rest.</p>
        </div>

        {tplsQ.isLoading ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-52 animate-pulse rounded-2xl border border-border/60 bg-card/40" />
            ))}
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {templates.map((t) => (
              <button
                key={t.id}
                onClick={() => { setPicked(t); setName(t.name); }}
                className="group relative rounded-2xl border border-border/60 bg-card/70 p-6 text-left shadow-card backdrop-blur transition-colors hover:border-brand/40"
              >
                {t.is_featured && (
                  <Badge className="absolute right-4 top-4 bg-gradient-brand text-brand-foreground">Featured</Badge>
                )}
                <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-brand/20 text-brand">
                  <Sparkles className="h-5 w-5" />
                </div>
                <div className="mt-4 font-display text-xl">{t.name}</div>
                <p className="mt-2 line-clamp-3 min-h-[3.5rem] text-sm text-muted-foreground">{t.description}</p>
                <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
                  <span className="capitalize">{t.category}</span>
                  <span className="inline-flex items-center gap-1 text-brand">
                    Use template <ArrowRight className="h-3 w-3" />
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </main>

      <Dialog open={!!picked} onOpenChange={(o) => !o && setPicked(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle className="font-display text-2xl">Name your project</DialogTitle></DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!picked || !name.trim()) return;
              forkMut.mutate({ templateId: picked.id, name: name.trim() });
            }}
            className="space-y-4"
          >
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Project name</label>
              <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required />
            </div>
            <Button type="submit" disabled={forkMut.isPending} className="w-full bg-gradient-brand text-brand-foreground hover:opacity-95">
              {forkMut.isPending ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Creating…</>) : "Create from template"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
