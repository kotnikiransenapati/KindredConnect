// Curated catalog of pre-wired integration snippets the agent (or user) can
// install into a project. Client-safe — no server-only imports.

export type IntegrationFile = { path: string; content: string };
export type Integration = {
  slug: string;
  name: string;
  category: "payments" | "email" | "ai" | "maps" | "analytics" | "auth";
  description: string;
  envVars: string[];
  files: IntegrationFile[];
};

export const INTEGRATIONS: Integration[] = [
  {
    slug: "stripe-checkout",
    name: "Stripe Checkout",
    category: "payments",
    description: "Server function that creates a Stripe Checkout Session and a thin client helper to redirect.",
    envVars: ["STRIPE_SECRET_KEY"],
    files: [
      {
        path: "/src/lib/stripe.functions.ts",
        content: `import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const createStripeCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      priceId: z.string().min(1),
      successUrl: z.string().url(),
      cancelUrl: z.string().url(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error("Missing STRIPE_SECRET_KEY");
    const body = new URLSearchParams({
      mode: "subscription",
      "line_items[0][price]": data.priceId,
      "line_items[0][quantity]": "1",
      success_url: data.successUrl,
      cancel_url: data.cancelUrl,
      client_reference_id: context.userId,
    });
    const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: { Authorization: \`Bearer \${key}\`, "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!res.ok) throw new Error(\`Stripe error: \${await res.text()}\`);
    const json = (await res.json()) as { id: string; url: string };
    return { sessionId: json.id, url: json.url };
  });
`,
      },
    ],
  },
  {
    slug: "resend-email",
    name: "Resend Transactional Email",
    category: "email",
    description: "Send transactional email via Resend's REST API from a server function.",
    envVars: ["RESEND_API_KEY"],
    files: [
      {
        path: "/src/lib/email.functions.ts",
        content: `import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const sendEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      to: z.string().email(),
      subject: z.string().min(1).max(200),
      html: z.string().min(1).max(100_000),
      from: z.string().email().optional(),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    const key = process.env.RESEND_API_KEY;
    if (!key) throw new Error("Missing RESEND_API_KEY");
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: \`Bearer \${key}\`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: data.from ?? "noreply@example.com",
        to: data.to, subject: data.subject, html: data.html,
      }),
    });
    if (!res.ok) throw new Error(\`Resend error: \${await res.text()}\`);
    return (await res.json()) as { id: string };
  });
`,
      },
    ],
  },
  {
    slug: "openai-chat",
    name: "OpenAI Chat Completions",
    category: "ai",
    description: "Minimal OpenAI chat completion server function (use this if Lovable AI Gateway is not enough).",
    envVars: ["OPENAI_API_KEY"],
    files: [
      {
        path: "/src/lib/openai.functions.ts",
        content: `import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const openaiComplete = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      model: z.string().default("gpt-4o-mini"),
      prompt: z.string().min(1).max(8000),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    const key = process.env.OPENAI_API_KEY;
    if (!key) throw new Error("Missing OPENAI_API_KEY");
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: \`Bearer \${key}\`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: data.model,
        messages: [{ role: "user", content: data.prompt }],
      }),
    });
    if (!res.ok) throw new Error(\`OpenAI error: \${await res.text()}\`);
    const json = (await res.json()) as { choices: Array<{ message: { content: string } }> };
    return { content: json.choices[0]?.message?.content ?? "" };
  });
`,
      },
    ],
  },
  {
    slug: "google-maps",
    name: "Google Maps embed",
    category: "maps",
    description: "Drop-in React component that renders a Google Maps embed iframe.",
    envVars: ["VITE_GOOGLE_MAPS_API_KEY"],
    files: [
      {
        path: "/src/components/integrations/MapEmbed.tsx",
        content: `type MapEmbedProps = { query: string; zoom?: number; height?: number };

export function MapEmbed({ query, zoom = 13, height = 360 }: MapEmbedProps) {
  const key = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;
  if (!key) return <div className="rounded-xl border p-4 text-sm text-muted-foreground">Set VITE_GOOGLE_MAPS_API_KEY to enable the map.</div>;
  const src = \`https://www.google.com/maps/embed/v1/place?key=\${key}&q=\${encodeURIComponent(query)}&zoom=\${zoom}\`;
  return (
    <iframe title="Map" src={src} loading="lazy" referrerPolicy="no-referrer-when-downgrade"
      className="w-full rounded-xl border border-border/60" style={{ height }} />
  );
}
`,
      },
    ],
  },
  {
    slug: "posthog-analytics",
    name: "PostHog Analytics",
    category: "analytics",
    description: "Lightweight PostHog initializer + tracking helper, browser-only.",
    envVars: ["VITE_POSTHOG_KEY", "VITE_POSTHOG_HOST"],
    files: [
      {
        path: "/src/lib/analytics.ts",
        content: `// Minimal PostHog wrapper — loads on demand, browser-only.
let loaded = false;
type PH = { capture: (e: string, p?: Record<string, unknown>) => void; identify: (id: string, p?: Record<string, unknown>) => void };
declare global { interface Window { posthog?: PH } }

export async function initAnalytics() {
  if (loaded || typeof window === "undefined") return;
  const key = import.meta.env.VITE_POSTHOG_KEY as string | undefined;
  const host = (import.meta.env.VITE_POSTHOG_HOST as string | undefined) ?? "https://us.i.posthog.com";
  if (!key) return;
  const ph = await import("posthog-js");
  ph.default.init(key, { api_host: host, capture_pageview: true });
  window.posthog = ph.default as unknown as PH;
  loaded = true;
}

export function track(event: string, props?: Record<string, unknown>) {
  window.posthog?.capture(event, props);
}
`,
      },
    ],
  },
];

export function getIntegration(slug: string): Integration | undefined {
  return INTEGRATIONS.find((i) => i.slug === slug);
}
