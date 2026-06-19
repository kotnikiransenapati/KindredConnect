import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { listPublicTemplates, type TemplateRow } from "@/lib/templates.functions";
import { Input } from "@/components/ui/input";
import { Sparkles, Star, Users } from "lucide-react";

export const Route = createFileRoute("/marketplace")({
  head: () => ({ meta: [
    { title: "Template marketplace — Foundry" },
    { name: "description", content: "Browse community templates and start your next app in seconds." },
    { property: "og:title", content: "Foundry — Template Marketplace" },
    { property: "og:description", content: "Production-ready starter templates from the Foundry community." },
  ]}),
  component: MarketplacePage,
});

function Stars({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1,2,3,4,5].map((n) => (
        <Star key={n} className={`h-3 w-3 ${n <= Math.round(value) ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40"}`} />
      ))}
    </div>
  );
}

function MarketplacePage() {
  const [q, setQ] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const fetchList = useServerFn(listPublicTemplates);
  const listQ = useQuery({
    queryKey: ["public-templates", q, category],
    queryFn: () => fetchList({ data: { q: q || undefined, category: category ?? undefined } }),
  });

  const cats = Array.from(new Set((listQ.data?.templates ?? []).map((t) => t.category)));

  return (
    <div className="min-h-screen">
      <header className="border-b border-border/60 bg-background/60 backdrop-blur">
        <div className="mx-auto flex max-w-[1400px] items-center gap-3 px-6 py-3">
          <Link to="/" className="flex items-center gap-2">
            <div className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-brand text-brand-foreground">
              <Sparkles className="h-3.5 w-3.5" />
            </div>
            <span className="font-display font-semibold">Foundry</span>
          </Link>
          <span className="text-sm text-muted-foreground">/ Marketplace</span>
          <Link to="/auth" className="ml-auto text-sm text-muted-foreground hover:text-foreground">Sign in to fork →</Link>
        </div>
      </header>

      <main className="mx-auto max-w-[1400px] px-6 py-10">
        <h1 className="font-display text-4xl font-semibold tracking-tight">Template Marketplace</h1>
        <p className="mt-2 max-w-xl text-muted-foreground">
          Open-source, production-ready starters from the Foundry community. Fork in one click.
        </p>

        <div className="mt-6 flex flex-wrap items-center gap-2">
          <Input
            placeholder="Search templates…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="max-w-xs"
          />
          <button
            className={`rounded-full border px-3 py-1 text-xs ${!category ? "border-brand text-brand" : "border-border text-muted-foreground hover:text-foreground"}`}
            onClick={() => setCategory(null)}
          >All</button>
          {cats.map((c) => (
            <button
              key={c}
              className={`rounded-full border px-3 py-1 text-xs ${category === c ? "border-brand text-brand" : "border-border text-muted-foreground hover:text-foreground"}`}
              onClick={() => setCategory(c)}
            >{c}</button>
          ))}
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {listQ.isLoading
            ? Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-56 animate-pulse rounded-2xl border border-border/60 bg-card/40" />
              ))
            : (listQ.data?.templates ?? []).map((t: TemplateRow) => (
                <article key={t.id} className="group flex flex-col overflow-hidden rounded-2xl border border-border/60 bg-card/60 shadow-card backdrop-blur transition hover:border-brand/50">
                  <div className="aspect-[16/9] overflow-hidden bg-gradient-to-br from-brand/20 via-background to-background">
                    {t.thumbnail_url ? (
                      <img src={t.thumbnail_url} alt={t.name} className="h-full w-full object-cover transition group-hover:scale-105" />
                    ) : (
                      <div className="grid h-full w-full place-items-center text-3xl font-display text-muted-foreground/40">
                        {t.name.slice(0, 1)}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-1 flex-col gap-2 p-4">
                    <div className="flex items-center gap-2">
                      <h3 className="flex-1 truncate font-display text-lg font-semibold">{t.name}</h3>
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">{t.category}</span>
                    </div>
                    <p className="line-clamp-2 text-sm text-muted-foreground">{t.description}</p>
                    <div className="mt-auto flex items-center justify-between pt-2 text-xs text-muted-foreground">
                      <div className="flex items-center gap-2">
                        <Stars value={Number(t.avg_rating ?? 0)} />
                        <span>{Number(t.avg_rating ?? 0).toFixed(1)} · {t.rating_count ?? 0}</span>
                      </div>
                      <span className="inline-flex items-center gap-1">
                        <Users className="h-3 w-3" /> {t.use_count}
                      </span>
                    </div>
                    <Link
                      to="/app"
                      className="mt-1 inline-flex w-full items-center justify-center rounded-lg bg-gradient-brand px-3 py-1.5 text-xs font-semibold text-brand-foreground"
                    >
                      Fork in Foundry →
                    </Link>
                  </div>
                </article>
              ))}
        </div>

        {!listQ.isLoading && (listQ.data?.templates ?? []).length === 0 && (
          <div className="mt-10 rounded-2xl border border-border/60 bg-card/40 p-10 text-center text-muted-foreground">
            No templates yet. Be the first — open a project and click <span className="text-foreground">Publish as template</span>.
          </div>
        )}
      </main>
    </div>
  );
}
