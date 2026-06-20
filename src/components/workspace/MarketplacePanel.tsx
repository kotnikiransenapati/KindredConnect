import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  listMyListings, listActiveListings, upsertListing, deleteListing,
  createPurchaseIntent, listMyPurchases, listMyPayouts, simulatePurchaseSuccess,
} from "@/lib/marketplace.functions";
import { listTemplates } from "@/lib/templates.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Store, ShoppingCart, Wallet, Tag, Trash2 } from "lucide-react";
import { toast } from "sonner";

const fmt = (minor: number, cur: string) => new Intl.NumberFormat(undefined, { style: "currency", currency: cur }).format(minor / 100);

export function MarketplacePanel() {
  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2"><Store className="size-4" />Template Marketplace</CardTitle></CardHeader>
      <CardContent>
        <Tabs defaultValue="browse">
          <TabsList>
            <TabsTrigger value="browse"><ShoppingCart className="size-3 mr-1" />Browse</TabsTrigger>
            <TabsTrigger value="my-listings"><Tag className="size-3 mr-1" />My listings</TabsTrigger>
            <TabsTrigger value="purchases">Purchases</TabsTrigger>
            <TabsTrigger value="earnings"><Wallet className="size-3 mr-1" />Earnings</TabsTrigger>
          </TabsList>
          <TabsContent value="browse"><BrowseTab /></TabsContent>
          <TabsContent value="my-listings"><MyListingsTab /></TabsContent>
          <TabsContent value="purchases"><PurchasesTab /></TabsContent>
          <TabsContent value="earnings"><EarningsTab /></TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

function BrowseTab() {
  const qc = useQueryClient();
  const list = useServerFn(listActiveListings);
  const buy = useServerFn(createPurchaseIntent);
  const confirm = useServerFn(simulatePurchaseSuccess);
  const q = useQuery({ queryKey: ["mkt-active"], queryFn: () => list() });

  const buyM = useMutation({
    mutationFn: async (listingId: string) => {
      const intent = await buy({ data: { listingId } });
      // Dev: immediately confirm. Production: hand off to Stripe Elements.
      await confirm({ data: { purchaseId: intent.purchaseId } });
      return intent;
    },
    onSuccess: () => {
      toast.success("Purchase complete");
      qc.invalidateQueries({ queryKey: ["mkt-purchases"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {(q.data ?? []).map((l: any) => (
        <div key={l.id} className="border rounded-md p-3 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="font-medium">{l.templates.name}</div>
              <div className="text-xs text-muted-foreground line-clamp-2">{l.templates.description}</div>
            </div>
            <Badge variant="secondary">{fmt(l.price_minor, l.currency)}</Badge>
          </div>
          <Button size="sm" disabled={buyM.isPending} onClick={() => buyM.mutate(l.id)}>Buy</Button>
        </div>
      ))}
      {(q.data ?? []).length === 0 && <div className="text-sm text-muted-foreground">No paid templates available yet.</div>}
    </div>
  );
}

function MyListingsTab() {
  const qc = useQueryClient();
  const myL = useServerFn(listMyListings);
  const tpls = useServerFn(listTemplates);
  const up = useServerFn(upsertListing);
  const del = useServerFn(deleteListing);

  const listingsQ = useQuery({ queryKey: ["mkt-mine"], queryFn: () => myL() });
  const tplsQ = useQuery({
    queryKey: ["my-published-tpls"],
    queryFn: async () => {
      const r = await tpls().catch(() => ({ templates: [] as any[] }));
      return Array.isArray(r) ? r : (r?.templates ?? []);
    },
  });

  const [templateId, setTemplateId] = useState("");
  const [price, setPrice] = useState("999");
  const [currency, setCurrency] = useState("USD");
  const [status, setStatus] = useState<"active" | "paused">("active");

  const upM = useMutation({
    mutationFn: async () => up({ data: { templateId, priceMinor: parseInt(price, 10), currency, status } }),
    onSuccess: () => { toast.success("Listing saved"); qc.invalidateQueries({ queryKey: ["mkt-mine"] }); qc.invalidateQueries({ queryKey: ["mkt-active"] }); },
    onError: (e: any) => toast.error(e.message),
  });
  const delM = useMutation({
    mutationFn: async (id: string) => del({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["mkt-mine"] }),
  });

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        <Select value={templateId} onValueChange={setTemplateId}>
          <SelectTrigger><SelectValue placeholder="Template" /></SelectTrigger>
          <SelectContent>
            {(tplsQ.data ?? []).map((t: any) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input placeholder="Price (minor units)" value={price} onChange={(e) => setPrice(e.target.value)} />
        <Input placeholder="USD" value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} maxLength={3} />
        <Select value={status} onValueChange={(v) => setStatus(v as any)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="paused">Paused</SelectItem>
          </SelectContent>
        </Select>
        <Button disabled={!templateId || upM.isPending} onClick={() => upM.mutate()}>Save listing</Button>
      </div>
      <p className="text-xs text-muted-foreground">Platform fee 20%. You receive 80% of every sale.</p>
      <div className="space-y-2">
        {(listingsQ.data ?? []).map((l: any) => (
          <div key={l.id} className="flex items-center justify-between border rounded-md p-2 text-sm">
            <div>
              <div className="font-medium">{l.templates.name}</div>
              <div className="text-xs text-muted-foreground">{fmt(l.price_minor, l.currency)} · {l.status}</div>
            </div>
            <Button size="sm" variant="ghost" onClick={() => delM.mutate(l.id)}><Trash2 className="size-4" /></Button>
          </div>
        ))}
        {(listingsQ.data ?? []).length === 0 && <div className="text-sm text-muted-foreground">No listings yet. Publish a template first.</div>}
      </div>
    </div>
  );
}

function PurchasesTab() {
  const list = useServerFn(listMyPurchases);
  const q = useQuery({ queryKey: ["mkt-purchases"], queryFn: () => list() });
  return (
    <div className="space-y-2">
      {(q.data ?? []).map((p: any) => (
        <div key={p.id} className="flex items-center justify-between border rounded p-2 text-sm">
          <div>{p.templates.name}</div>
          <div className="flex items-center gap-2"><Badge variant={p.status === "succeeded" ? "secondary" : "outline"}>{p.status}</Badge><span>{fmt(p.amount_minor, p.currency)}</span></div>
        </div>
      ))}
      {(q.data ?? []).length === 0 && <div className="text-sm text-muted-foreground">No purchases yet.</div>}
    </div>
  );
}

function EarningsTab() {
  const list = useServerFn(listMyPayouts);
  const q = useQuery({ queryKey: ["mkt-payouts"], queryFn: () => list() });
  const summary = q.data?.summary ?? {};
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {Object.entries(summary).map(([cur, s]: [string, any]) => (
          <div key={cur} className="border rounded-md px-3 py-2 text-sm">
            <div className="text-xs text-muted-foreground">{cur} earnings</div>
            <div className="font-semibold">{fmt(s.net, cur)} <span className="text-xs text-muted-foreground">/ gross {fmt(s.gross, cur)}</span></div>
            <div className="text-xs">Paid out: {fmt(s.paid, cur)}</div>
          </div>
        ))}
        {Object.keys(summary).length === 0 && <div className="text-sm text-muted-foreground">No earnings yet.</div>}
      </div>
      <div className="space-y-1">
        {(q.data?.rows ?? []).map((r: any) => (
          <div key={r.id} className="flex items-center justify-between border rounded p-2 text-xs font-mono">
            <span>{new Date(r.created_at).toLocaleString()}</span>
            <span>gross {fmt(r.gross_minor, r.currency)} − fee {fmt(r.fee_minor, r.currency)} = <strong>{fmt(r.net_minor, r.currency)}</strong></span>
            <Badge variant={r.status === "paid" ? "secondary" : "outline"}>{r.status}</Badge>
          </div>
        ))}
      </div>
    </div>
  );
}
