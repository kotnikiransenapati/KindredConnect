import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteHeader } from "@/components/site/SiteHeader";
import { SiteFooter } from "@/components/site/SiteFooter";
import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";

export const Route = createFileRoute("/pricing")({
  head: () => ({
    meta: [
      { title: "Pricing — Foundry" },
      { name: "description", content: "Free to start. Upgrade for more AI credits, private projects, and team features." },
      { property: "og:title", content: "Pricing — Foundry" },
      { property: "og:description", content: "Simple, usage-based pricing for AI app building." },
    ],
  }),
  component: Pricing,
});

const tiers = [
  {
    name: "Hobby",
    price: "Free",
    blurb: "Perfect for trying Foundry and side projects.",
    features: ["100 AI messages / month", "Unlimited public projects", "Live preview", "Community support"],
    cta: "Get started",
    highlighted: false,
  },
  {
    name: "Pro",
    price: "$24",
    sub: "/ month",
    blurb: "For makers shipping real products.",
    features: ["3,000 AI messages / month", "Unlimited private projects", "Custom domains", "Version history", "Priority support"],
    cta: "Start free trial",
    highlighted: true,
  },
  {
    name: "Team",
    price: "$79",
    sub: "/ seat / month",
    blurb: "For teams collaborating on apps.",
    features: ["Everything in Pro", "Shared workspaces", "Roles & permissions", "Audit log", "SSO"],
    cta: "Contact sales",
    highlighted: false,
  },
];

function Pricing() {
  return (
    <div className="min-h-screen flex flex-col">
      <SiteHeader />
      <main className="flex-1">
        <section className="relative">
          <div className="absolute inset-0 bg-aurora opacity-40" aria-hidden />
          <div className="relative mx-auto max-w-3xl px-6 pb-12 pt-24 text-center">
            <h1 className="font-display text-5xl font-semibold tracking-tight md:text-6xl">
              Pricing that scales <span className="text-gradient-brand">with you.</span>
            </h1>
            <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
              Start free. Upgrade when you outgrow it.
            </p>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-6 pb-24">
          <div className="grid gap-6 md:grid-cols-3">
            {tiers.map((t) => (
              <div
                key={t.name}
                className={`relative rounded-2xl border bg-card/70 p-8 shadow-card backdrop-blur ${
                  t.highlighted ? "border-brand/60 ring-1 ring-brand/40" : "border-border/60"
                }`}
              >
                {t.highlighted && (
                  <div className="absolute -top-3 left-8 rounded-full bg-gradient-brand px-3 py-1 text-xs font-medium text-brand-foreground">
                    Most popular
                  </div>
                )}
                <div className="font-display text-2xl">{t.name}</div>
                <p className="mt-1 text-sm text-muted-foreground">{t.blurb}</p>
                <div className="mt-6 flex items-baseline gap-1">
                  <span className="font-display text-5xl font-semibold">{t.price}</span>
                  {t.sub && <span className="text-sm text-muted-foreground">{t.sub}</span>}
                </div>
                <Button asChild className={`mt-6 w-full ${t.highlighted ? "bg-gradient-brand text-brand-foreground" : ""}`} variant={t.highlighted ? "default" : "outline"}>
                  <Link to="/auth">{t.cta}</Link>
                </Button>
                <ul className="mt-8 space-y-3 text-sm">
                  {t.features.map((f) => (
                    <li key={f} className="flex items-start gap-2">
                      <Check className="mt-0.5 h-4 w-4 text-brand" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
