// Phase G5/G6/G7 — unified Foundry Finalize console: Monetization, Onboarding, Polish health.
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { Sparkles, Compass, ShieldCheck, RefreshCw } from "lucide-react";
import {
  listMonetizationPlans, seedDefaultMonetizationPlans, setPlanStatus,
  listOnboardingJourneys, seedDefaultJourneys, toggleJourney,
  listPolishReports, runPolishAudit,
} from "@/lib/foundry-finalize.functions";

interface Props { projectId: string }

export function FoundryFinalizePanel({ projectId }: Props) {
  const qc = useQueryClient();
  const [tab, setTab] = useState<"monetization" | "onboarding" | "polish">("monetization");

  const fnListPlans = useServerFn(listMonetizationPlans);
  const fnSeedPlans = useServerFn(seedDefaultMonetizationPlans);
  const fnSetPlanStatus = useServerFn(setPlanStatus);
  const fnListJourneys = useServerFn(listOnboardingJourneys);
  const fnSeedJourneys = useServerFn(seedDefaultJourneys);
  const fnToggleJourney = useServerFn(toggleJourney);
  const fnListReports = useServerFn(listPolishReports);
  const fnRunAudit = useServerFn(runPolishAudit);

  const plansQ = useQuery({ queryKey: ["foundry-plans", projectId], queryFn: () => fnListPlans({ data: { projectId } }) });
  const journeysQ = useQuery({ queryKey: ["foundry-journeys", projectId], queryFn: () => fnListJourneys({ data: { projectId } }) });
  const reportsQ = useQuery({ queryKey: ["foundry-polish", projectId], queryFn: () => fnListReports({ data: { projectId } }) });

  const seedPlans = useMutation({
    mutationFn: () => fnSeedPlans({ data: { projectId } }),
    onSuccess: () => { toast.success("Default plans seeded"); qc.invalidateQueries({ queryKey: ["foundry-plans", projectId] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const seedJourneys = useMutation({
    mutationFn: () => fnSeedJourneys({ data: { projectId } }),
    onSuccess: () => { toast.success("Default journeys seeded"); qc.invalidateQueries({ queryKey: ["foundry-journeys", projectId] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const runAudit = useMutation({
    mutationFn: () => fnRunAudit({ data: { projectId } }),
    onSuccess: () => { toast.success("Polish audit complete"); qc.invalidateQueries({ queryKey: ["foundry-polish", projectId] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const latest = reportsQ.data?.reports?.[0];

  return (
    <Card className="border-border/60">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="h-4 w-4 text-primary" /> Foundry Finalize
        </CardTitle>
        <Badge variant="outline" className="text-xs">Phase G5–G7</Badge>
      </CardHeader>
      <CardContent>
        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="monetization">Monetization</TabsTrigger>
            <TabsTrigger value="onboarding">Onboarding</TabsTrigger>
            <TabsTrigger value="polish">Polish</TabsTrigger>
          </TabsList>

          <TabsContent value="monetization" className="mt-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">Plans &amp; quotas shipped into your generated app.</p>
              <Button size="sm" onClick={() => seedPlans.mutate()} disabled={seedPlans.isPending}>
                Seed default plans
              </Button>
            </div>
            <div className="grid gap-2">
              {(plansQ.data?.plans ?? []).map((p) => (
                <div key={p.id as string} className="flex items-center justify-between rounded-md border border-border/60 p-3 text-sm">
                  <div>
                    <div className="font-medium">{p.name as string} <span className="text-xs text-muted-foreground">· {p.code as string}</span></div>
                    <div className="text-xs text-muted-foreground">${((p.price_cents as number) / 100).toFixed(2)} / {p.interval as string}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={p.status === "active" ? "default" : "outline"}>{p.status as string}</Badge>
                    <Button size="sm" variant="outline" onClick={() => fnSetPlanStatus({ data: { projectId, planId: p.id as string, status: p.status === "active" ? "archived" : "active" } }).then(() => qc.invalidateQueries({ queryKey: ["foundry-plans", projectId] }))}>
                      Toggle
                    </Button>
                  </div>
                </div>
              ))}
              {(plansQ.data?.plans ?? []).length === 0 && <p className="text-xs text-muted-foreground">No plans yet. Seed defaults to begin.</p>}
            </div>
          </TabsContent>

          <TabsContent value="onboarding" className="mt-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground flex items-center gap-1"><Compass className="h-3 w-3" /> End-user onboarding journeys.</p>
              <Button size="sm" onClick={() => seedJourneys.mutate()} disabled={seedJourneys.isPending}>Seed defaults</Button>
            </div>
            <div className="grid gap-2">
              {(journeysQ.data?.journeys ?? []).map((j) => (
                <div key={j.id as string} className="rounded-md border border-border/60 p-3 text-sm">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium">{j.name as string}</div>
                      <div className="text-xs text-muted-foreground">{(j.steps as unknown[])?.length ?? 0} steps · {j.audience as string}</div>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => fnToggleJourney({ data: { projectId, journeyId: j.id as string, enabled: !(j.enabled as boolean) } }).then(() => qc.invalidateQueries({ queryKey: ["foundry-journeys", projectId] }))}>
                      {j.enabled ? "Disable" : "Enable"}
                    </Button>
                  </div>
                </div>
              ))}
              {(journeysQ.data?.journeys ?? []).length === 0 && <p className="text-xs text-muted-foreground">No journeys yet.</p>}
            </div>
          </TabsContent>

          <TabsContent value="polish" className="mt-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground flex items-center gap-1"><ShieldCheck className="h-3 w-3" /> Production polish health (a11y, SEO, perf, UX, i18n).</p>
              <Button size="sm" onClick={() => runAudit.mutate()} disabled={runAudit.isPending}>
                <RefreshCw className="mr-1 h-3 w-3" /> Run audit
              </Button>
            </div>
            {latest ? (
              <div className="rounded-md border border-border/60 p-3 text-sm space-y-3">
                <div className="flex items-center justify-between">
                  <div className="font-medium">Score: {latest.score as number} <Badge variant="outline" className="ml-2">{latest.grade as string}</Badge></div>
                  <div className="text-xs text-muted-foreground">{new Date(latest.created_at as string).toLocaleString()}</div>
                </div>
                <Progress value={latest.score as number} />
                <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
                  {Object.entries((latest.category_scores as Record<string, number>) ?? {}).map(([k, v]) => (
                    <div key={k} className="rounded border border-border/40 p-2 text-xs">
                      <div className="text-muted-foreground capitalize">{k}</div>
                      <div className="font-semibold">{v}</div>
                    </div>
                  ))}
                </div>
                <div>
                  <div className="text-xs font-medium mb-1">Recommendations</div>
                  <ul className="list-disc pl-5 text-xs text-muted-foreground space-y-0.5">
                    {((latest.recommendations as string[]) ?? []).slice(0, 6).map((r, i) => <li key={i}>{r}</li>)}
                  </ul>
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">No audits yet. Run one to see polish scoring.</p>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
