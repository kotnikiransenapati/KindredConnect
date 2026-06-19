import { createFileRoute, useParams } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getPublicDeployment } from "@/lib/deployments.functions";
import { LivePreview } from "@/components/workspace/LivePreview";
import { Sparkles } from "lucide-react";

export const Route = createFileRoute("/p/$slug/$version")({
  head: () => ({ meta: [
    { title: "Versioned deployment — Foundry" },
    { name: "description", content: "A specific version of a Foundry-built app." },
  ]}),
  component: VersionedDeploy,
  errorComponent: ({ error }) => <div className="p-10 text-destructive">{error.message}</div>,
});

function VersionedDeploy() {
  const { slug, version } = useParams({ from: "/p/$slug/$version" });
  const versionNum = Number.parseInt(version, 10);
  const fetchDep = useServerFn(getPublicDeployment);
  const { data, isLoading, error } = useQuery({
    queryKey: ["deploy", slug, versionNum],
    queryFn: () => fetchDep({ data: { slug, version: versionNum } }),
    enabled: Number.isFinite(versionNum),
  });

  return (
    <div className="min-h-screen">
      <header className="border-b border-border/60 bg-background/60 backdrop-blur">
        <div className="mx-auto flex max-w-[1400px] items-center gap-2 px-6 py-3">
          <div className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-brand text-brand-foreground">
            <Sparkles className="h-3.5 w-3.5" />
          </div>
          <span className="font-display font-semibold">Foundry</span>
          {data && (
            <span className="ml-3 text-sm text-muted-foreground">
              / {data.project.name} <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-[10px]">v{data.deployment.version_num}</span>
            </span>
          )}
          <a href={`/p/${slug}`} className="ml-auto text-sm text-muted-foreground hover:text-foreground">Latest →</a>
        </div>
      </header>
      <main className="mx-auto max-w-[1400px] px-6 py-6">
        {!Number.isFinite(versionNum) ? (
          <div className="rounded-2xl border border-destructive/40 bg-destructive/5 p-6 text-destructive">
            Invalid version number.
          </div>
        ) : isLoading ? (
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
