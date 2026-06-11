import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getProject } from "@/lib/projects.functions";
import { SiteHeader } from "@/components/site/SiteHeader";
import { ArrowLeft, Sparkles } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/$projectId")({
  head: () => ({ meta: [{ title: "Project — Foundry" }] }),
  component: ProjectWorkspace,
});

function ProjectWorkspace() {
  const { projectId } = useParams({ from: "/_authenticated/app/$projectId" });
  const fetchProject = useServerFn(getProject);
  const { data, isLoading, error } = useQuery({
    queryKey: ["project", projectId],
    queryFn: () => fetchProject({ data: { id: projectId } }),
  });

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-7xl px-6 py-10">
        <Link to="/app" className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> All projects
        </Link>

        {isLoading ? (
          <div className="h-64 animate-pulse rounded-2xl border border-border/60 bg-card/40" />
        ) : error ? (
          <div className="rounded-2xl border border-destructive/40 bg-destructive/5 p-6 text-destructive">
            {(error as Error).message}
          </div>
        ) : data ? (
          <>
            <div className="mb-8 flex items-center justify-between">
              <div>
                <h1 className="font-display text-4xl font-semibold tracking-tight">{data.name}</h1>
                {data.description && <p className="mt-1 text-muted-foreground">{data.description}</p>}
              </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
              <aside className="rounded-2xl border border-border/60 bg-card/70 p-5 shadow-card backdrop-blur">
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Chat</div>
                <div className="mt-4 space-y-3">
                  {data.initial_prompt && (
                    <div className="rounded-xl border border-border/60 bg-background/60 p-3 text-sm">
                      <div className="mb-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">You</div>
                      {data.initial_prompt}
                    </div>
                  )}
                  <div className="rounded-xl border border-brand/30 bg-brand/5 p-3 text-sm">
                    <div className="mb-1 flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider text-brand">
                      <Sparkles className="h-3 w-3" /> Foundry
                    </div>
                    The AI builder is coming online next. In the meantime, this is your project workspace —
                    file tree, live preview, and chat will land here in the next phase.
                  </div>
                </div>
                <div className="mt-4 rounded-xl border border-dashed border-border/80 p-3 text-center text-xs text-muted-foreground">
                  Chat input enabled in Phase 2.
                </div>
              </aside>

              <section className="rounded-2xl border border-border/60 bg-card/70 shadow-card backdrop-blur">
                <div className="flex items-center gap-1.5 border-b border-border/60 px-4 py-3">
                  <span className="h-2.5 w-2.5 rounded-full bg-destructive/70" />
                  <span className="h-2.5 w-2.5 rounded-full bg-brand/70" />
                  <span className="h-2.5 w-2.5 rounded-full bg-aurora-3/70" />
                  <span className="ml-3 text-xs text-muted-foreground">{data.slug}.foundry.app</span>
                </div>
                <div className="grid min-h-[420px] place-items-center p-10 text-center">
                  <div>
                    <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-gradient-brand text-brand-foreground shadow-elegant">
                      <Sparkles className="h-6 w-6" />
                    </div>
                    <h2 className="mt-6 font-display text-2xl">Live preview will render here</h2>
                    <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
                      Sandbox bundling, file storage, and the chat-to-code pipeline land in Phase 2.
                    </p>
                  </div>
                </div>
              </section>
            </div>
          </>
        ) : null}
      </main>
    </div>
  );
}
