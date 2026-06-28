import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  createMarketplaceListing,
  generateProductDocs,
  listLaunchRunbooks,
  listMarketplaceListings,
  listProductDocs,
  publishMarketplaceListing,
  recordRunbookDrill,
  seedLaunchRunbooks,
  updateProductDoc,
} from "@/lib/foundry-launch.functions";
import { ALL_ARTIFACT_KINDS, type ArtifactKind } from "@/lib/foundry-launch.shared";
import { BookOpen, Package, Rocket, ShieldAlert, Loader2 } from "lucide-react";
import { toast } from "sonner";

type DocRow = { id: string; kind: string; slug: string; title: string; content_md: string; word_count: number; source: string };
type ListingRow = { id: string; artifact_kind: string; slug: string; name: string; version: string; visibility: string; status: string };
type RunbookRow = { id: string; scenario: string; severity: string; title: string; sla_minutes: number; last_drilled_at: string | null };

export function FoundryLaunchCenterPanel({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const docsFn = useServerFn(listProductDocs);
  const mpFn = useServerFn(listMarketplaceListings);
  const rbFn = useServerFn(listLaunchRunbooks);

  const docsQ = useQuery({ queryKey: ["foundry-docs", projectId], queryFn: () => docsFn({ data: { projectId } }) });
  const mpQ = useQuery({ queryKey: ["foundry-mp", projectId], queryFn: () => mpFn({ data: { projectId } }) });
  const rbQ = useQuery({ queryKey: ["foundry-rb", projectId], queryFn: () => rbFn({ data: { projectId } }) });

  const genDocs = useServerFn(generateProductDocs);
  const updDoc = useServerFn(updateProductDoc);
  const seedRb = useServerFn(seedLaunchRunbooks);
  const drillRb = useServerFn(recordRunbookDrill);
  const createMp = useServerFn(createMarketplaceListing);
  const publishMp = useServerFn(publishMarketplaceListing);

  const mGen = useMutation({
    mutationFn: () => genDocs({ data: { projectId } }),
    onSuccess: (r) => { toast.success(`Generated ${r.generated} docs`); qc.invalidateQueries({ queryKey: ["foundry-docs", projectId] }); },
    onError: (e) => toast.error((e as Error).message),
  });
  const mSave = useMutation({
    mutationFn: (v: { docId: string; contentMd: string }) => updDoc({ data: { projectId, ...v } }),
    onSuccess: () => { toast.success("Doc saved"); qc.invalidateQueries({ queryKey: ["foundry-docs", projectId] }); },
    onError: (e) => toast.error((e as Error).message),
  });
  const mSeed = useMutation({
    mutationFn: () => seedRb({ data: { projectId } }),
    onSuccess: (r) => { toast.success(`Seeded ${r.seeded} runbooks`); qc.invalidateQueries({ queryKey: ["foundry-rb", projectId] }); },
    onError: (e) => toast.error((e as Error).message),
  });
  const mDrill = useMutation({
    mutationFn: (id: string) => drillRb({ data: { projectId, runbookId: id } }),
    onSuccess: () => { toast.success("Drill recorded"); qc.invalidateQueries({ queryKey: ["foundry-rb", projectId] }); },
    onError: (e) => toast.error((e as Error).message),
  });
  const mPub = useMutation({
    mutationFn: (v: { listingId: string; status: "draft" | "review" | "published" | "deprecated" }) => publishMp({ data: { projectId, ...v } }),
    onSuccess: () => { toast.success("Listing updated"); qc.invalidateQueries({ queryKey: ["foundry-mp", projectId] }); },
    onError: (e) => toast.error((e as Error).message),
  });

  const [form, setForm] = useState<{ artifactKind: ArtifactKind; name: string; slug: string; version: string }>({
    artifactKind: "extension", name: "", slug: "", version: "0.1.0",
  });
  const mCreate = useMutation({
    mutationFn: () => createMp({ data: { projectId, ...form } }),
    onSuccess: () => { toast.success("Listing created"); qc.invalidateQueries({ queryKey: ["foundry-mp", projectId] }); setForm({ artifactKind: "extension", name: "", slug: "", version: "0.1.0" }); },
    onError: (e) => toast.error((e as Error).message),
  });

  const [editing, setEditing] = useState<Record<string, string>>({});

  return (
    <Card className="border-primary/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Rocket className="size-5 text-primary" /> Foundry Launch Center</CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="docs">
          <TabsList className="grid grid-cols-3 w-full">
            <TabsTrigger value="docs"><BookOpen className="size-4 mr-2" />Docs</TabsTrigger>
            <TabsTrigger value="marketplace"><Package className="size-4 mr-2" />Marketplace v2</TabsTrigger>
            <TabsTrigger value="runbooks"><ShieldAlert className="size-4 mr-2" />Runbooks</TabsTrigger>
          </TabsList>

          <TabsContent value="docs" className="space-y-3 mt-4">
            <div className="flex justify-between items-center">
              <p className="text-sm text-muted-foreground">Auto-generate the full product documentation set.</p>
              <Button size="sm" onClick={() => mGen.mutate()} disabled={mGen.isPending}>
                {mGen.isPending ? <Loader2 className="size-4 animate-spin" /> : "Regenerate all"}
              </Button>
            </div>
            <div className="grid gap-3">
              {(docsQ.data?.docs as DocRow[] | undefined)?.map((d) => (
                <Card key={d.id}>
                  <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2">{d.title} <Badge variant="outline">{d.kind}</Badge> <Badge variant="secondary">{d.word_count}w</Badge></CardTitle></CardHeader>
                  <CardContent className="space-y-2">
                    <Textarea rows={6} className="font-mono text-xs"
                      defaultValue={d.content_md}
                      onChange={(e) => setEditing((s) => ({ ...s, [d.id]: e.target.value }))} />
                    <Button size="sm" variant="outline" disabled={!editing[d.id] || mSave.isPending}
                      onClick={() => mSave.mutate({ docId: d.id, contentMd: editing[d.id] ?? d.content_md })}>Save</Button>
                  </CardContent>
                </Card>
              ))}
              {!docsQ.data?.docs?.length && <p className="text-sm text-muted-foreground">No docs yet — click Regenerate.</p>}
            </div>
          </TabsContent>

          <TabsContent value="marketplace" className="space-y-3 mt-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">New listing</CardTitle></CardHeader>
              <CardContent className="grid grid-cols-2 gap-2">
                <div><Label>Kind</Label>
                  <Select value={form.artifactKind} onValueChange={(v) => setForm({ ...form, artifactKind: v as ArtifactKind })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{ALL_ARTIFACT_KINDS.map((k) => <SelectItem key={k} value={k}>{k}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label>Version</Label><Input value={form.version} onChange={(e) => setForm({ ...form, version: e.target.value })} /></div>
                <div><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
                <div><Label>Slug</Label><Input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase() })} placeholder="my-extension" /></div>
                <Button className="col-span-2" disabled={!form.name || !form.slug || mCreate.isPending} onClick={() => mCreate.mutate()}>
                  {mCreate.isPending ? <Loader2 className="size-4 animate-spin" /> : "Create signed bundle"}
                </Button>
              </CardContent>
            </Card>
            <div className="grid gap-2">
              {(mpQ.data?.listings as ListingRow[] | undefined)?.map((l) => (
                <div key={l.id} className="flex items-center justify-between p-3 rounded border">
                  <div>
                    <div className="font-medium text-sm">{l.name} <Badge variant="outline" className="ml-1">{l.artifact_kind}</Badge> <Badge variant="secondary" className="ml-1">{l.version}</Badge></div>
                    <div className="text-xs text-muted-foreground">{l.slug} · {l.visibility} · {l.status}</div>
                  </div>
                  <Select value={l.status} onValueChange={(v) => mPub.mutate({ listingId: l.id, status: v as "draft" | "review" | "published" | "deprecated" })}>
                    <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="draft">draft</SelectItem>
                      <SelectItem value="review">review</SelectItem>
                      <SelectItem value="published">published</SelectItem>
                      <SelectItem value="deprecated">deprecated</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              ))}
              {!mpQ.data?.listings?.length && <p className="text-sm text-muted-foreground">No listings yet.</p>}
            </div>
          </TabsContent>

          <TabsContent value="runbooks" className="space-y-3 mt-4">
            <div className="flex justify-between items-center">
              <p className="text-sm text-muted-foreground">Battle-tested incident & launch playbooks.</p>
              <Button size="sm" onClick={() => mSeed.mutate()} disabled={mSeed.isPending}>
                {mSeed.isPending ? <Loader2 className="size-4 animate-spin" /> : "Seed defaults"}
              </Button>
            </div>
            <div className="grid gap-2">
              {(rbQ.data?.runbooks as RunbookRow[] | undefined)?.map((r) => (
                <div key={r.id} className="flex items-center justify-between p-3 rounded border">
                  <div>
                    <div className="font-medium text-sm">{r.title} <Badge variant={r.severity === "sev1" ? "destructive" : "outline"} className="ml-1">{r.severity}</Badge></div>
                    <div className="text-xs text-muted-foreground">SLA {r.sla_minutes}m · {r.last_drilled_at ? `last drilled ${new Date(r.last_drilled_at).toLocaleDateString()}` : "never drilled"}</div>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => mDrill.mutate(r.id)}>Record drill</Button>
                </div>
              ))}
              {!rbQ.data?.runbooks?.length && <p className="text-sm text-muted-foreground">No runbooks yet — seed defaults.</p>}
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
