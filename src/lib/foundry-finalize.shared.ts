// Phase G5/G6/G7 — deterministic synthesizers for monetization, onboarding,
// and final-polish health reports. Pure functions; no IO.

export type PlanInterval = "month" | "year" | "one_time";

export interface PlanTemplate {
  code: string;
  name: string;
  priceCents: number;
  currency: string;
  interval: PlanInterval;
  features: string[];
  quotas: Record<string, number>;
}

export const DEFAULT_PLAN_TEMPLATES: PlanTemplate[] = [
  {
    code: "free",
    name: "Free",
    priceCents: 0,
    currency: "usd",
    interval: "month",
    features: ["Community support", "Single workspace", "Up to 3 projects"],
    quotas: { projects: 3, seats: 1, ai_messages_per_month: 100, storage_mb: 500 },
  },
  {
    code: "pro",
    name: "Pro",
    priceCents: 2900,
    currency: "usd",
    interval: "month",
    features: ["Priority support", "Unlimited collaborators", "Custom domains", "Advanced analytics"],
    quotas: { projects: 50, seats: 10, ai_messages_per_month: 5000, storage_mb: 25000 },
  },
  {
    code: "scale",
    name: "Scale",
    priceCents: 9900,
    currency: "usd",
    interval: "month",
    features: ["SAML SSO", "Audit log streaming", "Compliance packs", "Dedicated success manager"],
    quotas: { projects: 500, seats: 100, ai_messages_per_month: 50000, storage_mb: 250000 },
  },
];

export interface JourneyStep {
  id: string;
  title: string;
  description: string;
  cta: string;
  surface: "modal" | "tooltip" | "inline" | "page";
  successEvent: string;
}

export interface JourneyTemplate {
  slug: string;
  name: string;
  audience: string;
  steps: JourneyStep[];
  completionGoal: string;
}

export const DEFAULT_JOURNEYS: JourneyTemplate[] = [
  {
    slug: "first-run",
    name: "First Run Tour",
    audience: "new_user",
    completionGoal: "activated",
    steps: [
      { id: "welcome", title: "Welcome aboard", description: "Quick tour of the workspace and where to find help.", cta: "Start tour", surface: "modal", successEvent: "tour_started" },
      { id: "profile", title: "Complete your profile", description: "Add a display name and avatar so teammates recognise you.", cta: "Open profile", surface: "page", successEvent: "profile_completed" },
      { id: "first-project", title: "Create your first project", description: "Spin up a starter template in seconds.", cta: "New project", surface: "inline", successEvent: "project_created" },
      { id: "invite", title: "Invite a teammate", description: "Collaborate in real time.", cta: "Send invite", surface: "tooltip", successEvent: "member_invited" },
    ],
  },
  {
    slug: "publish-readiness",
    name: "Publish Readiness",
    audience: "project_owner",
    completionGoal: "first_publish",
    steps: [
      { id: "domain", title: "Connect a domain", description: "Bring your own domain or use a free subdomain.", cta: "Connect domain", surface: "page", successEvent: "domain_connected" },
      { id: "security", title: "Review security baseline", description: "Enable the production security profile.", cta: "Review", surface: "modal", successEvent: "security_reviewed" },
      { id: "publish", title: "Publish to production", description: "Ship to your selected hosting provider.", cta: "Publish", surface: "inline", successEvent: "deploy_completed" },
    ],
  },
];

// G7 — Polish scoring
export type PolishCategory = "accessibility" | "performance" | "seo" | "ux" | "i18n";

export interface PolishFinding {
  category: PolishCategory;
  severity: "info" | "warning" | "critical";
  message: string;
  hint: string;
}

export interface PolishInput {
  generatedFileCount: number;
  hasManifest: boolean;
  hasRobots: boolean;
  hasSitemap: boolean;
  hasAccessibilityFallback: boolean;
  hasTelemetry: boolean;
  hasSecurityBaseline: boolean;
  hasComplianceProfile: boolean;
  hasOnboardingJourney: boolean;
  hasMonetizationPlan: boolean;
  deployAdapterCount: number;
  runtimeAdapterCount: number;
}

export interface PolishReport {
  score: number;
  grade: "A" | "B" | "C" | "D" | "F";
  categoryScores: Record<PolishCategory, number>;
  findings: PolishFinding[];
  recommendations: string[];
}

function clamp(n: number) { return Math.max(0, Math.min(100, Math.round(n))); }

export function computePolishReport(input: PolishInput): PolishReport {
  const findings: PolishFinding[] = [];

  const accessibility = clamp((input.hasAccessibilityFallback ? 70 : 30) + (input.generatedFileCount > 0 ? 20 : 0) + (input.hasManifest ? 10 : 0));
  if (!input.hasAccessibilityFallback) findings.push({ category: "accessibility", severity: "critical", message: "No 2D accessibility fallback registered.", hint: "Enable the Accessibility panel to ship a non-3D rendering path." });

  const seo = clamp((input.hasRobots ? 35 : 0) + (input.hasSitemap ? 35 : 0) + (input.hasManifest ? 30 : 0));
  if (!input.hasRobots) findings.push({ category: "seo", severity: "warning", message: "robots.txt missing.", hint: "Generate site metadata to ship robots.txt." });
  if (!input.hasSitemap) findings.push({ category: "seo", severity: "warning", message: "sitemap.xml missing.", hint: "Materialize cross-platform targets to emit a sitemap." });

  const performance = clamp(40 + Math.min(60, input.runtimeAdapterCount * 12) + (input.deployAdapterCount > 0 ? 10 : -10));
  if (input.runtimeAdapterCount === 0) findings.push({ category: "performance", severity: "critical", message: "No runtime adapters configured.", hint: "Configure at least one runtime adapter to enable optimized deploys." });

  const ux = clamp(40 + (input.hasOnboardingJourney ? 40 : 0) + (input.hasMonetizationPlan ? 20 : 0));
  if (!input.hasOnboardingJourney) findings.push({ category: "ux", severity: "warning", message: "No onboarding journey defined.", hint: "Seed the default First Run Tour to activate new users." });

  const i18n = clamp(50 + (input.generatedFileCount > 50 ? 30 : 10) + (input.hasComplianceProfile ? 20 : 0));
  if (!input.hasComplianceProfile) findings.push({ category: "i18n", severity: "info", message: "No compliance profile chosen.", hint: "Enable SOC2 or GDPR profile to surface residency hints." });

  const categoryScores: Record<PolishCategory, number> = { accessibility, performance, seo, ux, i18n };
  const score = clamp((accessibility + performance + seo + ux + i18n) / 5);
  const grade: PolishReport["grade"] = score >= 90 ? "A" : score >= 80 ? "B" : score >= 70 ? "C" : score >= 55 ? "D" : "F";

  const recommendations = findings.slice(0, 6).map((f) => `${f.category}: ${f.hint}`);
  if (!input.hasSecurityBaseline) recommendations.unshift("security: enable strict security baseline before launch");
  if (!input.hasTelemetry) recommendations.unshift("observability: configure OTLP telemetry endpoint");

  return { score, grade, categoryScores, findings, recommendations };
}
