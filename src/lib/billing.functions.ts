// Billing server functions: list plans, read current user's subscription,
// kick off a Razorpay subscription. Calls fail gracefully with a friendly
// message until Razorpay secrets are configured.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listPlans = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    // @ts-expect-error - plans table types regenerate after migration
    .from("plans")
    .select("id, name, price_inr_paise, interval, ai_message_quota, features, sort_order")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  if (error) throw new Error(error.message);
  return { plans: (data ?? []) as Array<{
    id: string; name: string; price_inr_paise: number; interval: string;
    ai_message_quota: number; features: string[]; sort_order: number;
  }> };
});

export const getMySubscription = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data } = await supabase
      // @ts-expect-error - subscriptions table types regenerate after migration
      .from("subscriptions")
      .select("id, plan_id, status, current_period_end, cancel_at_period_end, razorpay_subscription_id")
      .eq("user_id", userId)
      .maybeSingle();
    return { subscription: data as null | {
      id: string; plan_id: string; status: string;
      current_period_end: string | null; cancel_at_period_end: boolean;
      razorpay_subscription_id: string | null;
    } };
  });

export const startSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ planId: z.string().min(1).max(40) }).parse(d))
  .handler(async ({ data, context }) => {
    const { userId, claims } = context;
    const { getRazorpayCreds, createCustomer, createSubscription } = await import("@/lib/razorpay.server");

    const creds = getRazorpayCreds();
    if (!creds.configured) {
      return {
        ok: false as const,
        reason: "not_configured" as const,
        message: "Billing is not active yet. Razorpay credentials have not been set on the server.",
      };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Resolve plan (server-side price/plan-id lookup — never trust the client)
    const { data: plan, error: planErr } = await supabaseAdmin
      // @ts-expect-error - plans table types regenerate after migration
      .from("plans").select("id, razorpay_plan_id, price_inr_paise").eq("id", data.planId).maybeSingle();
    if (planErr || !plan) return { ok: false as const, reason: "invalid_plan" as const, message: "Plan not found." };
    if (!plan.razorpay_plan_id) {
      return {
        ok: false as const,
        reason: "plan_not_linked" as const,
        message: "This plan is not linked to Razorpay yet. An admin needs to create the matching Razorpay Plan and store its id.",
      };
    }

    // Get-or-create existing subscription row + Razorpay customer
    const { data: existing } = await supabaseAdmin
      // @ts-expect-error - subscriptions table types regenerate after migration
      .from("subscriptions").select("id, razorpay_customer_id, status").eq("user_id", userId).maybeSingle();

    let customerId = existing?.razorpay_customer_id as string | undefined;
    if (!customerId) {
      const email = (claims?.claims as { email?: string } | undefined)?.email;
      const customer = await createCustomer({ email, notes: { user_id: userId } });
      customerId = customer.id;
    }

    const sub = await createSubscription({
      plan_id: plan.razorpay_plan_id,
      customer_id: customerId,
      total_count: 12, // 12 billing cycles (1 year for monthly)
      notes: { user_id: userId, app_plan_id: plan.id },
    });

    // Upsert local subscription row in 'pending' state — webhook will flip to 'active'
    await supabaseAdmin
      // @ts-expect-error - subscriptions table types regenerate after migration
      .from("subscriptions").upsert({
        user_id: userId,
        plan_id: plan.id,
        status: "pending",
        razorpay_customer_id: customerId,
        razorpay_subscription_id: sub.id,
      }, { onConflict: "user_id" });

    return {
      ok: true as const,
      subscriptionId: sub.id,
      keyId: creds.keyId!,
      shortUrl: sub.short_url ?? null,
    };
  });

export const cancelMySubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const { getRazorpayCreds, cancelSubscription } = await import("@/lib/razorpay.server");
    if (!getRazorpayCreds().configured) {
      return { ok: false as const, message: "Billing is not active yet." };
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: sub } = await supabaseAdmin
      // @ts-expect-error - subscriptions table types regenerate after migration
      .from("subscriptions").select("razorpay_subscription_id").eq("user_id", userId).maybeSingle();
    if (!sub?.razorpay_subscription_id) return { ok: false as const, message: "No active subscription." };
    await cancelSubscription(sub.razorpay_subscription_id, true);
    await supabaseAdmin
      // @ts-expect-error - subscriptions table types regenerate after migration
      .from("subscriptions").update({ cancel_at_period_end: true }).eq("user_id", userId);
    return { ok: true as const };
  });
