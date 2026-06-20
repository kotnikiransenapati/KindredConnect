// Featured templates strip for the landing page. Fetches public templates
// via the publishable-key server fn (no auth required) and renders cards.
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Star, Sparkles } from "lucide-react";
import { listPublicTemplates } from "@/lib/templates.functions";

export function TemplatesShowcase() {
  const fetchTemplates = useServerFn(listPublicTemplates);
  const q = useQuery({
    queryKey: ["public-templates-featured"],
    queryFn: () => fetchTemplates({ data: {} }),
    staleTime: 5 * 60 * 1000,
  });

  const items = (q.data?.templates ?? []).slice(0, 6);
  if (q.isLoading || items.length === 0) return null;

  return (
    <section className="relative border-t border-border/40 bg-card/30">
      <div className="mx-auto max-w-6xl px-6 py-20">
        <div className="flex items-end justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/60 px-3 py-1 text-xs text-muted-foreground">
              <Sparkles className="h-3 w-3 text-brand" /> Templates gallery
            </div>
            <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight md:text-4xl">
              Start from a battle-tested template
            </h2>
          </div>
          <Link to="/marketplace" className="hidden items-center gap-1 text-sm text-muted-foreground hover:text-foreground md:inline-flex">
            Browse all <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((t) => (
            <Link
              key={t.id}
              to="/marketplace"
              className="group relative overflow-hidden rounded-2xl border border-border/60 bg-card/60 p-5 shadow-card transition hover:-translate-y-0.5 hover:border-brand/50 hover:shadow-elegant"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">{t.category ?? "App"}</div>
                  <div className="mt-1 truncate font-display text-lg">{t.name}</div>
                </div>
                {(t.avg_rating ?? 0) > 0 && (
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border/60 bg-background/60 px-2 py-0.5 text-xs">
                    <Star className="h-3 w-3 fill-brand text-brand" />
                    {(t.avg_rating ?? 0).toFixed(1)}
                  </span>
                )}
              </div>
              <p className="mt-3 line-clamp-3 text-sm text-muted-foreground">{t.description ?? "—"}</p>
              <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
                <span>{t.use_count?.toLocaleString() ?? 0} builds</span>
                <span className="text-brand opacity-0 transition group-hover:opacity-100">Use template →</span>
              </div>
              <div className="pointer-events-none absolute -inset-px rounded-2xl opacity-0 transition group-hover:opacity-100" style={{ background: "linear-gradient(135deg, color-mix(in oklab, var(--aurora-1) 12%, transparent), color-mix(in oklab, var(--aurora-2) 12%, transparent))" }} />
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
