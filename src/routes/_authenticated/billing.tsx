import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { SiteHeader } from "@/components/site/SiteHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getMySubscription, cancelMySubscription, listPlans, getMyUsage } from "@/lib/billing.functions";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/billing")({
  head: () => ({ meta: [{ title: "Billing — Foundry" }] }),
  component: Billing,
});

const statusVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  active: "default", pending: "secondary", past_due: "destructive",
  canceled: "outline", halted: "destructive", inactive: "outline",
};

function Billing() {
  const qc = useQueryClient();
  const fetchSub = useServerFn(getMySubscription);
  const fetchPlans = useServerFn(listPlans);
  const cancel = useServerFn(cancelMySubscription);
  const fetchUsage = useServerFn(getMyUsage);

  const subQ = useQuery({ queryKey: ["my-subscription"], queryFn: () => fetchSub() });
  const plansQ = useQuery({ queryKey: ["plans"], queryFn: () => fetchPlans() });
  const usageQ = useQuery({ queryKey: ["my-usage"], queryFn: () => fetchUsage(), refetchInterval: 30000 });

  const cancelMut = useMutation({
    mutationFn: () => cancel(),
    onSuccess: (r) => {
      if (!r.ok) { toast.info(r.message); return; }
      toast.success("Subscription will end at period close");
      qc.invalidateQueries({ queryKey: ["my-subscription"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const sub = subQ.data?.subscription;
  const plan = plansQ.data?.plans.find((p) => p.id === (sub?.plan_id ?? "hobby"));

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-6 py-10">
        <h1 className="font-display text-3xl font-semibold tracking-tight">Billing</h1>
        <p className="mt-1 text-sm text-muted-foreground">Manage your plan and payment.</p>

        <div className="mt-8 rounded-2xl border border-border/60 bg-card/60 p-6 shadow-card">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="text-sm text-muted-foreground">Current plan</div>
              <div className="mt-1 font-display text-2xl">{plan?.name ?? "Hobby"}</div>
            </div>
            <Badge variant={statusVariant[sub?.status ?? "inactive"]}>{sub?.status ?? "inactive"}</Badge>
          </div>

          <dl className="mt-6 grid gap-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">AI message quota</dt>
              <dd>{plan?.ai_message_quota?.toLocaleString() ?? 100} / month</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Renews on</dt>
              <dd>{sub?.current_period_end ? new Date(sub.current_period_end).toLocaleDateString() : "—"}</dd>
            </div>
          </dl>

          <div className="mt-8 flex flex-wrap gap-2">
            <Button asChild variant="outline"><Link to="/pricing">Change plan</Link></Button>
            {sub?.razorpay_subscription_id && sub.status === "active" && !sub.cancel_at_period_end && (
              <Button variant="destructive" onClick={() => cancelMut.mutate()} disabled={cancelMut.isPending}>
                Cancel at period end
              </Button>
            )}
            {sub?.cancel_at_period_end && (
              <p className="text-sm text-muted-foreground self-center">Cancels on {sub.current_period_end ? new Date(sub.current_period_end).toLocaleDateString() : "next renewal"}.</p>
            )}
          </div>
        </div>

        <section className="mt-10 rounded-2xl border border-border/60 bg-card/60 p-6 shadow-card">
          <div className="flex items-baseline justify-between">
            <h2 className="font-display text-xl">Usage — last 30 days</h2>
            <span className="text-xs text-muted-foreground">Auto-refreshing</span>
          </div>
          {usageQ.isLoading ? (
            <p className="mt-4 text-sm text-muted-foreground">Loading usage…</p>
          ) : (
            <>
              <dl className="mt-6 grid gap-4 sm:grid-cols-3">
                <div className="rounded-xl border border-border/60 bg-background/50 p-4">
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground">AI tokens</dt>
                  <dd className="mt-1 font-display text-2xl">{(usageQ.data?.totals.tokens ?? 0).toLocaleString()}</dd>
                </div>
                <div className="rounded-xl border border-border/60 bg-background/50 p-4">
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground">Requests</dt>
                  <dd className="mt-1 font-display text-2xl">{(usageQ.data?.totals.requests ?? 0).toLocaleString()}</dd>
                </div>
                <div className="rounded-xl border border-border/60 bg-background/50 p-4">
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground">Est. cost</dt>
                  <dd className="mt-1 font-display text-2xl">${(((usageQ.data?.totals.cost_cents ?? 0)) / 100).toFixed(2)}</dd>
                </div>
              </dl>

              {usageQ.data?.totals.byKind && Object.keys(usageQ.data.totals.byKind).length > 0 && (
                <div className="mt-6">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">Tokens by kind</div>
                  <div className="mt-2 space-y-1.5">
                    {Object.entries(usageQ.data.totals.byKind).map(([k, v]) => {
                      const max = Math.max(...Object.values(usageQ.data!.totals.byKind));
                      const pct = max > 0 ? (v / max) * 100 : 0;
                      return (
                        <div key={k} className="flex items-center gap-3 text-sm">
                          <span className="w-28 text-muted-foreground">{k}</span>
                          <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                            <div className="h-full bg-gradient-brand" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="w-20 text-right tabular-nums">{v.toLocaleString()}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {(usageQ.data?.recent.length ?? 0) > 0 && (
                <details className="mt-6">
                  <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground">Recent ledger entries</summary>
                  <ul className="mt-3 divide-y divide-border/60 text-sm">
                    {usageQ.data!.recent.map((r, i) => (
                      <li key={i} className="flex items-center justify-between py-2">
                        <span className="font-mono text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString()}</span>
                        <span>{r.kind}</span>
                        <span className="tabular-nums">{r.tokens.toLocaleString()} tok</span>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </>
          )}
        </section>
      </main>
    </div>
  );
}
