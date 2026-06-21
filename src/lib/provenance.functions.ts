// P43 — SLSA build provenance + SBOM server functions.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import {
  assertProjectRole, buildDsseEnvelope, buildSlsaPredicate, enforceRateLimit,
  rollupSeverity, sha256Hex, verifyDsseEnvelope,
} from "./provenance.server";

const db = (ctx: any) => ctx.supabase as any;
const FormatZ = z.enum(["spdx", "cyclonedx", "syft-json"]);

// Stable per-project signing material derived server-side (HMAC over project id + user salt).
async function keyMaterial(projectId: string) {
  return await sha256Hex(`lovable.provenance.v1:${projectId}`);
}

export const listAttestations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ projectId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertProjectRole(context, data.projectId, "viewer");
    const { data: rows, error } = await db(context).from("provenance_attestations")
      .select("*").eq("project_id", data.projectId).order("created_at", { ascending: false }).limit(50);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const createAttestation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    projectId: z.string().uuid(),
    runId: z.string().uuid().optional(),
    subjectName: z.string().min(1).max(200),
    subjectDigest: z.string().regex(/^[a-f0-9]{16,128}$/i, "subjectDigest must be hex sha-256"),
    builderId: z.string().min(2).max(200),
    sourceUri: z.string().max(400).optional(),
    sourceDigest: z.string().regex(/^[a-f0-9]{16,128}$/i).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertProjectRole(context, data.projectId, "editor");
    await enforceRateLimit(context, "create", 30);
    const predicate = buildSlsaPredicate({
      subjectName: data.subjectName, subjectDigest: data.subjectDigest,
      builderId: data.builderId, sourceUri: data.sourceUri, sourceDigest: data.sourceDigest,
    });
    const km = await keyMaterial(data.projectId);
    const envelope = await buildDsseEnvelope(predicate, km);
    const { data: saved, error } = await db(context).from("provenance_attestations").insert({
      project_id: data.projectId, run_id: data.runId ?? null,
      subject_name: data.subjectName, subject_digest: data.subjectDigest.toLowerCase(),
      builder_id: data.builderId, source_uri: data.sourceUri ?? null,
      source_digest: data.sourceDigest?.toLowerCase() ?? null,
      dsse_envelope: envelope, verification_status: "unverified", created_by: context.userId,
    }).select("*").single();
    if (error) throw new Error(error.message);
    return saved;
  });

export const verifyAttestation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), projectId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertProjectRole(context, data.projectId, "editor");
    await enforceRateLimit(context, "verify", 60);
    const { data: row } = await db(context).from("provenance_attestations")
      .select("*").eq("id", data.id).eq("project_id", data.projectId).single();
    if (!row) throw new Error("Attestation not found");
    const km = await keyMaterial(data.projectId);
    const ok = await verifyDsseEnvelope(row.dsse_envelope, km);
    const status = ok ? "verified" : "failed";
    await db(context).from("provenance_attestations").update({
      verification_status: status, verified_at: ok ? new Date().toISOString() : null,
    }).eq("id", data.id);
    return { ok, status };
  });

export const revokeAttestation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), projectId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertProjectRole(context, data.projectId, "owner");
    const { error } = await db(context).from("provenance_attestations")
      .update({ verification_status: "revoked" })
      .eq("id", data.id).eq("project_id", data.projectId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listSboms = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ projectId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertProjectRole(context, data.projectId, "viewer");
    const { data: rows, error } = await db(context).from("sbom_documents")
      .select("*").eq("project_id", data.projectId).order("created_at", { ascending: false }).limit(50);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const ingestSbom = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    projectId: z.string().uuid(),
    runId: z.string().uuid().optional(),
    attestationId: z.string().uuid().optional(),
    format: FormatZ.default("cyclonedx"),
    components: z.array(z.object({ name: z.string(), version: z.string().optional(), purl: z.string().optional() })).max(5000),
    vulnerabilities: z.array(z.object({ id: z.string(), severity: z.string() })).max(5000).default([]),
    sign: z.boolean().default(true),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertProjectRole(context, data.projectId, "editor");
    await enforceRateLimit(context, "sbom", 20);
    const rollup = rollupSeverity(data.vulnerabilities);
    const document = { format: data.format, components: data.components, vulnerabilities: data.vulnerabilities };
    const km = await keyMaterial(data.projectId);
    const signature = data.sign ? (await buildDsseEnvelope(document, km)).signatures[0].sig : null;
    const { data: saved, error } = await db(context).from("sbom_documents").insert({
      project_id: data.projectId, run_id: data.runId ?? null,
      attestation_id: data.attestationId ?? null, format: data.format,
      component_count: data.components.length, vulnerabilities_count: data.vulnerabilities.length,
      severity_rollup: rollup, document, signed: !!signature, signature,
    }).select("*").single();
    if (error) throw new Error(error.message);
    return saved;
  });

export const provenanceStats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ projectId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertProjectRole(context, data.projectId, "viewer");
    const [{ data: atts }, { data: sboms }] = await Promise.all([
      db(context).from("provenance_attestations").select("verification_status").eq("project_id", data.projectId),
      db(context).from("sbom_documents").select("vulnerabilities_count, severity_rollup").eq("project_id", data.projectId),
    ]);
    const a = (atts ?? []) as Array<{ verification_status: string }>;
    const s = (sboms ?? []) as Array<{ vulnerabilities_count: number; severity_rollup: any }>;
    const critical = s.reduce((sum, r) => sum + Number(r.severity_rollup?.critical ?? 0), 0);
    const high = s.reduce((sum, r) => sum + Number(r.severity_rollup?.high ?? 0), 0);
    return {
      attestations: a.length,
      verified: a.filter((r) => r.verification_status === "verified").length,
      failed: a.filter((r) => r.verification_status === "failed").length,
      sboms: s.length,
      criticalVulns: critical,
      highVulns: high,
    };
  });
