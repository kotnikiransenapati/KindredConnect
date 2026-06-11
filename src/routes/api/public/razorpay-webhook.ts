// Razorpay webhook receiver. Public endpoint — verifies HMAC signature
// before doing ANY work. Idempotent via payment_events (provider, event_id)
// unique constraint.
//
// Configure in Razorpay Dashboard → Settings → Webhooks:
//   URL:    https://<your-domain>/api/public/razorpay-webhook
//   Secret: same value stored as RAZORPAY_WEBHOOK_SECRET
//   Events: subscription.activated, subscription.charged, subscription.completed,
//           subscription.cancelled, subscription.halted, subscription.pending,
//           payment.failed

import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/razorpay-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const rawBody = await request.text();
        const signature = request.headers.get("x-razorpay-signature");

        const { verifyWebhookSignature } = await import("@/lib/razorpay.server");
        const ok = await verifyWebhookSignature(rawBody, signature);
        if (!ok) return new Response("Invalid signature", { status: 401 });

        let payload: {
          event: string;
          payload?: {
            subscription?: { entity?: { id?: string; status?: string; current_start?: number; current_end?: number; notes?: Record<string, string> } };
            payment?: { entity?: { id?: string; status?: string } };
          };
          created_at?: number;
        };
        try { payload = JSON.parse(rawBody); }
        catch { return new Response("Invalid JSON", { status: 400 }); }

        const event = payload.event;
        const eventId = `${event}:${payload.created_at ?? ""}:${payload.payload?.subscription?.entity?.id ?? payload.payload?.payment?.entity?.id ?? ""}`;
        const sub = payload.payload?.subscription?.entity;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Idempotency check
        const { data: prior } = await supabaseAdmin
          .from("payment_events").select("id").eq("provider", "razorpay").eq("event_id", eventId).maybeSingle();
        if (prior) return new Response("ok", { status: 200 });

        // Map event → subscription status
        const statusMap: Record<string, string> = {
          "subscription.activated": "active",
          "subscription.charged": "active",
          "subscription.completed": "canceled",
          "subscription.cancelled": "canceled",
          "subscription.halted": "halted",
          "subscription.pending": "past_due",
        };
        const newStatus = statusMap[event];

        let userId: string | null = null;
        if (sub?.id && newStatus) {
          const updates: {
            status: string;
            current_period_start?: string;
            current_period_end?: string;
          } = { status: newStatus };
          if (sub.current_start) updates.current_period_start = new Date(sub.current_start * 1000).toISOString();
          if (sub.current_end) updates.current_period_end = new Date(sub.current_end * 1000).toISOString();
          const { data: row } = await supabaseAdmin
            .from("subscriptions").update(updates).eq("razorpay_subscription_id", sub.id).select("id, user_id").maybeSingle();
          userId = row?.user_id ?? null;
        }

        await supabaseAdmin.from("payment_events").insert({
          provider: "razorpay",
          event_id: eventId,
          event_type: event,
          user_id: userId,
          payload: payload as never,
        });

        return new Response("ok", { status: 200 });
      },
    },
  },
});
