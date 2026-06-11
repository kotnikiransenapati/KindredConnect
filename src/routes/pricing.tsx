import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { SiteHeader } from "@/components/site/SiteHeader";
import { SiteFooter } from "@/components/site/SiteFooter";
import { Button } from "@/components/ui/button";
import { Check, Loader2 } from "lucide-react";
import { listPlans, startSubscription } from "@/lib/billing.functions";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/pricing")({
  head: () => ({
    meta: [
      { title: "Pricing — Foundry" },
      { name: "description", content: "Free to start. Upgrade for more AI credits, private projects, and team features." },
      { property: "og:title", content: "Pricing — Foundry" },
      { property: "og:description", content: "Simple, usage-based pricing for AI app building." },
    ],
  }),
  component: Pricing,
});

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void };
  }
}

function useRazorpayScript() {
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.Razorpay) { setLoaded(true); return; }
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.async = true;
    s.onload = () => setLoaded(true);
    document.body.appendChild(s);
  }, []);
  return loaded;
}

function Pricing() {
  const navigate = useNavigate();
  const fetchPlans = useServerFn(listPlans);
  const start = useServerFn(startSubscription);
  const razorpayReady = useRazorpayScript();

  const plansQ = useQuery({ queryKey: ["plans"], queryFn: () => fetchPlans() });

  const startMut = useMutation({
    mutationFn: async (planId: string) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { navigate({ to: "/auth" }); throw new Error("Sign in to upgrade"); }
      return start({ data: { planId } });
    },
    onSuccess: (res) => {
      if (!res.ok) { toast.info(res.message); return; }
      if (!window.Razorpay) { toast.error("Razorpay checkout not loaded"); return; }
      const rzp = new window.Razorpay({
        key: res.keyId,
        subscription_id: res.subscriptionId,
        name: "Foundry",
        description: "Subscription",
        theme: { color: "#7c3aed" },
        handler: () => {
          toast.success("Payment received. Activating subscription…");
          navigate({ to: "/app" });
        },
        modal: { ondismiss: () => toast.info("Checkout closed") },
      });
      rzp.open();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const plans = plansQ.data?.plans ?? [];

  return (
    <div className="min-h-screen flex flex-col">
      <SiteHeader />
      <main className="flex-1">
        <section className="relative">
          <div className="absolute inset-0 bg-aurora opacity-40" aria-hidden />
          <div className="relative mx-auto max-w-3xl px-6 pb-12 pt-24 text-center">
            <h1 className="font-display text-5xl font-semibold tracking-tight md:text-6xl">
              Pricing that scales <span className="text-gradient-brand">with you.</span>
            </h1>
            <p className="mx-auto mt-4 max-w-xl text-muted-foreground">Start free. Upgrade when you outgrow it.</p>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-6 pb-24">
          <div className="grid gap-6 md:grid-cols-3">
            {plans.map((p, i) => {
              const highlighted = i === 1;
              const isFree = p.price_inr_paise === 0;
              return (
                <div
                  key={p.id}
                  className={`relative rounded-2xl border bg-card/70 p-8 shadow-card backdrop-blur ${
                    highlighted ? "border-brand/60 ring-1 ring-brand/40" : "border-border/60"
                  }`}
                >
                  {highlighted && (
                    <div className="absolute -top-3 left-8 rounded-full bg-gradient-brand px-3 py-1 text-xs font-medium text-brand-foreground">
                      Most popular
                    </div>
                  )}
                  <div className="font-display text-2xl">{p.name}</div>
                  <div className="mt-6 flex items-baseline gap-1">
                    <span className="font-display text-5xl font-semibold">
                      {isFree ? "Free" : `₹${(p.price_inr_paise / 100).toLocaleString("en-IN")}`}
                    </span>
                    {!isFree && <span className="text-sm text-muted-foreground">/ {p.interval === "yearly" ? "year" : "month"}</span>}
                  </div>
                  {isFree ? (
                    <Button asChild className="mt-6 w-full" variant="outline">
                      <Link to="/auth">Get started</Link>
                    </Button>
                  ) : (
                    <Button
                      className={`mt-6 w-full ${highlighted ? "bg-gradient-brand text-brand-foreground" : ""}`}
                      variant={highlighted ? "default" : "outline"}
                      disabled={!razorpayReady || startMut.isPending}
                      onClick={() => startMut.mutate(p.id)}
                    >
                      {startMut.isPending && startMut.variables === p.id ? (
                        <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Starting…</>
                      ) : "Upgrade"}
                    </Button>
                  )}
                  <ul className="mt-8 space-y-3 text-sm">
                    {(p.features ?? []).map((f) => (
                      <li key={f} className="flex items-start gap-2">
                        <Check className="mt-0.5 h-4 w-4 text-brand" />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
          <p className="mt-10 text-center text-xs text-muted-foreground">
            Payments are processed securely by Razorpay. Prices in INR. You can cancel anytime.
          </p>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
