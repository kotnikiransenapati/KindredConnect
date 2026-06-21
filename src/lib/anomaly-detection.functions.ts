// P38 — ML-powered anomaly detection.
// Statistical detector management, append-only metric ingestion, z-score
// incident creation, triage states, and project-scoped overview rollups.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { assertProjectRole, enforceRateLimit, evaluateMetric, normalizeChannels } from "./anomaly-detection.server";
import type { Database } from "@/integrations/supabase/types";

type DbClient = any;
type DetectorRow = Database["public"]["Tables"]["anomaly_detectors"]["Row"];
type IncidentRow = Database["public"]["Tables"]["anomaly_incidents"]["Row"];
type SampleRow = Database["public"]["Tables"]["anomaly_samples"]["Row"];
type DetectorDto = DetectorRow & { notify_channels: string[]; baseline: Record<string, unknown> };
type IncidentDto = IncidentRow & { metadata: Record<string, unknown>; anomaly_detectors?: { name: string; metric_key: string; source: string } | null };
type SampleDto = SampleRow & { context: Record<string, unknown> };
const db = (ctx: any) => ctx.supabase as DbClient;
const toRecord = (value: unknown) => (value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {});
const toChannels = (value: unknown) => Array.isArray(value) ? value.map(String) : [];
function detectorDto(row: DetectorRow): DetectorDto { return { ...row, notify_channels: toChannels(row.notify_channels), baseline: toRecord(row.baseline) }; }
function sampleDto(row: SampleRow): SampleDto { return { ...row, context: toRecord(row.context) }; }
function incidentDto(row: any): IncidentDto { return { ...row, metadata: toRecord(row.metadata) }; }

const SourceZ = z.enum(["analytics", "crashes", "builds", "security", "performance", "custom"]);
const SensitivityZ = z.enum(["low", "medium", "high"]);
const MetricKeyZ = z.string().min(2).max(80).regex(/^[a-z0-9][a-z0-9_.:-]*$/i, "metric key can contain letters, numbers, . _ : -");
const IncidentStateZ = z.enum(["open", "acknowledged", "resolved", "suppressed"]);

export const listDetectors = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ projectId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertProjectRole(context, data.projectId, "viewer");
    const { data: rows, error } = await db(context)
      .from("anomaly_detectors")
      .select("*")
      .eq("project_id", data.projectId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return ((rows ?? []) as DetectorRow[]).map(detectorDto);
  });

export const upsertDetector = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    id: z.string().uuid().optional(),
    projectId: z.string().uuid(),
    name: z.string().min(2).max(120),
    metricKey: MetricKeyZ,
    source: SourceZ.default("custom"),
    sensitivity: SensitivityZ.default("medium"),
    windowMinutes: z.number().int().min(5).max(10080).default(60),
    minSamples: z.number().int().min(5).max(1000).default(12),
    enabled: z.boolean().default(true),
    notifyChannels: z.array(z.string().max(40)).max(8).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertProjectRole(context, data.projectId, "editor");
    await enforceRateLimit(context, "anomaly:detector", 30);
    const payload = {
      id: data.id,
      project_id: data.projectId,
      name: data.name,
      metric_key: data.metricKey,
      source: data.source,
      sensitivity: data.sensitivity,
      window_minutes: data.windowMinutes,
      min_samples: data.minSamples,
      enabled: data.enabled,
      notify_channels: normalizeChannels(data.notifyChannels),
      created_by: context.userId,
    } as any;
    if (!data.id) delete payload.id;
    const { data: saved, error } = await db(context)
      .from("anomaly_detectors")
      .upsert(payload, { onConflict: data.id ? "id" : "project_id,metric_key" })
      .select("*")
      .single();
    if (error) throw new Error(error.code === "23505" ? "Metric key already exists for this project" : error.message);
    return detectorDto(saved as DetectorRow);
  });

export const deleteDetector = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), projectId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertProjectRole(context, data.projectId, "owner");
    const { error } = await db(context)
      .from("anomaly_detectors")
      .delete()
      .eq("id", data.id)
      .eq("project_id", data.projectId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const ingestMetric = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    detectorId: z.string().uuid(),
    projectId: z.string().uuid(),
    value: z.number().finite(),
    dimension: z.string().max(120).optional(),
    context: z.record(z.string(), z.any()).optional(),
    measuredAt: z.string().datetime().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertProjectRole(context, data.projectId, "editor");
    await enforceRateLimit(context, "anomaly:ingest", 240);
    const { data: detectorRow, error: de } = await db(context)
      .from("anomaly_detectors")
      .select("*")
      .eq("id", data.detectorId)
      .eq("project_id", data.projectId)
      .single();
    if (de || !detectorRow) throw new Error(de?.message ?? "Detector not found");
    const detector = detectorRow as DetectorRow;
    if (!detector.enabled) throw new Error("Detector is disabled");

    const windowStart = new Date(Date.now() - detector.window_minutes * 60_000).toISOString();
    const { data: priorRows, error: pe } = await db(context)
      .from("anomaly_samples")
      .select("metric_value")
      .eq("detector_id", data.detectorId)
      .gte("measured_at", windowStart)
      .order("measured_at", { ascending: false })
      .limit(1000);
    if (pe) throw new Error(pe.message);

    const evaluation = evaluateMetric(detector as any, data.value, (priorRows ?? []).map((r: any) => Number(r.metric_value)));
    const { data: sampleRow, error: se } = await db(context)
      .from("anomaly_samples")
      .insert({
        detector_id: data.detectorId,
        project_id: data.projectId,
        metric_value: data.value,
        dimension: data.dimension ?? null,
        context: data.context ?? {},
        measured_at: data.measuredAt ?? new Date().toISOString(),
      } as any)
      .select("*")
      .single();
    if (se) throw new Error(se.message);
    const sample = sampleRow as SampleRow;

    await db(context)
      .from("anomaly_detectors")
      .update({ baseline: { mean: evaluation.mean, stdDev: evaluation.stdDev, sampleCount: evaluation.sampleCount, threshold: evaluation.threshold } } as any)
      .eq("id", data.detectorId);

    let incident = null;
    if (evaluation.isAnomaly) {
      const { data: existing } = await db(context)
        .from("anomaly_incidents")
        .select("id")
        .eq("detector_id", data.detectorId)
        .eq("state", "open")
        .gte("detected_at", new Date(Date.now() - detector.window_minutes * 60_000).toISOString())
        .limit(1)
        .maybeSingle();
      if (!existing) {
        const { data: created, error: ie } = await db(context)
          .from("anomaly_incidents")
          .insert({
            detector_id: data.detectorId,
            project_id: data.projectId,
            sample_id: sample.id,
            severity: evaluation.severity,
            score: evaluation.score,
            z_score: evaluation.zScore,
            expected_value: evaluation.mean,
            actual_value: data.value,
            summary: evaluation.summary,
            recommendation: evaluation.recommendation,
            metadata: { source: detector.source, metricKey: detector.metric_key, dimension: data.dimension ?? null },
            actor_id: context.userId,
          } as any)
          .select("*")
          .single();
        if (ie) throw new Error(ie.message);
        incident = incidentDto(created);
      }
    }
    return { sample: sampleDto(sample), incident, evaluation };
  });

export const runDetections = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ projectId: z.string().uuid(), detectorId: z.string().uuid().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertProjectRole(context, data.projectId, "editor");
    await enforceRateLimit(context, "anomaly:scan", 20);
    let q = db(context).from("anomaly_detectors").select("*").eq("project_id", data.projectId).eq("enabled", true);
    if (data.detectorId) q = q.eq("id", data.detectorId);
    const { data: detectorRows, error } = await q.limit(50);
    if (error) throw new Error(error.message);
    const results = [];
    for (const detector of ((detectorRows ?? []) as DetectorRow[])) {
      const { data: rows } = await db(context)
        .from("anomaly_samples")
        .select("id, metric_value, measured_at")
        .eq("detector_id", detector.id)
        .order("measured_at", { ascending: false })
        .limit(Math.max(detector.min_samples + 1, 25));
      const latest = rows?.[0];
      if (!latest) continue;
      const history = (rows ?? []).slice(1).map((r: any) => Number(r.metric_value));
      const evaluation = evaluateMetric(detector as any, Number(latest.metric_value), history);
      results.push({ detectorId: detector.id, metricKey: detector.metric_key, evaluation });
    }
    return { checked: results.length, results };
  });

export const listIncidents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ projectId: z.string().uuid(), state: IncidentStateZ.optional() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertProjectRole(context, data.projectId, "viewer");
    let q = db(context)
      .from("anomaly_incidents")
      .select("*, anomaly_detectors(name, metric_key, source)")
      .eq("project_id", data.projectId)
      .order("detected_at", { ascending: false })
      .limit(200);
    if (data.state) q = q.eq("state", data.state);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return ((rows ?? []) as any[]).map(incidentDto);
  });

export const setIncidentState = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), projectId: z.string().uuid(), state: IncidentStateZ }).parse(d))
  .handler(async ({ data, context }) => {
    await assertProjectRole(context, data.projectId, "editor");
    const patch: any = { state: data.state, actor_id: context.userId };
    if (data.state === "acknowledged") patch.acknowledged_at = new Date().toISOString();
    if (data.state === "resolved") patch.resolved_at = new Date().toISOString();
    const { data: saved, error } = await db(context)
      .from("anomaly_incidents")
      .update(patch)
      .eq("id", data.id)
      .eq("project_id", data.projectId)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return incidentDto(saved);
  });

export const anomalyOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ projectId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertProjectRole(context, data.projectId, "viewer");
    const since = new Date(Date.now() - 30 * 86400_000).toISOString();
    const [{ data: detectors }, { data: incidents }, { count: sampleCount }] = await Promise.all([
      db(context).from("anomaly_detectors").select("source, enabled").eq("project_id", data.projectId),
      db(context).from("anomaly_incidents").select("severity,state,metadata,detected_at").eq("project_id", data.projectId).gte("detected_at", since),
      db(context).from("anomaly_samples").select("id", { count: "exact", head: true }).eq("project_id", data.projectId).gte("measured_at", since),
    ]);
    const bySeverity: Record<string, number> = {};
    const bySource: Record<string, number> = {};
    for (const inc of incidents ?? []) {
      bySeverity[inc.severity] = (bySeverity[inc.severity] ?? 0) + 1;
      const source = (inc.metadata as any)?.source ?? "custom";
      bySource[source] = (bySource[source] ?? 0) + 1;
    }
    return {
      detectors: detectors?.length ?? 0,
      enabled: (detectors ?? []).filter((d: any) => d.enabled).length,
      samples30d: sampleCount ?? 0,
      incidents30d: incidents?.length ?? 0,
      open: (incidents ?? []).filter((i: any) => i.state === "open").length,
      critical: (incidents ?? []).filter((i: any) => i.severity === "critical" && i.state === "open").length,
      bySeverity: Object.entries(bySeverity).sort((a, b) => b[1] - a[1]),
      bySource: Object.entries(bySource).sort((a, b) => b[1] - a[1]),
    };
  });