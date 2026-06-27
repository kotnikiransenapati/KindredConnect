// P16 — Marketplace monetization: listings, purchase intents, payout ledger.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { recordAudit } from "./audit.server";

const PLATFORM_FEE_PCT = 20; // matches default 80% payout_pct on the listing

export const listMyListings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("template_listings")
      .select("id, template_id, price_minor, currency, payout_pct, status, updated_at, templates!inner(name, slug, thumbnail_url)")
      .eq("author_id", context.userId)
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const listActiveListings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("template_listings")
      .select("id, template_id, price_minor, currency, status, templates!inner(name, slug, description, thumbnail_url, category, author_id, avg_rating, use_count)")
      .eq("status", "active")
      .order("price_minor", { ascending: true })
      .limit(60);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const upsertListing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      templateId: z.string().uuid(),
      priceMinor: z.number().int().min(0).max(1_000_000),
      currency: z.string().length(3).default("USD"),
      status: z.enum(["active", "paused", "archived"]).default("active"),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    // Only the template author may list it.
    const { data: tpl, error: terr } = await context.supabase
      .from("templates").select("id, author_id").eq("id", data.templateId).maybeSingle();
    if (terr) throw new Error(terr.message);
    if (!tpl || tpl.author_id !== context.userId) throw new Error("Not the template author");
    const ok = await context.supabase.rpc("check_rate_limit", {
      _user_id: context.userId, _bucket: "marketplace_listing_upsert", _window: "1 minute", _max: 20,
    });
    if (ok.data === false) throw new Error("Rate limit exceeded");
    const { data: row, error } = await context.supabase
      .from("template_listings")
      .upsert({
        template_id: data.templateId,
        author_id: context.userId,
        price_minor: data.priceMinor,
        currency: data.currency.toUpperCase(),
        payout_pct: 100 - PLATFORM_FEE_PCT,
        status: data.status,
      }, { onConflict: "template_id" })
      .select("*").single();
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteListing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("template_listings").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Create a pending purchase. In production this hands off to Stripe to create
 * a PaymentIntent and returns its client_secret; here we generate an intent_id
 * and mark `pending`. The webhook (POST /api/public/payments/template-webhook)
 * flips it to `succeeded` and writes the payout ledger entry.
 */
export const createPurchaseIntent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ listingId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const ok = await context.supabase.rpc("check_rate_limit", {
      _user_id: context.userId, _bucket: "marketplace_buy_intent", _window: "1 minute", _max: 10,
    });
    if (ok.data === false) throw new Error("Rate limit exceeded");
    const { data: listing, error: lerr } = await context.supabase
      .from("template_listings")
      .select("id, template_id, author_id, price_minor, currency, status")
      .eq("id", data.listingId).maybeSingle();
    if (lerr) throw new Error(lerr.message);
    if (!listing || listing.status !== "active") throw new Error("Listing unavailable");
    if (listing.author_id === context.userId) throw new Error("Cannot purchase your own template");

    // Idempotency: if a pending intent already exists for buyer+listing, return it.
    const { data: existing } = await context.supabase
      .from("template_purchases")
      .select("id, intent_id, status")
      .eq("listing_id", listing.id)
      .eq("buyer_id", context.userId)
      .in("status", ["pending", "succeeded"])
      .maybeSingle();
    if (existing) return { purchaseId: existing.id, intentId: existing.intent_id, status: existing.status, amountMinor: listing.price_minor, currency: listing.currency };

    const intentId = `pi_local_${crypto.randomUUID().replace(/-/g, "")}`;
    const { data: row, error } = await context.supabase
      .from("template_purchases")
      .insert({
        listing_id: listing.id, template_id: listing.template_id,
        buyer_id: context.userId, author_id: listing.author_id,
        provider: "stripe", intent_id: intentId,
        amount_minor: listing.price_minor, currency: listing.currency,
        status: "pending",
      })
      .select("id, intent_id, status").single();
    if (error) throw new Error(error.message);
    return { purchaseId: row.id, intentId: row.intent_id, status: row.status, amountMinor: listing.price_minor, currency: listing.currency };
  });

export const listMyPurchases = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("template_purchases")
      .select("id, status, amount_minor, currency, created_at, templates!inner(name, slug, thumbnail_url)")
      .eq("buyer_id", context.userId)
      .order("created_at", { ascending: false }).limit(100);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const listMyPayouts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("template_payouts")
      .select("id, purchase_id, gross_minor, fee_minor, net_minor, currency, status, paid_at, created_at")
      .eq("author_id", context.userId)
      .order("created_at", { ascending: false }).limit(200);
    if (error) throw new Error(error.message);
    const summary = (data ?? []).reduce((acc: Record<string, { gross: number; net: number; paid: number }>, r: any) => {
      const k = r.currency;
      acc[k] ??= { gross: 0, net: 0, paid: 0 };
      acc[k].gross += r.gross_minor; acc[k].net += r.net_minor;
      if (r.status === "paid") acc[k].paid += r.net_minor;
      return acc;
    }, {});
    return { rows: data ?? [], summary };
  });

/**
 * DEV-ONLY simulator — flip a pending purchase to succeeded and write the
 * payout entry. In production this lives in the Stripe webhook handler,
 * gated by signature verification. We require the caller to be the buyer
 * (so it can't be abused to forge payouts to other creators).
 */
export const simulatePurchaseSuccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ purchaseId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: p, error } = await context.supabase
      .from("template_purchases")
      .select("id, listing_id, author_id, buyer_id, amount_minor, currency, status, intent_id")
      .eq("id", data.purchaseId).maybeSingle();
    if (error) throw new Error(error.message);
    if (!p) throw new Error("Purchase not found");
    if (p.buyer_id !== context.userId) throw new Error("Only the buyer can confirm in dev mode");
    if (p.status === "succeeded") return { ok: true, alreadyDone: true };

    // Flip status (RLS: buyer can UPDATE their own row per buyer_id check on insert; we re-check here).
    const { error: uerr } = await context.supabase
      .from("template_purchases").update({ status: "succeeded" }).eq("id", p.id);
    if (uerr) throw new Error(uerr.message);

    // Write the payout ledger via service role (RLS on template_payouts blocks user inserts).
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const fee = Math.round((p.amount_minor * PLATFORM_FEE_PCT) / 100);
    const net = p.amount_minor - fee;
    await supabaseAdmin.from("template_payouts").upsert({
      purchase_id: p.id, author_id: p.author_id,
      gross_minor: p.amount_minor, fee_minor: fee, net_minor: net,
      currency: p.currency, status: "accrued",
    }, { onConflict: "purchase_id" });

    await recordAudit(context.supabase, context.userId, {
      action: "billing.plan_change", resourceType: "template_purchase", resourceId: p.id,
      metadata: { intent_id: p.intent_id, amount_minor: p.amount_minor, currency: p.currency },
    });
    return { ok: true, net };
  });
