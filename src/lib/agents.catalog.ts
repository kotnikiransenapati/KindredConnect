// Multi-agent role registry — shared between server orchestrator and UI.
export type AgentRole =
  | "orchestrator"
  | "architect"
  | "designer"
  | "frontend"
  | "backend"
  | "mobile"
  | "data"
  | "integrations"
  | "qa"
  | "security"
  | "perf"
  | "reviewer"
  | "release";

export interface AgentDef {
  role: AgentRole;
  name: string;
  emoji: string;
  tagline: string;
  description: string;
  model: "fast" | "capable";
  tools: string[];
}

export const AGENTS: AgentDef[] = [
  { role: "orchestrator", name: "Orchestrator", emoji: "🧭", tagline: "Plans the swarm",
    description: "Decomposes the user goal into a task DAG and routes work to specialists.",
    model: "capable", tools: ["plan", "spawn_task", "merge_results"] },
  { role: "architect", name: "Architect", emoji: "📐", tagline: "Designs the system",
    description: "Picks stack pieces, drafts the file plan, and writes the database schema.",
    model: "capable", tools: ["search_docs", "write_plan", "schema_diff"] },
  { role: "designer", name: "Designer", emoji: "🎨", tagline: "Visual direction",
    description: "Selects tokens, layout, motion, and 3D direction; generates hero assets.",
    model: "fast", tools: ["design_tokens", "imagegen"] },
  { role: "frontend", name: "Frontend", emoji: "🧩", tagline: "Builds the UI",
    description: "Writes TanStack routes, React components, Tailwind v4, and shadcn UI.",
    model: "fast", tools: ["write_file", "edit_file", "read_file"] },
  { role: "backend", name: "Backend", emoji: "🛠️", tagline: "Server functions & RLS",
    description: "Implements server functions, migrations, and Row-Level-Security policies.",
    model: "capable", tools: ["write_file", "sql_migration"] },
  { role: "mobile", name: "Mobile", emoji: "📱", tagline: "iOS, Android, PWA",
    description: "Configures Capacitor, native plugins, and PWA manifest/service worker.",
    model: "fast", tools: ["bundle_mobile", "add_capacitor_plugin", "scaffold_pwa"] },
  { role: "data", name: "Data", emoji: "🗄️", tagline: "Schema & seeds",
    description: "Models tables, indexes, seed data, and analytics queries.",
    model: "fast", tools: ["sql_migration", "read_query"] },
  { role: "integrations", name: "Integrations", emoji: "🔌", tagline: "Connect the world",
    description: "Wires up Stripe, OAuth, email, storage, and AI providers.",
    model: "fast", tools: ["connector_install", "secret_set"] },
  { role: "qa", name: "QA", emoji: "🧪", tagline: "Tests every change",
    description: "Runs vitest, smoke tests, and the mobile UX audit.",
    model: "fast", tools: ["run_tests", "run_mobile_audit"] },
  { role: "security", name: "Security", emoji: "🛡️", tagline: "Guards production",
    description: "Audits RLS, secrets, dependencies, and Turnstile coverage.",
    model: "fast", tools: ["security_scan", "rls_audit", "dep_scan"] },
  { role: "perf", name: "Performance", emoji: "⚡", tagline: "Speed & weight",
    description: "Runs Lighthouse, image optimization, and bundle analysis.",
    model: "fast", tools: ["lighthouse", "image_opt", "bundle_analyze"] },
  { role: "reviewer", name: "Reviewer", emoji: "🔍", tagline: "Diff critic",
    description: "Reviews every PR-style batch and rejects bad output for rework.",
    model: "capable", tools: ["read_file", "diff_review", "request_changes"] },
  { role: "release", name: "Release", emoji: "🚀", tagline: "Ships it",
    description: "Builds, versions, and publishes web + mobile bundles.",
    model: "fast", tools: ["deploy_web", "bundle_mobile", "ota_publish"] },
];

export const AGENT_BY_ROLE: Record<AgentRole, AgentDef> = Object.fromEntries(
  AGENTS.map((a) => [a.role, a]),
) as Record<AgentRole, AgentDef>;
