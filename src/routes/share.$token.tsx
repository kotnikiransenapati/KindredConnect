import { createFileRoute, useParams } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getPublicProject } from "@/lib/versions.functions";
import { LivePreview } from "@/components/workspace/LivePreview";
import { Sparkles } from "lucide-react";

export const Route = createFileRoute("/share/$token")({
  head: () => ({ meta: [
    { title: "Shared project — Foundry" },
    { name: "description", content: "A live AI-built app shared via Foundry." },
  ]}),
  component: SharePage,
  errorComponent: ({ error }) => <div className="p-10 text-destructive">{error.message}</div>,
});

function SharePage() {
  const { token } = useParams({ from: "/share/$token" });
  const fetchPublic = useServerFn(getPublicProject);
  const { data, isLoading, error } = useQuery({
    queryKey: ["public-project", token],
    queryFn: () => fetchPublic({ data: { token } }),
  });

  return (
    <div className="min-h-screen">
      <header className="border-b border-border/60 bg-background/60 backdrop-blur">
        <div className="mx-auto flex max-w-[1400px] items-center gap-2 px-6 py-3">
          <div className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-brand text-brand-foreground">
            <Sparkles className="h-3.5 w-3.5" />
          </div>
          <span className="font-display font-semibold">Foundry</span>
          {data && <span className="ml-3 text-sm text-muted-foreground">/ {data.project.name}</span>}
          <a href="/" className="ml-auto text-sm text-muted-foreground hover:text-foreground">Build your own →</a>
        </div>
      </header>
      <main className="mx-auto max-w-[1400px] px-6 py-6">
        {isLoading ? (
          <div className="h-[60vh] animate-pulse rounded-2xl border border-border/60 bg-card/40" />
        ) : error ? (
          <div className="rounded-2xl border border-destructive/40 bg-destructive/5 p-6 text-destructive">
            {(error as Error).message}
          </div>
        ) : data ? (
          <LivePreview files={data.files} />
        ) : null}
      </main>
    </div>
  );
}
