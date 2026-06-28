// Foundry v3 Phase H3/H4/I1 — deterministic synthesizers for the
// autonomous backlog, acceptance contract test graph, and isolated build runs.
// Pure functions only; no IO, no provider SDKs.

import type { ArtifactPlan, ProductionBlueprint, TargetSurface } from "./foundry-production.shared";

export type BacklogKind = "feature" | "bug" | "chore" | "security" | "observability" | "release" | "docs";
export type BacklogPriority = "low" | "medium" | "high" | "critical";

export interface BacklogItem {
  sequence: number;
  kind: BacklogKind;
  title: string;
  description: string;
  owner: string;
  priority: BacklogPriority;
  estimatePoints: number;
  acceptance: string[];
  dependencies: string[];
}

function hashStr(input: string) {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

export function synthesizeBacklog(input: { blueprint: ProductionBlueprint }): BacklogItem[] {
  const items: BacklogItem[] = [];
  let seq = 1;
  const push = (item: Omit<BacklogItem, "sequence">) => {
    items.push({ ...item, sequence: seq });
    seq += 1;
  };

  // Always-on hygiene items derived from blueprint warnings
  for (const warning of input.blueprint.warnings) {
    push({
      kind: warning.toLowerCase().includes("security") ? "security" : warning.toLowerCase().includes("telemetry") ? "observability" : "chore",
      title: `Resolve warning: ${warning.slice(0, 80)}`,
      description: warning,
      owner: "planner",
      priority: "high",
      estimatePoints: 2,
      acceptance: ["Warning no longer appears in the blueprint readiness scan"],
      dependencies: [],
    });
  }

  // Surface-driven backlog
  for (const surface of input.blueprint.surfaces) {
    for (const flow of surface.criticalFlows) {
      push({
        kind: "feature",
        title: `${surface.target}: implement ${flow}`,
        description: `Deliver the ${flow} flow on the ${surface.target} surface (${surface.experience}).`,
        owner: surface.target === "ios" || surface.target === "android" ? "mobile" : surface.target === "backend" ? "backend" : "codegen",
        priority: flow === "auth" || flow === "request validation" ? "critical" : "high",
        estimatePoints: surface.target === "backend" ? 5 : 3,
        acceptance: [
          `${surface.target} ${flow} renders without console errors`,
          `${flow} state is covered by an acceptance contract`,
          `${flow} respects security baseline and rate limits`,
        ],
        dependencies: [],
      });
    }
  }

  // Data model backlog
  for (const entity of input.blueprint.dataModel) {
    push({
      kind: "chore",
      title: `Schema: ${entity.name}`,
      description: `Generate migration, RLS policies and runtime contract for ${entity.name}.`,
      owner: "backend",
      priority: "high",
      estimatePoints: 3,
      acceptance: [
        `${entity.name} migration applies cleanly`,
        `${entity.name} RLS scoped to project/user as appropriate`,
        `${entity.name} exposed via portable runtime contract`,
      ],
      dependencies: [],
    });
  }

  // Release-readiness backlog
  push({ kind: "security", title: "Verify dependency audit gate", description: "Run dependency audit and resolve critical findings before release.", owner: "security", priority: "critical", estimatePoints: 2, acceptance: ["No critical findings in dependency audit"], dependencies: [] });
  push({ kind: "observability", title: "Wire OTLP traces, metrics, logs", description: "Confirm telemetry endpoints receive spans/metrics from generated app.", owner: "security", priority: "high", estimatePoints: 2, acceptance: ["Traces visible for top three flows"], dependencies: [] });
  push({ kind: "release", title: "Dry-run canary deploy + rollback", description: "Execute canary promotion and rollback in a non-production environment.", owner: "release", priority: "critical", estimatePoints: 3, acceptance: ["Canary promotion succeeds", "Rollback restores prior version"], dependencies: [] });
  push({ kind: "docs", title: "Publish production blueprint and runbook", description: "Materialize blueprint, runbook and operator handoff docs.", owner: "planner", priority: "medium", estimatePoints: 1, acceptance: ["docs/production-blueprint.md present", "Operator runbook reviewed"], dependencies: [] });

  return items;
}

export type AcceptanceSeverity = "low" | "medium" | "high" | "critical";

export interface AcceptanceContract {
  surface: TargetSurface | string;
  flow: string;
  given: string[];
  whenSteps: string[];
  thenAssertions: string[];
  fixtures: Record<string, unknown>;
  severity: AcceptanceSeverity;
}

export function synthesizeAcceptanceContracts(input: { blueprint: ProductionBlueprint }): AcceptanceContract[] {
  const contracts: AcceptanceContract[] = [];
  for (const surface of input.blueprint.surfaces) {
    for (const flow of surface.criticalFlows) {
      const critical = flow === "auth" || flow === "request validation" || flow === "policy enforcement";
      contracts.push({
        surface: surface.target,
        flow,
        given: [
          `the ${surface.target} surface is built from the latest blueprint`,
          `the user is in a valid baseline state for ${flow}`,
        ],
        whenSteps: [
          `the user triggers the ${flow} flow`,
          `the app processes the request through generated adapters`,
        ],
        thenAssertions: [
          `${flow} completes without unhandled errors`,
          `audit log captures the ${flow} event`,
          critical ? `${flow} cannot be bypassed by an unauthenticated caller` : `${flow} respects role-based access`,
        ],
        fixtures: { surface: surface.target, flow, generatedFromBlueprint: true },
        severity: critical ? "critical" : "high",
      });
    }
  }
  // Entity-level contracts
  for (const entity of input.blueprint.dataModel) {
    contracts.push({
      surface: "backend",
      flow: `${entity.name} CRUD policy`,
      given: [`${entity.name} table exists with RLS enabled`],
      whenSteps: [`a non-owner attempts to read or write ${entity.name}`],
      thenAssertions: [
        `read returns zero rows for the non-owner`,
        `write is rejected with a policy violation`,
        `service role can perform maintenance reads`,
      ],
      fixtures: { entity: entity.name, policies: entity.policies },
      severity: "critical",
    });
  }
  return contracts;
}

export type BuildTarget = TargetSurface | "all";
export type BuildStageStatus = "queued" | "running" | "succeeded" | "failed" | "skipped";

export interface BuildStageResult {
  id: string;
  title: string;
  status: BuildStageStatus;
  durationMs: number;
  gates: Array<{ name: string; status: "pass" | "fail" | "skip"; detail?: string }>;
  logs: string[];
}

export interface BuildRunPlan {
  target: BuildTarget;
  pipelineHash: string;
  stages: BuildStageResult[];
  artifacts: Array<{ path: string; mime: string; size: number }>;
  totalDurationMs: number;
  status: "succeeded" | "failed";
  gateSummary: Array<{ name: string; status: "pass" | "fail" }>;
}

// Simulates an isolated build executor deterministically from the artifact plan.
// In real execution this is replaced by a sandboxed worker; the synthesized output
// here drives UI, persistence and downstream observability without flakiness.
export function synthesizeBuildRun(input: { plan: ArtifactPlan; target: BuildTarget; seed?: number }): BuildRunPlan {
  const seed = input.seed ?? Number.parseInt(input.plan.pipelineHash.replace(/[^0-9a-f]/g, "").slice(-6) || "0", 16);
  const stages: BuildStageResult[] = input.plan.stages.map((stage, idx) => {
    const baseMs = 800 + ((seed + idx * 137) % 3200);
    const gateResults = stage.gates.map((gate) => ({ name: gate, status: "pass" as const, detail: `${gate} executed in ${baseMs}ms` }));
    return {
      id: stage.id,
      title: stage.title,
      status: "succeeded",
      durationMs: baseMs,
      gates: gateResults,
      logs: [
        `[${stage.id}] start owner=${stage.owner}`,
        `[${stage.id}] resolved ${stage.dependsOn.length} dependencies`,
        `[${stage.id}] produced ${stage.outputs.length} outputs`,
        `[${stage.id}] gates passed: ${stage.gates.join(", ") || "none"}`,
      ],
    };
  });
  const totalDurationMs = stages.reduce((acc, s) => acc + s.durationMs, 0);
  const targetMatrix = input.plan.targetMatrix;
  const relevantTargets = input.target === "all" ? Object.keys(targetMatrix) : [input.target];
  const artifacts = relevantTargets.flatMap((t) => {
    const cfg = targetMatrix[t as TargetSurface];
    if (!cfg || !cfg.enabled) return [];
    return cfg.outputs.map((output, idx) => ({
      path: `build/${t}/${output.replace(/[^a-z0-9._/-]/gi, "-")}`,
      mime: output.includes(".sql") ? "application/sql" : output.includes(".json") ? "application/json" : "application/octet-stream",
      size: 4096 + ((seed + idx * 911) % 65536),
    }));
  });
  const gateSummary = Array.from(new Set(stages.flatMap((s) => s.gates.map((g) => g.name)))).map((name) => ({ name, status: "pass" as const }));
  return {
    target: input.target,
    pipelineHash: input.plan.pipelineHash,
    stages,
    artifacts,
    totalDurationMs,
    status: "succeeded",
    gateSummary,
  };
}

export function fingerprintBuildRun(run: BuildRunPlan): string {
  return `br-${hashStr(JSON.stringify({ h: run.pipelineHash, t: run.target, a: run.artifacts.map((a) => a.path), s: run.stages.map((s) => s.id) }))}`;
}
