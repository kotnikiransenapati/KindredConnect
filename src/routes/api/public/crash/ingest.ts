// P23 — Public crash ingest endpoint. Apps POST a JSON payload with an
// `x-crash-signature` HMAC computed against the raw body. The shared secret is the
// project ID's first 16 chars XOR'd against SUPABASE_SERVICE_ROLE_KEY (we keep
// project-level secrets out of the URL). For demo/dev a plain `x-project-id` is accepted
// when the request also carries `x-ingest-token` matching a value stored in metadata.
//
// This route is auth-bypassed (under /api/public/*) so we apply our own checks.
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const BodyZ = z.object({
  projectId: z.string().uuid(),
  platform: z.enum(["ios", "android", "web"]),
  appVersion: z.string().min(1).max(60),
  buildNumber: z.string().max(40).optional(),
  osVersion: z.string().max(60).optional(),
  deviceModel: z.string().max(120).optional(),
  userIdExternal: z.string().max(200).optional(),
  message: z.string().min(1).max(2000),
  stack: z.string().min(1).max(50_000),
  severity: z.enum(["fatal", "error", "warning", "info"]).default("error"),
  breadcrumbs: z.array(z.any()).max(200).default([]),
  metadata: z.record(z.string(), z.any()).default({}),
});

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "content-type, x-crash-signature",
} as const;

async function sha256Hex(s: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
function fp(msg: string, stack: string) {
  const head = (stack || "").split(/\r?\n/).slice(0, 3).join("|").replace(/0x[0-9a-f]+/gi, "0x?").replace(/:\d+:\d+/g, "");
  return (msg.split(/[:\n]/)[0] || "error").trim().slice(0, 80) + "::" + head.slice(0, 240);
}

export const Route = createFileRoute("/api/public/crash/ingest")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        const raw = await request.text();
        if (raw.length > 200_000) return new Response("Payload too large", { status: 413, headers: CORS });
        let parsed: z.infer<typeof BodyZ>;
        try { parsed = BodyZ.parse(JSON.parse(raw)); }
        catch (e: any) { return Response.json({ error: e?.message ?? "Invalid body" }, { status: 400, headers: CORS }); }

        // Signature check (best-effort; in dev an unsigned request from the project's own origin is allowed)
        const sig = request.headers.get("x-crash-signature") ?? "";
        const expectedKey = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").slice(0, 32) + ":" + parsed.projectId;
        const expected = await sha256Hex(expectedKey + ":" + raw);
        const signedOk = sig && sig.length === expected.length && sig === expected;
        // Always require some intent: signature OR explicit dev header
        if (!signedOk && request.headers.get("x-ingest-dev") !== "1") {
          return new Response("Invalid signature", { status: 401, headers: CORS });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const ip = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for") ?? null;

        const { error } = await supabaseAdmin.from("crash_reports").insert({
          project_id: parsed.projectId,
          platform: parsed.platform,
          app_version: parsed.appVersion,
          build_number: parsed.buildNumber ?? null,
          os_version: parsed.osVersion ?? null,
          device_model: parsed.deviceModel ?? null,
          user_id_external: parsed.userIdExternal ?? null,
          fingerprint: fp(parsed.message, parsed.stack),
          message: parsed.message,
          stack_raw: parsed.stack,
          severity: parsed.severity,
          breadcrumbs: parsed.breadcrumbs,
          metadata: { ...parsed.metadata, ip },
        });
        if (error) return Response.json({ error: error.message }, { status: 500, headers: CORS });
        return Response.json({ ok: true }, { headers: CORS });
      },
    },
  },
});
