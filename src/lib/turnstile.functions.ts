import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Verify a Cloudflare Turnstile token. No-op (returns ok:true) when
 * TURNSTILE_SECRET_KEY is not configured, so signup still works in dev /
 * unconfigured environments.
 */
export const verifyTurnstile = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ token: z.string().max(2048).optional() }).parse(d))
  .handler(async ({ data }) => {
    const secret = process.env.TURNSTILE_SECRET_KEY;
    if (!secret) return { ok: true, skipped: true };
    if (!data.token) return { ok: false, error: "Missing captcha token" };
    const form = new FormData();
    form.append("secret", secret);
    form.append("response", data.token);
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: form });
    const json = (await res.json()) as { success: boolean; "error-codes"?: string[] };
    if (!json.success) return { ok: false, error: (json["error-codes"] ?? ["captcha_failed"]).join(",") };
    return { ok: true, skipped: false };
  });
