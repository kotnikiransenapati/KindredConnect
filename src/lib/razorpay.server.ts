// Server-only Razorpay REST client. Pure fetch — Worker-compatible.
// All calls authenticate with HTTP Basic (key_id:key_secret).
//
// Activation: set RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET
// in project secrets. Until then, `assertRazorpayConfigured` throws a clear
// error and prevents any payment call from going live.

import process from "node:process";

const BASE = "https://api.razorpay.com/v1";

export function getRazorpayCreds() {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  return { keyId, keySecret, configured: !!(keyId && keySecret) };
}

export function assertRazorpayConfigured(): { keyId: string; keySecret: string } {
  const { keyId, keySecret } = getRazorpayCreds();
  if (!keyId || !keySecret) {
    throw new Error(
      "Razorpay is not configured yet. Add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in project secrets to enable billing.",
    );
  }
  return { keyId, keySecret };
}

function authHeader() {
  const { keyId, keySecret } = assertRazorpayConfigured();
  const token = btoa(`${keyId}:${keySecret}`);
  return `Basic ${token}`;
}

async function rzp<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, headers, ...rest } = init;
  const res = await fetch(`${BASE}${path}`, {
    ...rest,
    headers: {
      Authorization: authHeader(),
      "Content-Type": "application/json",
      ...(headers ?? {}),
    },
    body: json !== undefined ? JSON.stringify(json) : (rest.body as BodyInit | undefined),
  });
  const text = await res.text();
  let parsed: unknown = null;
  try { parsed = text ? JSON.parse(text) : null; } catch { /* leave as text */ }
  if (!res.ok) {
    const err = (parsed as { error?: { description?: string } } | null)?.error?.description ?? text ?? res.statusText;
    throw new Error(`Razorpay ${res.status}: ${err}`);
  }
  return parsed as T;
}

// --- Customers ---
export interface RzpCustomer { id: string; email?: string; contact?: string; name?: string }
export function createCustomer(input: { name?: string; email?: string; contact?: string; notes?: Record<string, string> }) {
  return rzp<RzpCustomer>("/customers", { method: "POST", json: { ...input, fail_existing: 0 } });
}

// --- Subscriptions ---
export interface RzpSubscription {
  id: string;
  plan_id: string;
  customer_id?: string;
  status: string;
  current_start: number | null;
  current_end: number | null;
  short_url?: string;
}
export function createSubscription(input: {
  plan_id: string;
  customer_id?: string;
  total_count: number;
  notes?: Record<string, string>;
  notify_info?: { notify_email?: string };
}) {
  return rzp<RzpSubscription>("/subscriptions", { method: "POST", json: input });
}
export function cancelSubscription(subscriptionId: string, cancelAtCycleEnd = true) {
  return rzp<RzpSubscription>(`/subscriptions/${subscriptionId}/cancel`, {
    method: "POST",
    json: { cancel_at_cycle_end: cancelAtCycleEnd ? 1 : 0 },
  });
}
export function fetchSubscription(subscriptionId: string) {
  return rzp<RzpSubscription>(`/subscriptions/${subscriptionId}`, { method: "GET" });
}

// --- Webhook signature verification (HMAC-SHA256 over raw body) ---
export async function verifyWebhookSignature(rawBody: string, signature: string | null): Promise<boolean> {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret || !signature) return false;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sigBuf = await crypto.subtle.sign("HMAC", key, enc.encode(rawBody));
  const expected = Array.from(new Uint8Array(sigBuf)).map((b) => b.toString(16).padStart(2, "0")).join("");
  // Constant-time compare
  if (expected.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  return diff === 0;
}
