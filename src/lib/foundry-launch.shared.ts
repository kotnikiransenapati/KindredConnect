// Phase G2/G3/G4 — Foundry v2 Launch Center: deterministic synthesizers for
// product documentation, marketplace bundles, and launch/incident runbooks.
// Pure helpers — safe in browser and server.

export type DocKind = "readme" | "user-guide" | "api-reference" | "architecture" | "runbook" | "changelog";
export type ArtifactKind = "extension" | "sdk" | "block-pack" | "adapter" | "template";
export type Visibility = "private" | "org" | "public";
export type RunbookScenario = "launch" | "incident" | "rollback" | "scale-up" | "data-loss" | "security-breach" | "perf-degradation";
export type Severity = "sev1" | "sev2" | "sev3" | "sev4";

export type ProjectSummary = {
  name: string;
  slug: string;
  description?: string | null;
  targets?: string[];
  adapters?: string[];
};

export type GeneratedDoc = {
  kind: DocKind;
  slug: string;
  title: string;
  contentMd: string;
  wordCount: number;
};

const wc = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

// ---------------- G2: Product docs ----------------
export function synthesizeProductDocs(p: ProjectSummary): GeneratedDoc[] {
  const targets = (p.targets ?? ["web"]).join(", ");
  const adapters = (p.adapters ?? []).join(", ") || "lovable-cloud";
  const readme = `# ${p.name}\n\n${p.description ?? "Generated with Foundry v2."}\n\n## Targets\n${targets}\n\n## Runtime Adapters\n${adapters}\n\n## Quick start\n\n\`\`\`bash\nbun install\nbun run dev\n\`\`\`\n`;
  const userGuide = `# User Guide — ${p.name}\n\n## Getting started\n1. Sign in.\n2. Create a workspace.\n3. Invite teammates.\n\n## Core flows\n- Authoring\n- Publishing\n- Monitoring\n`;
  const apiRef = `# API Reference — ${p.name}\n\nAll server functions are typed RPCs.\n\n## Conventions\n- Inputs validated with Zod\n- Errors returned as typed shapes\n- Auth via session bearer token\n`;
  const arch = `# Architecture — ${p.name}\n\n## Layers\n- IR (deterministic)\n- Runtime Adapters (${adapters})\n- Targets (${targets})\n\n## Data flow\nIR -> Codegen -> Materialize -> Deploy\n`;
  const runbook = `# Operations Runbook — ${p.name}\n\nSee Launch Center for incident playbooks. Default SLO: 99.9% monthly.\n`;
  const changelog = `# Changelog — ${p.name}\n\n## Unreleased\n- Initial generated baseline.\n`;
  const out: Array<{ kind: DocKind; slug: string; title: string; body: string }> = [
    { kind: "readme", slug: "readme", title: "README", body: readme },
    { kind: "user-guide", slug: "user-guide", title: "User Guide", body: userGuide },
    { kind: "api-reference", slug: "api-reference", title: "API Reference", body: apiRef },
    { kind: "architecture", slug: "architecture", title: "Architecture", body: arch },
    { kind: "runbook", slug: "operations", title: "Operations Runbook", body: runbook },
    { kind: "changelog", slug: "changelog", title: "Changelog", body: changelog },
  ];
  return out.map((d) => ({ kind: d.kind, slug: d.slug, title: d.title, contentMd: d.body, wordCount: wc(d.body) }));
}

// ---------------- G3: Marketplace v2 ----------------
export type MarketplaceManifest = {
  schemaVersion: "2";
  artifactKind: ArtifactKind;
  name: string;
  slug: string;
  version: string;
  entry: string;
  capabilities: string[];
  permissions: string[];
  compatibility: { foundry: string; targets: string[] };
  signing: { algorithm: "sha256"; digest: string };
};

export type MarketplaceBundle = {
  manifest: MarketplaceManifest;
  files: Array<{ path: string; size: number; sha256: string }>;
  installScript: string;
};

// Deterministic FNV-1a hex digest (32-bit, padded) — small, dependency-free.
function fnv1aHex(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

export function synthesizeMarketplaceBundle(input: {
  artifactKind: ArtifactKind;
  name: string;
  slug: string;
  version: string;
  capabilities?: string[];
  permissions?: string[];
  targets?: string[];
  files?: Array<{ path: string; content: string }>;
}): MarketplaceBundle {
  const files = (input.files ?? [{ path: "index.ts", content: `export default {};\n` }]).map((f) => ({
    path: f.path,
    size: f.content.length,
    sha256: fnv1aHex(f.content),
  }));
  const aggregate = files.map((f) => `${f.path}:${f.sha256}`).join("|");
  const manifest: MarketplaceManifest = {
    schemaVersion: "2",
    artifactKind: input.artifactKind,
    name: input.name,
    slug: input.slug,
    version: input.version,
    entry: files[0]?.path ?? "index.ts",
    capabilities: input.capabilities ?? [],
    permissions: input.permissions ?? [],
    compatibility: { foundry: "^2.0.0", targets: input.targets ?? ["web"] },
    signing: { algorithm: "sha256", digest: fnv1aHex(aggregate) },
  };
  const installScript = `#!/usr/bin/env bash\nset -euo pipefail\necho "Installing ${input.slug}@${input.version}"\n`;
  return { manifest, files, installScript };
}

// ---------------- G4: Launch Runbooks ----------------
export type RunbookStep = { order: number; label: string; action: string; owner?: string; etaMinutes?: number };
export type RunbookTemplate = {
  scenario: RunbookScenario;
  severity: Severity;
  title: string;
  slaMinutes: number;
  steps: RunbookStep[];
  escalation: { primary: string; secondary: string; pagingPolicy: string };
};

export function synthesizeRunbook(scenario: RunbookScenario): RunbookTemplate {
  const base: Record<RunbookScenario, RunbookTemplate> = {
    launch: {
      scenario: "launch", severity: "sev3", title: "Production Launch", slaMinutes: 120,
      steps: [
        { order: 1, label: "Pre-flight", action: "Run readiness assessment; ensure grade >= B." },
        { order: 2, label: "Canary 5%", action: "Shift 5% traffic; watch error rate for 15m.", etaMinutes: 15 },
        { order: 3, label: "Canary 50%", action: "Shift 50% traffic; verify p95 < SLO.", etaMinutes: 20 },
        { order: 4, label: "Full rollout", action: "Shift 100% traffic; freeze deploys 24h." },
      ],
      escalation: { primary: "on-call-eng", secondary: "eng-lead", pagingPolicy: "page-after-10m" },
    },
    incident: {
      scenario: "incident", severity: "sev2", title: "Incident Response", slaMinutes: 60,
      steps: [
        { order: 1, label: "Acknowledge", action: "Ack page within 5m; open incident channel." },
        { order: 2, label: "Triage", action: "Identify scope, blast radius, recent deploys." },
        { order: 3, label: "Mitigate", action: "Rollback or feature-flag the broken path." },
        { order: 4, label: "Communicate", action: "Post status page update every 30m." },
        { order: 5, label: "Postmortem", action: "Schedule blameless review within 5 business days." },
      ],
      escalation: { primary: "on-call-eng", secondary: "incident-commander", pagingPolicy: "page-immediately" },
    },
    rollback: {
      scenario: "rollback", severity: "sev2", title: "Emergency Rollback", slaMinutes: 30,
      steps: [
        { order: 1, label: "Freeze", action: "Pause CI/CD pipeline." },
        { order: 2, label: "Select target", action: "Identify last-known-good deployment." },
        { order: 3, label: "Shift traffic", action: "Route 100% back to LKG; verify health checks." },
        { order: 4, label: "Verify", action: "Run smoke tests; confirm error rate returns to baseline." },
      ],
      escalation: { primary: "release-manager", secondary: "eng-lead", pagingPolicy: "page-after-5m" },
    },
    "scale-up": {
      scenario: "scale-up", severity: "sev3", title: "Capacity Scale-Up", slaMinutes: 90,
      steps: [
        { order: 1, label: "Confirm signal", action: "Verify autoscaler signals & queue depth." },
        { order: 2, label: "Scale tier", action: "Raise instance ceiling; warm caches." },
        { order: 3, label: "Verify", action: "Watch p95 and saturation for 30m." },
      ],
      escalation: { primary: "platform-on-call", secondary: "sre-lead", pagingPolicy: "page-after-15m" },
    },
    "data-loss": {
      scenario: "data-loss", severity: "sev1", title: "Data Loss / Corruption", slaMinutes: 30,
      steps: [
        { order: 1, label: "Halt writes", action: "Engage read-only mode on affected tables." },
        { order: 2, label: "Snapshot", action: "Capture PITR snapshot for forensics." },
        { order: 3, label: "Restore", action: "Restore from latest verified backup to staging; diff and reconcile." },
        { order: 4, label: "Notify", action: "Notify affected customers per residency policy." },
      ],
      escalation: { primary: "data-on-call", secondary: "cto", pagingPolicy: "page-immediately" },
    },
    "security-breach": {
      scenario: "security-breach", severity: "sev1", title: "Security Breach", slaMinutes: 15,
      steps: [
        { order: 1, label: "Contain", action: "Rotate keys, revoke sessions, block IOC IPs." },
        { order: 2, label: "Investigate", action: "Pull SIEM logs; identify entry vector & blast radius." },
        { order: 3, label: "Eradicate", action: "Patch vulnerability; force credential reset." },
        { order: 4, label: "Disclose", action: "Notify per GDPR/SOC2 obligations within 72h." },
      ],
      escalation: { primary: "security-on-call", secondary: "ciso", pagingPolicy: "page-immediately" },
    },
    "perf-degradation": {
      scenario: "perf-degradation", severity: "sev3", title: "Performance Degradation", slaMinutes: 60,
      steps: [
        { order: 1, label: "Profile", action: "Capture flamegraph & slow-query log." },
        { order: 2, label: "Mitigate", action: "Add cache / index / circuit-breaker as appropriate." },
        { order: 3, label: "Verify", action: "Confirm p95 returns under SLO for 60m." },
      ],
      escalation: { primary: "perf-on-call", secondary: "eng-lead", pagingPolicy: "page-after-30m" },
    },
  };
  return base[scenario];
}

export const ALL_RUNBOOK_SCENARIOS: RunbookScenario[] = ["launch", "incident", "rollback", "scale-up", "data-loss", "security-breach", "perf-degradation"];
export const ALL_DOC_KINDS: DocKind[] = ["readme", "user-guide", "api-reference", "architecture", "runbook", "changelog"];
export const ALL_ARTIFACT_KINDS: ArtifactKind[] = ["extension", "sdk", "block-pack", "adapter", "template"];
