// Product analytics dashboard: totals, daily series, top events, funnels.
import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getAnalyticsOverview, computeFunnel, trackEvent } from "@/lib/analytics.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BarChart3, TrendingUp, Filter, Send } from "lucide-react";
import { toast } from "sonner";

export function AnalyticsPanel({ projectId }: { projectId: string }) {
  const [days, setDays] = useState(30);
  const fetchOverview = useServerFn(getAnalyticsOverview);
  const q = useQuery({
    queryKey: ["analytics", projectId, days],
    queryFn: () => fetchOverview({ data: { projectId, days } }),
    refetchInterval: 60_000,
  });
  const d = q.data;

  return (
    <section className="rounded-2xl border border-border/60 bg-card/70 p-4 shadow-card backdrop-blur">
      <header className="mb-3 flex items-center gap-2">
        <BarChart3 className="h-4 w-4 text-brand" />
        <h3 className="font-display text-sm font-semibold">Product analytics</h3>
        <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
          <SelectTrigger className="ml-auto h-7 w-24 text-[11px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {[7, 14, 30, 60, 90].map((n) => <SelectItem key={n} value={String(n)}>{n} days</SelectItem>)}
          </SelectContent>
        </Select>
      </header>

      {!d ? (
        <div className="h-32 animate-pulse rounded-lg border border-border/60 bg-card/40" />
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2">
            <Kpi label="Events" value={d.totals.events} />
            <Kpi label="Sessions" value={d.totals.sessions} />
            <Kpi label="Users" value={d.totals.users} />
          </div>

          <DailyChart daily={d.daily} />

          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <TopList title="Top events" rows={d.topEvents} />
            <TopList title="Top paths" rows={d.topPaths} mono />
            <TopList title="By country" rows={d.topCountries} />
          </div>

          <FunnelBuilder projectId={projectId} eventOptions={d.topEvents.map(([n]) => n)} />
          <DebugTracker projectId={projectId} />
        </>
      )}
    </section>
  );
}

function Kpi({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border/60 p-3">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold">{value.toLocaleString()}</p>
    </div>
  );
}

function DailyChart({ daily }: { daily: Array<{ day: string; event_name: string; count: number }> }) {
  // Aggregate per day across all events
  const byDay = new Map<string, number>();
  for (const r of daily) byDay.set(r.day, (byDay.get(r.day) ?? 0) + Number(r.count));
  const entries = Array.from(byDay.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  const max = Math.max(1, ...entries.map(([, v]) => v));

  if (entries.length === 0) return null;
  return (
    <div className="mt-4 rounded-lg border border-border/60 p-3">
      <p className="mb-2 text-[10px] uppercase tracking-wider text-muted-foreground">Daily volume</p>
      <div className="flex h-24 items-end gap-0.5">
        {entries.map(([day, v]) => (
          <div key={day} className="group relative flex-1" title={`${day}: ${v}`}>
            <div className="w-full rounded-sm bg-gradient-to-t from-brand/40 to-brand transition-all"
              style={{ height: `${(v / max) * 100}%` }} />
          </div>
        ))}
      </div>
    </div>
  );
}

function TopList({ title, rows, mono }: { title: string; rows: Array<[string, number]>; mono?: boolean }) {
  const max = Math.max(1, ...rows.map(([, v]) => v));
  return (
    <div className="rounded-lg border border-border/60 p-3">
      <p className="mb-2 text-[10px] uppercase tracking-wider text-muted-foreground">{title}</p>
      <div className="space-y-1.5">
        {rows.length === 0 && <p className="text-[11px] text-muted-foreground">No data</p>}
        {rows.map(([k, v]) => (
          <div key={k}>
            <div className="flex justify-between text-[11px]">
              <span className={`truncate ${mono ? "font-mono" : ""}`}>{k}</span>
              <span className="text-muted-foreground">{v}</span>
            </div>
            <div className="mt-0.5 h-1 overflow-hidden rounded bg-muted">
              <div className="h-full bg-brand" style={{ width: `${(v / max) * 100}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function FunnelBuilder({ projectId, eventOptions }: { projectId: string; eventOptions: string[] }) {
  const [steps, setSteps] = useState<string[]>([eventOptions[0] ?? "", eventOptions[1] ?? ""].filter(Boolean));
  const [stepInput, setStepInput] = useState("");
  const fn = useServerFn(computeFunnel);
  const mu = useMutation({
    mutationFn: () => fn({ data: { projectId, steps, days: 14 } }),
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="mt-4 rounded-lg border border-border/60 p-3">
      <div className="mb-2 flex items-center gap-2">
        <Filter className="h-3.5 w-3.5 text-brand" />
        <p className="text-[11px] font-semibold uppercase tracking-wider">Funnel builder</p>
      </div>
      <div className="mb-2 flex flex-wrap gap-1.5">
        {steps.map((s, i) => (
          <button key={i} onClick={() => setSteps(steps.filter((_, j) => j !== i))}
            className="rounded-full border border-brand/40 bg-brand/10 px-2 py-0.5 text-[11px] text-brand hover:bg-destructive/20">
            {i + 1}. {s} ×
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <Input list="funnel-events" value={stepInput} onChange={(e) => setStepInput(e.target.value)}
          placeholder="event_name" className="h-8 text-xs" />
        <datalist id="funnel-events">{eventOptions.map((e) => <option key={e} value={e} />)}</datalist>
        <Button size="sm" className="h-8 text-xs" disabled={!stepInput || steps.length >= 6}
          onClick={() => { setSteps([...steps, stepInput]); setStepInput(""); }}>Add</Button>
        <Button size="sm" variant="outline" className="h-8 text-xs"
          disabled={steps.length < 2 || mu.isPending}
          onClick={() => mu.mutate()}>
          <TrendingUp className="mr-1 h-3 w-3" />{mu.isPending ? "…" : "Run"}
        </Button>
      </div>
      {mu.data && (
        <div className="mt-3 space-y-1">
          {mu.data.steps.map((s: any, i: number) => (
            <div key={i} className="flex items-center gap-2 text-xs">
              <span className="w-6 text-muted-foreground">{i + 1}.</span>
              <span className="flex-1 truncate font-mono">{s.name}</span>
              <span className="tabular-nums">{s.count}</span>
              <span className="w-12 text-right text-muted-foreground">{(s.conversion * 100).toFixed(0)}%</span>
              {i > 0 && <span className="w-14 text-right text-destructive">−{(s.dropoff * 100).toFixed(0)}%</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DebugTracker({ projectId }: { projectId: string }) {
  const [name, setName] = useState("test_event");
  const fn = useServerFn(trackEvent);
  const mu = useMutation({
    mutationFn: () => fn({ data: { projectId, eventName: name, properties: { source: "debug" } } }),
    onSuccess: () => toast.success("Event tracked"),
    onError: (e: any) => toast.error(e.message),
  });
  return (
    <div className="mt-3 flex gap-2">
      <Input value={name} onChange={(e) => setName(e.target.value)} className="h-7 text-[11px]" placeholder="event name" />
      <Button size="sm" variant="ghost" className="h-7 text-[11px]" disabled={mu.isPending} onClick={() => mu.mutate()}>
        <Send className="mr-1 h-3 w-3" /> Track
      </Button>
    </div>
  );
}
