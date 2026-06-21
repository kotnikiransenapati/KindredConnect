import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  listUsageMeters, upsertUsageMeter, deleteUsageMeter,
  trackUsage, rollupUsage, getPeriodTotals,
  generateInvoice, listInvoices, setInvoiceStatus,
} from "@/lib/usage-metering.functions";
import { listMyOrganizations } from "@/lib/organizations.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Gauge, Trash2, RefreshCw, Receipt, PlayCircle } from "lucide-react";
import { toast } from "sonner";

function fmtCents(c: number, cur = "usd") {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: cur.toUpperCase() }).format((c ?? 0) / 100);
}
function todayISO(offsetDays = 0) {
  return new Date(Date.now() + offsetDays * 86400_000).toISOString().slice(0, 10);
}

export function UsageMeteringPanel() {
  const list = useServerFn(listMyOrganizations);
  const orgsQ = useQuery({ queryKey: ["orgs"], queryFn: () => list() });
  const orgs = useMemo(() => {
    const raw: any = orgsQ.data;
    const all = Array.isArray(raw) ? raw : (raw?.organizations ?? []);
    return all.filter((o: any) => ["owner", "admin"].includes(o.role));
  }, [orgsQ.data]);
  const [orgId, setOrgId] = useState<string>("");
  useEffect(() => { if (!orgId && orgs[0]) setOrgId(orgs[0].id); }, [orgs, orgId]);

  if (orgsQ.isLoading) return null;
  if (!orgs.length) {
    return (
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Gauge className="size-4" />Usage Metering & Billing</CardTitle></CardHeader>
        <CardContent className="text-sm text-muted-foreground">Create an organization to define meters and generate usage-based invoices.</CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle className="flex items-center gap-2"><Gauge className="size-4" />Usage Metering & Billing</CardTitle>
        <Select value={orgId} onValueChange={setOrgId}>
          <SelectTrigger className="w-[220px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {orgs.map((o: any) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent>{orgId && <Body orgId={orgId} />}</CardContent>
    </Card>
  );
}

function Body({ orgId }: { orgId: string }) {
  const qc = useQueryClient();
  const listM = useServerFn(listUsageMeters);
  const upsert = useServerFn(upsertUsageMeter);
  const del = useServerFn(deleteUsageMeter);
  const track = useServerFn(trackUsage);
  const rollup = useServerFn(rollupUsage);
  const totalsFn = useServerFn(getPeriodTotals);
  const invFn = useServerFn(generateInvoice);
  const listInv = useServerFn(listInvoices);
  const setStatus = useServerFn(setInvoiceStatus);

  const metersQ = useQuery({ queryKey: ["meters", orgId], queryFn: () => listM({ data: { orgId } }) });
  const [from, setFrom] = useState(todayISO(-30));
  const [to, setTo] = useState(todayISO());
  const totalsQ = useQuery({ queryKey: ["totals", orgId, from, to], queryFn: () => totalsFn({ data: { orgId, from, to } }) });
  const invoicesQ = useQuery({ queryKey: ["invoices", orgId], queryFn: () => listInv({ data: { orgId } }) });

  const [form, setForm] = useState({ metricKey: "", displayName: "", unit: "unit", pricePerUnitCents: 0, includedQuota: 0, hardCap: "" });

  const upsertM = useMutation({
    mutationFn: (vars: any) => upsert({ data: vars }),
    onSuccess: () => { toast.success("Meter saved"); qc.invalidateQueries({ queryKey: ["meters", orgId] }); setForm({ metricKey: "", displayName: "", unit: "unit", pricePerUnitCents: 0, includedQuota: 0, hardCap: "" }); },
    onError: (e: any) => toast.error(e.message),
  });
  const delM = useMutation({
    mutationFn: (id: string) => del({ data: { id, orgId } }),
    onSuccess: () => { toast.success("Deleted"); qc.invalidateQueries({ queryKey: ["meters", orgId] }); },
    onError: (e: any) => toast.error(e.message),
  });
  const rollM = useMutation({
    mutationFn: () => rollup({ data: { orgId, from, to } }),
    onSuccess: (r: any) => { toast.success(`Rolled ${r.rolled} buckets from ${r.events} events`); qc.invalidateQueries({ queryKey: ["totals", orgId, from, to] }); },
    onError: (e: any) => toast.error(e.message),
  });
  const genInv = useMutation({
    mutationFn: () => invFn({ data: { orgId, from, to, currency: "usd" } }),
    onSuccess: () => { toast.success("Invoice generated"); qc.invalidateQueries({ queryKey: ["invoices", orgId] }); },
    onError: (e: any) => toast.error(e.message),
  });
  const trackM = useMutation({
    mutationFn: (v: { metricKey: string; quantity: number }) =>
      track({ data: { orgId, metricKey: v.metricKey, quantity: v.quantity, idempotencyKey: crypto.randomUUID() } }),
    onSuccess: () => { toast.success("Event recorded"); qc.invalidateQueries({ queryKey: ["totals", orgId, from, to] }); },
    onError: (e: any) => toast.error(e.message),
  });
  const statusM = useMutation({
    mutationFn: (v: { id: string; status: "draft" | "issued" | "paid" | "void" }) =>
      setStatus({ data: { id: v.id, orgId, status: v.status } }),
    onSuccess: () => { toast.success("Invoice updated"); qc.invalidateQueries({ queryKey: ["invoices", orgId] }); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Tabs defaultValue="meters">
      <TabsList>
        <TabsTrigger value="meters">Meters</TabsTrigger>
        <TabsTrigger value="usage">Usage</TabsTrigger>
        <TabsTrigger value="invoices">Invoices</TabsTrigger>
      </TabsList>

      <TabsContent value="meters" className="space-y-3">
        <div className="grid gap-2 md:grid-cols-6 items-end rounded-lg border border-border/60 p-3">
          <div><Label className="text-xs">metric_key</Label><Input value={form.metricKey} onChange={(e) => setForm({ ...form, metricKey: e.target.value })} placeholder="api.requests" /></div>
          <div><Label className="text-xs">Display name</Label><Input value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} placeholder="API requests" /></div>
          <div><Label className="text-xs">Unit</Label><Input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} /></div>
          <div><Label className="text-xs">Price (¢/unit)</Label><Input type="number" min={0} value={form.pricePerUnitCents} onChange={(e) => setForm({ ...form, pricePerUnitCents: Number(e.target.value) })} /></div>
          <div><Label className="text-xs">Included quota</Label><Input type="number" min={0} value={form.includedQuota} onChange={(e) => setForm({ ...form, includedQuota: Number(e.target.value) })} /></div>
          <div className="flex gap-2">
            <Input className="flex-1" type="number" placeholder="Hard cap (opt)" value={form.hardCap} onChange={(e) => setForm({ ...form, hardCap: e.target.value })} />
            <Button onClick={() => upsertM.mutate({ orgId, ...form, hardCap: form.hardCap === "" ? null : Number(form.hardCap), aggregation: "sum", enabled: true })} disabled={!form.metricKey || !form.displayName}>Save</Button>
          </div>
        </div>
        <div className="space-y-1">
          {(metersQ.data ?? []).map((m: any) => (
            <div key={m.id} className="flex items-center gap-3 rounded border border-border/60 p-2 text-sm">
              <div className="flex-1">
                <div className="font-mono text-xs">{m.metric_key}</div>
                <div className="text-muted-foreground">{m.display_name} · {m.unit} · {fmtCents(m.price_per_unit_cents)}/unit · included {m.included_quota}{m.hard_cap != null && ` · cap ${m.hard_cap}`}</div>
              </div>
              <Badge variant={m.enabled ? "default" : "secondary"}>{m.enabled ? "enabled" : "disabled"}</Badge>
              <Button size="sm" variant="outline" onClick={() => trackM.mutate({ metricKey: m.metric_key, quantity: 1 })}><PlayCircle className="size-3.5" /></Button>
              <Button size="sm" variant="ghost" onClick={() => delM.mutate(m.id)}><Trash2 className="size-3.5" /></Button>
            </div>
          ))}
          {!metersQ.data?.length && <div className="text-sm text-muted-foreground">No meters yet.</div>}
        </div>
      </TabsContent>

      <TabsContent value="usage" className="space-y-3">
        <div className="flex flex-wrap items-end gap-2 rounded-lg border border-border/60 p-3">
          <div><Label className="text-xs">From</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
          <div><Label className="text-xs">To</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
          <Button variant="outline" onClick={() => rollM.mutate()}><RefreshCw className="mr-1 size-3.5" />Roll up</Button>
          <Button onClick={() => genInv.mutate()}><Receipt className="mr-1 size-3.5" />Generate invoice</Button>
        </div>
        <div className="overflow-hidden rounded border border-border/60">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
              <tr><th className="p-2">Metric</th><th className="p-2">Total</th><th className="p-2">Events</th></tr>
            </thead>
            <tbody>
              {(totalsQ.data ?? []).map((r: any) => (
                <tr key={r.metric_key} className="border-t border-border/60">
                  <td className="p-2 font-mono text-xs">{r.metric_key}</td>
                  <td className="p-2">{Number(r.total).toLocaleString()}</td>
                  <td className="p-2 text-muted-foreground">{r.event_count}</td>
                </tr>
              ))}
              {!totalsQ.data?.length && <tr><td colSpan={3} className="p-3 text-center text-muted-foreground">No usage in this window.</td></tr>}
            </tbody>
          </table>
        </div>
      </TabsContent>

      <TabsContent value="invoices" className="space-y-2">
        {(invoicesQ.data ?? []).map((inv: any) => (
          <div key={inv.id} className="rounded border border-border/60 p-3">
            <div className="flex items-center justify-between gap-2 text-sm">
              <div>
                <div className="font-medium">{inv.period_start} → {inv.period_end}</div>
                <div className="text-muted-foreground">Subtotal {fmtCents(inv.subtotal_cents, inv.currency)} · {(inv.line_items as any[])?.length ?? 0} line items</div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={inv.status === "paid" ? "default" : inv.status === "void" ? "destructive" : "secondary"}>{inv.status}</Badge>
                <Select value={inv.status} onValueChange={(v: any) => statusM.mutate({ id: inv.id, status: v })}>
                  <SelectTrigger className="h-8 w-[110px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["draft", "issued", "paid", "void"].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <details className="mt-2 text-xs">
              <summary className="cursor-pointer text-muted-foreground">Line items</summary>
              <table className="mt-1 w-full">
                <tbody>
                  {(inv.line_items as any[]).map((li, i) => (
                    <tr key={i} className="border-t border-border/60">
                      <td className="p-1 font-mono">{li.metric_key}</td>
                      <td className="p-1">{li.quantity} {li.unit}</td>
                      <td className="p-1 text-muted-foreground">billable {li.billable_quantity}</td>
                      <td className="p-1 text-right">{fmtCents(li.amount_cents, inv.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          </div>
        ))}
        {!invoicesQ.data?.length && <div className="text-sm text-muted-foreground">No invoices yet.</div>}
      </TabsContent>
    </Tabs>
  );
}
