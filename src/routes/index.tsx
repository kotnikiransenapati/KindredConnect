import { createFileRoute, Link } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { SiteHeader } from "@/components/site/SiteHeader";
import { SiteFooter } from "@/components/site/SiteFooter";
import { Button } from "@/components/ui/button";
import { ArrowRight, Sparkles, Code2, Boxes, Shield, Zap, GitBranch } from "lucide-react";

const HeroScene3D = lazy(() => import("@/components/landing/HeroScene3D"));
import { TemplatesShowcase } from "@/components/landing/TemplatesShowcase";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Foundry — Build apps by chatting with AI" },
      { name: "description", content: "Foundry turns prompts into production-ready web apps with live preview, version history, and one-click publish." },
      { property: "og:title", content: "Foundry — Build apps by chatting with AI" },
      { property: "og:description", content: "Turn prompts into shippable web apps with live preview, versioning, and publish." },
    ],
  }),
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen flex flex-col">
      <SiteHeader />
      <main className="flex-1">
        <Hero />
        <Logos />
        <Features />
        <HowItWorks />
        <CTA />
      </main>
      <SiteFooter />
    </div>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div className="absolute inset-0 bg-aurora opacity-60" aria-hidden />
      <div className="absolute inset-0 grid-bg opacity-40" aria-hidden />
      <div className="pointer-events-none absolute inset-0 h-[640px]" aria-hidden>
        <Suspense fallback={null}><HeroScene3D /></Suspense>
      </div>
      <div className="relative mx-auto max-w-5xl px-6 pb-24 pt-24 text-center md:pt-32">
        <div className="mx-auto mb-6 inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/60 px-3 py-1 text-xs text-muted-foreground backdrop-blur">
          <Sparkles className="h-3.5 w-3.5 text-brand" />
          Now in public beta — every account gets free AI credits
        </div>
        <h1 className="font-display text-5xl font-semibold leading-[1.05] tracking-tight md:text-7xl">
          Build real apps <br />
          <span className="text-gradient-brand">by talking to one.</span>
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-balance text-lg text-muted-foreground">
          Foundry is an AI software studio. Describe what you want, watch it build, edit in plain English,
          and ship to a live URL — no boilerplate, no setup.
        </p>
        <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Button size="lg" asChild className="bg-gradient-brand text-brand-foreground shadow-elegant hover:opacity-95">
            <Link to="/auth">
              Start building free <ArrowRight className="ml-1 h-4 w-4" />
            </Link>
          </Button>
          <Button size="lg" variant="outline" asChild>
            <Link to="/pricing">See pricing</Link>
          </Button>
        </div>

        <div className="relative mx-auto mt-16 max-w-4xl">
          <div className="rounded-2xl border border-border/60 bg-card/70 p-2 shadow-elegant backdrop-blur">
            <div className="flex items-center gap-1.5 border-b border-border/60 px-3 py-2">
              <span className="h-2.5 w-2.5 rounded-full bg-destructive/70" />
              <span className="h-2.5 w-2.5 rounded-full bg-brand/70" />
              <span className="h-2.5 w-2.5 rounded-full bg-aurora-3/70" />
              <span className="ml-3 text-xs text-muted-foreground">foundry.app / new</span>
            </div>
            <div className="grid gap-0 md:grid-cols-2">
              <div className="border-r border-border/60 p-6 text-left">
                <div className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Prompt</div>
                <p className="mt-3 text-sm leading-relaxed">
                  A booking page for my yoga studio with a calendar, Stripe checkout for class packs,
                  and an admin view for instructors. Warm minimal design.
                </p>
                <div className="mt-6 font-mono text-xs uppercase tracking-wider text-muted-foreground">Foundry</div>
                <p className="mt-3 text-sm text-muted-foreground">
                  Scaffolding routes, designing tokens, wiring Stripe… ready in 38s.
                </p>
              </div>
              <div className="p-6 text-left">
                <div className="rounded-lg border border-border/60 bg-background/40 p-4">
                  <div className="text-xs text-muted-foreground">Live preview</div>
                  <div className="mt-3 font-display text-2xl">Sunday Flow</div>
                  <div className="text-sm text-muted-foreground">Book your next class</div>
                  <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
                    {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                      <div key={d} className="rounded-md border border-border/60 p-2 text-center">{d}</div>
                    ))}
                  </div>
                  <button className="mt-4 w-full rounded-md bg-gradient-brand py-2 text-sm font-medium text-brand-foreground">
                    Reserve a spot
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Logos() {
  const items = ["Northwind", "Lumen", "Atlas", "Helios", "Quill", "Vector"];
  return (
    <section className="border-y border-border/40 bg-background/40 py-10">
      <div className="mx-auto max-w-6xl px-6">
        <p className="text-center text-xs uppercase tracking-[0.2em] text-muted-foreground">
          Trusted by builders shipping faster
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-x-10 gap-y-4 opacity-70">
          {items.map((n) => (
            <div key={n} className="font-display text-lg tracking-tight">{n}</div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Features() {
  const feats = [
    { icon: Sparkles, title: "Conversational editing", body: "Describe a change in plain English. Foundry rewrites the right files and shows you a diff." },
    { icon: Code2, title: "Real code, no lock-in", body: "Production TanStack + React. Export, fork, and self-host whenever you want." },
    { icon: Boxes, title: "Live sandbox preview", body: "See your app run instantly in a browser sandbox — desktop and mobile viewports." },
    { icon: GitBranch, title: "Versioned by default", body: "Every edit is a checkpoint. Branch, compare, revert — never lose work." },
    { icon: Shield, title: "Secure by design", body: "Row-level security, validated inputs, scoped tokens. Built on a hardened backend." },
    { icon: Zap, title: "Instant publish", body: "One click and your app is live on a shareable URL with HTTPS and a CDN." },
  ];
  return (
    <section id="features" className="mx-auto max-w-7xl px-6 py-24">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="font-display text-4xl font-semibold tracking-tight md:text-5xl">
          A studio, not a code generator.
        </h2>
        <p className="mt-4 text-muted-foreground">
          Foundry is the whole loop: ideation, build, preview, ship, iterate.
        </p>
      </div>
      <div className="mt-14 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {feats.map(({ icon: Icon, title, body }) => (
          <div key={title} className="group rounded-2xl border border-border/60 bg-card/60 p-6 shadow-card backdrop-blur transition-colors hover:border-brand/40">
            <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-brand text-brand-foreground">
              <Icon className="h-5 w-5" />
            </div>
            <h3 className="font-display text-xl">{title}</h3>
            <p className="mt-2 text-sm text-muted-foreground">{body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function HowItWorks() {
  const steps = [
    { n: "01", t: "Describe it", d: "Tell Foundry what you want — a tool, a site, a small SaaS. Be vague, we'll ask." },
    { n: "02", t: "Watch it build", d: "Files, data model, auth, UI — generated and explained step by step." },
    { n: "03", t: "Refine in chat", d: "Move things, change colors, add features. No context switching." },
    { n: "04", t: "Publish", d: "Push to a live URL or export the codebase. It's yours." },
  ];
  return (
    <section id="how" className="border-t border-border/60 bg-background/40 py-24">
      <div className="mx-auto max-w-7xl px-6">
        <h2 className="font-display text-4xl font-semibold tracking-tight md:text-5xl">How it works</h2>
        <div className="mt-12 grid gap-px overflow-hidden rounded-2xl border border-border/60 bg-border/60 md:grid-cols-4">
          {steps.map((s) => (
            <div key={s.n} className="bg-card/80 p-6">
              <div className="font-mono text-xs text-brand">{s.n}</div>
              <div className="mt-3 font-display text-xl">{s.t}</div>
              <p className="mt-2 text-sm text-muted-foreground">{s.d}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function CTA() {
  return (
    <section className="mx-auto max-w-5xl px-6 py-24 text-center">
      <div className="relative overflow-hidden rounded-3xl border border-border/60 bg-card/60 p-12 shadow-elegant">
        <div className="absolute inset-0 bg-aurora opacity-50" aria-hidden />
        <div className="relative">
          <h2 className="font-display text-4xl font-semibold md:text-5xl">Your next app is one prompt away.</h2>
          <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
            Free to start. No credit card. Ship something real today.
          </p>
          <Button size="lg" asChild className="mt-8 bg-gradient-brand text-brand-foreground hover:opacity-95">
            <Link to="/auth">Start building free <ArrowRight className="ml-1 h-4 w-4" /></Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
