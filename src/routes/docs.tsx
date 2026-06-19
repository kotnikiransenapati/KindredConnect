import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteHeader } from "@/components/site/SiteHeader";
import {
  BookOpen, MessageSquare, Eye, Rocket, Users, Shield, Database,
  Sparkles, Code2, Smartphone, Store, Plug,
} from "lucide-react";

export const Route = createFileRoute("/docs")({
  head: () => ({
    meta: [
      { title: "Docs — Foundry AI Builder" },
      { name: "description", content: "Guides for building, deploying, and collaborating on AI-built web apps with Foundry." },
      { property: "og:title", content: "Foundry Documentation" },
      { property: "og:description", content: "Everything you need to ship production apps with Foundry's autonomous AI agent." },
    ],
  }),
  component: DocsPage,
});

type Section = {
  id: string;
  title: string;
  icon: typeof BookOpen;
  body: React.ReactNode;
};

const SECTIONS: Section[] = [
  {
    id: "getting-started",
    title: "Getting started",
    icon: Sparkles,
    body: (
      <>
        <p>Sign in, click <strong>New project</strong>, then describe what you want in the chat panel. The agent will plan, write files, lint them, and self-correct until the preview builds.</p>
        <p>Every project starts empty. Your first prompt should describe the whole app — e.g. <em>"A pomodoro timer with light/dark mode, keyboard shortcuts, and a session history."</em></p>
      </>
    ),
  },
  {
    id: "chatting-with-the-agent",
    title: "Chatting with the agent",
    icon: MessageSquare,
    body: (
      <>
        <p>The agent runs a multi-step loop (up to 50 tool calls per turn): <code>plan → read → search → write → lint → fix</code>. You can watch each step as it streams.</p>
        <ul className="list-disc pl-5">
          <li><strong>Diffs</strong>: every file write shows a unified diff with a lint badge.</li>
          <li><strong>Images</strong>: drop screenshots into the composer — the agent reads them.</li>
          <li><strong>Stop early</strong>: cancel mid-stream if it goes the wrong direction.</li>
        </ul>
      </>
    ),
  },
  {
    id: "preview-and-code",
    title: "Preview & code",
    icon: Eye,
    body: (
      <>
        <p>The <strong>Preview</strong> tab renders the current files in an in-browser Sandpack runtime. The <strong>Code</strong> tab shows the file tree, editor, and per-file version history with restore.</p>
        <p>Every successful write is checkpointed — roll back to any previous version with one click.</p>
      </>
    ),
  },
  {
    id: "knowledge-and-rag",
    title: "Knowledge & RAG",
    icon: BookOpen,
    body: (
      <>
        <p>Open the <strong>Knowledge</strong> panel to add URLs, notes, or files. Foundry chunks and embeds them with pgvector and retrieves the top results on every chat turn.</p>
        <p>Project files you write are auto-embedded in the background, so the agent always knows the current shape of your codebase.</p>
        <p>The retrieval pipeline pulls the top 20 vector hits, then re-ranks with a diversity pass so a single file can't dominate the context window.</p>
      </>
    ),
  },
  {
    id: "agent-memory",
    title: "Long-term agent memory",
    icon: Sparkles,
    body: (
      <>
        <p>Click <strong>Agent memory</strong> in any project to set free-form notes that follow you across <em>every</em> project — preferred stack, tone of voice, accessibility rules, etc.</p>
        <p>These notes are injected into the system prompt on every chat turn.</p>
      </>
    ),
  },
  {
    id: "deployments",
    title: "Deployments",
    icon: Rocket,
    body: (
      <>
        <p>Click <strong>Deploy</strong> to publish your current build to <code>/p/your-slug</code>. Every deploy gets a numbered version available at <code>/p/your-slug/v3</code>, etc.</p>
        <p>Rollback is instant — pick any prior version and click restore. Deploys are rate-limited to 3/min and 30/day per user.</p>
      </>
    ),
  },
  {
    id: "collaboration",
    title: "Collaboration",
    icon: Users,
    body: (
      <>
        <p>Invite teammates with <strong>viewer</strong>, <strong>editor</strong>, or <strong>owner</strong> roles. All access is enforced by row-level security.</p>
        <ul className="list-disc pl-5">
          <li><strong>Presence</strong>: live avatars show who's looking at the same project.</li>
          <li><strong>Comments</strong>: thread discussions on the project or on a specific file, with @mention notifications.</li>
          <li><strong>Activity</strong>: every write, deploy, and invite is logged.</li>
        </ul>
      </>
    ),
  },
  {
    id: "marketplace",
    title: "Template marketplace",
    icon: Store,
    body: (
      <>
        <p>Publish any project as a public template from the workspace header. Other users can fork it from <Link to="/marketplace" className="text-primary underline-offset-4 hover:underline">/marketplace</Link> and rate it 1–5 stars.</p>
        <p>Ratings are averaged by a database trigger so listings stay fast even under load.</p>
      </>
    ),
  },
  {
    id: "integrations",
    title: "Integrations catalog",
    icon: Plug,
    body: (
      <>
        <p>The <strong>Integrations</strong> panel installs pre-wired Stripe Checkout, Resend email, OpenAI chat, Google Maps, and PostHog snippets into your project with one click.</p>
        <p>The agent can also call <code>installIntegration</code> autonomously when you ask for "Stripe payments" or "send email when X happens".</p>
      </>
    ),
  },
  {
    id: "mobile",
    title: "Mobile (iOS / Android)",
    icon: Smartphone,
    body: (
      <>
        <p>Ask the agent to "make this a mobile app" and it will scaffold a Capacitor wrapper plus <code>/docs/MOBILE.md</code> with the exact <code>npx cap add ios</code> / <code>android</code> steps.</p>
        <p>Mobile-first rules (44px tap targets, safe-area insets, no hover-only states) are baked into the system prompt.</p>
      </>
    ),
  },
  {
    id: "security",
    title: "Security model",
    icon: Shield,
    body: (
      <>
        <p>Every public table has explicit <code>GRANT</code>s and RLS policies scoped to <code>auth.uid()</code> or <code>has_project_role</code>. CI runs an RLS audit that fails the build on any new <code>TO anon</code> policy without an explicit security-review marker.</p>
        <p>Mutating endpoints (chat, deploy, invite, ingest, publish-template) are rate-limited per user via a security-definer RPC.</p>
      </>
    ),
  },
  {
    id: "data-model",
    title: "Data model",
    icon: Database,
    body: (
      <>
        <p>Server logic uses <code>createServerFn</code> + <code>requireSupabaseAuth</code>. The admin client is only loaded behind explicit role checks. AI calls go through the Lovable AI Gateway — <code>LOVABLE_API_KEY</code> never reaches the browser.</p>
      </>
    ),
  },
];

function DocsPage() {
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-6 py-12">
        <header className="mb-10">
          <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/40 px-3 py-1 text-xs text-muted-foreground">
            <Code2 className="h-3.5 w-3.5" /> Foundry documentation
          </div>
          <h1 className="mt-4 font-display text-4xl font-semibold tracking-tight">Build production apps with an autonomous agent</h1>
          <p className="mt-2 max-w-2xl text-muted-foreground">
            Everything you need to plan, build, deploy, and collaborate on Foundry projects.
          </p>
        </header>

        <div className="grid gap-8 lg:grid-cols-[220px_1fr]">
          <aside className="lg:sticky lg:top-24 lg:self-start">
            <nav className="space-y-1 text-sm">
              {SECTIONS.map((s) => (
                <a
                  key={s.id}
                  href={`#${s.id}`}
                  className="block rounded-md px-2 py-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  {s.title}
                </a>
              ))}
            </nav>
          </aside>

          <article className="space-y-10">
            {SECTIONS.map((s) => {
              const Icon = s.icon;
              return (
                <section key={s.id} id={s.id} className="scroll-mt-24">
                  <h2 className="flex items-center gap-2 font-display text-2xl font-semibold tracking-tight">
                    <span className="grid h-9 w-9 place-items-center rounded-lg bg-primary/10 text-primary">
                      <Icon className="h-4 w-4" />
                    </span>
                    {s.title}
                  </h2>
                  <div className="prose prose-invert mt-3 max-w-none text-sm leading-relaxed text-muted-foreground [&_strong]:text-foreground [&_code]:rounded [&_code]:bg-muted [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-xs [&_code]:text-foreground space-y-3">
                    {s.body}
                  </div>
                </section>
              );
            })}
          </article>
        </div>
      </main>
    </div>
  );
}
