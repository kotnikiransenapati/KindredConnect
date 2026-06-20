// AI safety guardrails: PII redaction, prompt-injection, toxicity, topic filters,
// secret leak detection, rate caps. Pure-JS scanners — no external API needed.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const TypeEnum = z.enum([
  "pii_redact",
  "prompt_injection",
  "toxicity",
  "topic_filter",
  "rate_cap",
  "secret_leak",
]);
const ActionEnum = z.enum(["block", "warn", "redact"]);

const NameRx = /^[a-z0-9][a-z0-9_-]{1,49}$/i;

// ---------- Scanner ----------
type Hit = { pattern: string; severity: "low" | "medium" | "high" | "critical" };

const PII_PATTERNS: Array<{ name: string; rx: RegExp; severity: Hit["severity"] }> = [
  { name: "email", rx: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, severity: "medium" },
  { name: "ssn", rx: /\b\d{3}-\d{2}-\d{4}\b/g, severity: "critical" },
  { name: "credit_card", rx: /\b(?:\d[ -]?){13,19}\b/g, severity: "critical" },
  { name: "phone", rx: /\b(?:\+?\d{1,3}[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g, severity: "medium" },
  { name: "ipv4", rx: /\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d?\d)\b/g, severity: "low" },
];

const SECRET_PATTERNS: Array<{ name: string; rx: RegExp; severity: Hit["severity"] }> = [
  { name: "aws_access_key", rx: /\bAKIA[0-9A-Z]{16}\b/g, severity: "critical" },
  { name: "openai_key", rx: /\bsk-[A-Za-z0-9_-]{20,}\b/g, severity: "critical" },
  { name: "stripe_secret", rx: /\bsk_(?:live|test)_[A-Za-z0-9]{20,}\b/g, severity: "critical" },
  { name: "google_api_key", rx: /\bAIza[0-9A-Za-z_-]{35}\b/g, severity: "high" },
  { name: "github_token", rx: /\bghp_[A-Za-z0-9]{36}\b/g, severity: "critical" },
  { name: "jwt", rx: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, severity: "high" },
  { name: "pem_private_key", rx: /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/g, severity: "critical" },
];

const INJECTION_PATTERNS: Array<{ name: string; rx: RegExp; severity: Hit["severity"] }> = [
  { name: "ignore_previous", rx: /\bignore\s+(?:all\s+|the\s+)?(?:previous|prior|above)\s+(?:instructions|prompts?|rules)\b/gi, severity: "high" },
  { name: "system_override", rx: /\b(?:you\s+are\s+now|act\s+as|pretend\s+to\s+be)\s+(?:a\s+)?(?:DAN|jailbreak|unrestricted)/gi, severity: "high" },
  { name: "reveal_prompt", rx: /\b(?:reveal|show|print|output)\s+(?:your\s+)?(?:system\s+)?(?:prompt|instructions)\b/gi, severity: "medium" },
  { name: "role_swap", rx: /<\|im_start\|>|<\|system\|>|\[\[SYSTEM\]\]/g, severity: "high" },
  { name: "data_exfil", rx: /\b(?:send|post|exfiltrate|leak)\s+(?:all\s+)?(?:data|secrets?|keys?|credentials?)\s+to\b/gi, severity: "critical" },
];

const TOXICITY_PATTERNS: RegExp[] = [
  // intentionally generic — projects extend via topic_filter config
  /\b(?:kill\s+yourself|kys)\b/gi,
  /\b(?:i\s+hate\s+(?:all\s+)?)/gi,
];

function scanWith(text: string, list: { name: string; rx: RegExp; severity: Hit["severity"] }[]): Hit[] {
  const hits: Hit[] = [];
  for (const p of list) {
    p.rx.lastIndex = 0;
    if (p.rx.test(text)) hits.push({ pattern: p.name, severity: p.severity });
  }
  return hits;
}

function redactWith(text: string, list: { name: string; rx: RegExp }[]) {
  let out = text;
  for (const p of list) {
    out = out.replace(p.rx, (m) => `[${p.name.toUpperCase()}_REDACTED:${m.length}]`);
  }
  return out;
}

async function sha256Hex(s: string) {
  const buf = new TextEncoder().encode(s);
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ---------- CRUD ----------
export const listGuardrails = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ projectId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("ai_guardrails")
      .select("id, name, type, action, config, enabled, created_at, updated_at")
      .eq("project_id", data.projectId)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return { guardrails: rows ?? [] };
  });

export const upsertGuardrail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      id: z.string().uuid().optional(),
      projectId: z.string().uuid(),
      name: z.string().regex(NameRx, "letters, numbers, hyphen/underscore (2-50 chars)"),
      type: TypeEnum,
      action: ActionEnum,
      config: z.record(z.string(), z.any()).default({}),
      enabled: z.boolean().default(true),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    // Block-action redact is incoherent; coerce
    if (data.type === "pii_redact" && data.action === "block") {
      throw new Error("PII redaction rules should use action 'redact' or 'warn'.");
    }
    const payload = {
      project_id: data.projectId,
      name: data.name,
      type: data.type,
      action: data.action,
      config: data.config,
      enabled: data.enabled,
    };
    if (data.id) {
      const { data: row, error } = await context.supabase
        .from("ai_guardrails").update(payload).eq("id", data.id).select().single();
      if (error) throw error;
      return { guardrail: row };
    }
    const { data: row, error } = await context.supabase
      .from("ai_guardrails").insert(payload).select().single();
    if (error) {
      if (error.message.toLowerCase().includes("unique"))
        throw new Error("A guardrail with that name already exists in this project.");
      throw error;
    }
    return { guardrail: row };
  });

export const deleteGuardrail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("ai_guardrails").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

// ---------- Scan ----------
export const scanContent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      projectId: z.string().uuid(),
      content: z.string().min(1).max(20000),
      direction: z.enum(["input", "output"]).default("input"),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const ok = await context.supabase.rpc("check_rate_limit", {
      _user_id: context.userId, _bucket: "guardrail_scan", _window: "1 minute", _max: 120,
    });
    if (ok.data === false) throw new Error("Rate limit: too many scans.");

    const { data: rules, error } = await context.supabase
      .from("ai_guardrails")
      .select("id, name, type, action, config, enabled")
      .eq("project_id", data.projectId)
      .eq("enabled", true);
    if (error) throw error;

    const findings: Array<{
      guardrailId: string;
      name: string;
      type: string;
      severity: Hit["severity"];
      actionTaken: "block" | "warn" | "redact";
      patterns: string[];
    }> = [];
    let processed = data.content;
    let blocked = false;
    let blockReason: string | null = null;

    for (const rule of rules ?? []) {
      let hits: Hit[] = [];
      switch (rule.type) {
        case "pii_redact": {
          hits = scanWith(processed, PII_PATTERNS);
          if (hits.length && rule.action === "redact") processed = redactWith(processed, PII_PATTERNS);
          break;
        }
        case "secret_leak": {
          hits = scanWith(processed, SECRET_PATTERNS);
          if (hits.length && rule.action === "redact") processed = redactWith(processed, SECRET_PATTERNS);
          break;
        }
        case "prompt_injection": {
          hits = scanWith(processed, INJECTION_PATTERNS);
          break;
        }
        case "toxicity": {
          for (const rx of TOXICITY_PATTERNS) {
            rx.lastIndex = 0;
            if (rx.test(processed)) hits.push({ pattern: "toxicity", severity: "high" });
          }
          break;
        }
        case "topic_filter": {
          const banned: string[] = Array.isArray((rule.config as any)?.banned) ? (rule.config as any).banned : [];
          for (const term of banned) {
            if (typeof term !== "string" || !term.trim()) continue;
            const rx = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi");
            if (rx.test(processed)) hits.push({ pattern: `topic:${term}`, severity: "medium" });
          }
          break;
        }
        case "rate_cap": {
          // Enforced via check_rate_limit; record a soft hit if config requests visibility.
          const max = Number((rule.config as any)?.max ?? 60);
          const r = await context.supabase.rpc("check_rate_limit", {
            _user_id: context.userId,
            _bucket: `gr_${rule.id}`,
            _window: "1 minute",
            _max: Math.max(1, Math.min(max, 600)),
          });
          if (r.data === false) hits.push({ pattern: "rate_cap_exceeded", severity: "high" });
          break;
        }
      }

      if (!hits.length) continue;

      const maxSeverity = hits.reduce<Hit["severity"]>((a, h) =>
        sevRank(h.severity) > sevRank(a) ? h.severity : a, "low");

      if (rule.action === "block") { blocked = true; blockReason = blockReason ?? rule.name; }
      findings.push({
        guardrailId: rule.id,
        name: rule.name,
        type: rule.type,
        severity: maxSeverity,
        actionTaken: rule.action,
        patterns: hits.map((h) => h.pattern),
      });
    }

    if (findings.length) {
      const hash = await sha256Hex(data.content);
      const inserts = findings.map((f) => ({
        project_id: data.projectId,
        guardrail_id: f.guardrailId,
        guardrail_type: f.type as any,
        severity: f.severity,
        action_taken: f.actionTaken,
        content_hash: hash,
        snippet: data.content.slice(0, 280),
        matched_patterns: f.patterns,
        metadata: { direction: data.direction },
        actor_id: context.userId,
      }));
      await context.supabase.from("ai_guardrail_violations").insert(inserts as any);
    }

    return {
      allowed: !blocked,
      blockedBy: blockReason,
      output: blocked ? null : processed,
      findings,
    };
  });

function sevRank(s: Hit["severity"]) {
  return { low: 1, medium: 2, high: 3, critical: 4 }[s];
}

export const listGuardrailViolations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      projectId: z.string().uuid(),
      days: z.number().int().min(1).max(90).default(14),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const since = new Date(Date.now() - data.days * 86400_000).toISOString();
    const { data: rows, error } = await context.supabase
      .from("ai_guardrail_violations")
      .select("id, guardrail_id, guardrail_type, severity, action_taken, snippet, matched_patterns, metadata, occurred_at")
      .eq("project_id", data.projectId)
      .gte("occurred_at", since)
      .order("occurred_at", { ascending: false })
      .limit(500);
    if (error) throw error;
    return { violations: rows ?? [] };
  });
