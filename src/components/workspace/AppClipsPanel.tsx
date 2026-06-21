// P35 — App Clips / Instant Apps builder panel.
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  listClips, upsertClip, setClipStatus, deleteClip, logInvocation, clipStats,
} from "@/lib/app-clips.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, Smartphone, Zap, Trash2, Send, BarChart3, QrCode } from "lucide-react";

const MAX_KB = 15 * 1024;

const STATUS_TONE: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  building: "bg-amber-500/15 text-amber-600 border-amber-500/30",
  ready: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
  published: "bg-primary/15 text-primary border-primary/30",
  archived: "bg-secondary text-secondary-foreground",
};

export function AppClipsPanel({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const lc = useServerFn(listClips);
  const up = useServerFn(upsertClip);
  const ss = useServerFn(setClipStatus);
  const del = useServerFn(deleteClip);
  const inv = useServerFn(logInvocation);
  const cs = useServerFn(clipStats);

  const clips = useQuery({
    queryKey: ["app-clips", projectId],
    queryFn: () => lc({ data: { projectId } }),
  });
  const stats = useQuery({
    queryKey: ["app-clip-stats", projectId],
    queryFn: () => cs({ data: { projectId } }),
    refetchInterval: 10_000,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["app-clips", projectId] });
    qc.invalidateQueries({ queryKey: ["app-clip-stats", projectId] });
  };

  const save = useMutation({
    mutationFn: (v: any) => up({ data: v }),
    onSuccess: () => { toast.success("App Clip saved"); invalidate(); },
    onError: (e: any) => toast.error(e?.message ?? "Save failed"),
  });
  const status = useMutation({
    mutationFn: (v: { id: string; status: any }) =>
      ss({ data: { id: v.id, projectId, status: v.status } }),
    onSuccess: () => { toast.success("Status updated"); invalidate(); },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });
  const remove = useMutation({
    mutationFn: (id: string) => del({ data: { id, projectId } }),
    onSuccess: () => { toast.success("Deleted"); invalidate(); },
    onError: (e: any) => toast.error(e?.message ?? "Delete failed"),
  });
  const simulate = useMutation({
    mutationFn: (v: any) => inv({ data: v }),
    onSuccess: () => { toast.success("Invocation logged"); invalidate(); },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  // Compose form state
  const [form, setForm] = useState({
    slug: "",
    title: "",
    subtitle: "",
    platform: "both" as "ios"|"android"|"both",
    invocationUrl: "",
    bundleSizeKb: 4096,
    entryRoute: "/",
    advanceExperience: false,
    associationsText: "",
  });

  function submit() {
    const associations = form.associationsText
      .split(/\r?\n/).map(l => l.trim()).filter(Boolean)
      .map(line => {
        const [domain, ...rest] = line.split(/\s+/);
        return { domain, patterns: rest.length ? rest : ["/*"] };
      });
    save.mutate({
      projectId,
      slug: form.slug,
      title: form.title,
      subtitle: form.subtitle || null,
      platform: form.platform,
      invocationUrl: form.invocationUrl,
      bundleSizeKb: form.bundleSizeKb,
      entryRoute: form.entryRoute,
      advanceExperience: form.advanceExperience,
      associations,
      settings: {},
    });
  }

  // Simulator state
  const list = clips.data ?? [];
  const [simClip, setSimClip] = useState<string>("");
  const [simSource, setSimSource] = useState<string>("qr");
  const [simPlatform, setSimPlatform] = useState<"ios"|"android">("ios");
  const [simConverted, setSimConverted] = useState(false);

  const s = stats.data;

  return (
    <Card className="border-border/50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Zap className="size-5 text-primary" /> App Clips & Instant Apps
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* KPI strip */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-4">
          <Kpi label="Clips" value={list.length} />
          <Kpi label="Invocations (30d)" value={s?.total ?? 0} />
          <Kpi label="Installs" value={s?.installs ?? 0} />
          <Kpi label="Conversion" value={`${s?.conversionPct ?? 0}%`} />
          <Kpi label="Avg session" value={`${Math.round((s?.avgSessionMs ?? 0)/1000)}s`} />
        </div>

        <Tabs defaultValue="clips">
          <TabsList>
            <TabsTrigger value="clips"><Smartphone className="size-4 mr-1" />Clips</TabsTrigger>
            <TabsTrigger value="create"><Send className="size-4 mr-1" />Create</TabsTrigger>
            <TabsTrigger value="simulate"><QrCode className="size-4 mr-1" />Simulate</TabsTrigger>
            <TabsTrigger value="analytics"><BarChart3 className="size-4 mr-1" />Analytics</TabsTrigger>
          </TabsList>

          {/* Clips list */}
          <TabsContent value="clips" className="space-y-2 mt-3">
            {clips.isLoading && <Loader2 className="size-4 animate-spin" />}
            {!clips.isLoading && list.length === 0 && (
              <p className="text-sm text-muted-foreground">No clips yet — create your first in the Create tab.</p>
            )}
            {list.map((c: any) => {
              const sizePct = Math.min(100, Math.round((c.bundle_size_kb / MAX_KB) * 100));
              return (
                <div key={c.id} className="border rounded-md p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{c.title}</span>
                      <code className="text-xs text-muted-foreground">/{c.slug}</code>
                      <Badge variant="outline">{c.platform}</Badge>
                      <Badge className={STATUS_TONE[c.status] ?? ""}>{c.status}</Badge>
                      {c.advance_experience && <Badge variant="secondary">Advanced</Badge>}
                    </div>
                    <div className="flex gap-1">
                      <Select
                        value={c.status}
                        onValueChange={(v) => status.mutate({ id: c.id, status: v })}
                      >
                        <SelectTrigger className="h-7 w-32 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {["draft","building","ready","published","archived"].map(x =>
                            <SelectItem key={x} value={x}>{x}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <Button variant="ghost" size="icon" className="size-7"
                        onClick={() => { if (confirm(`Delete clip "${c.title}"?`)) remove.mutate(c.id); }}>
                        <Trash2 className="size-3.5 text-destructive" />
                      </Button>
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    → <code>{c.invocation_url}</code> · entry <code>{c.entry_route}</code>
                  </div>
                  <div>
                    <div className="flex justify-between text-xs">
                      <span>Bundle</span>
                      <span className={sizePct > 90 ? "text-destructive font-medium" : "text-muted-foreground"}>
                        {(c.bundle_size_kb/1024).toFixed(2)} / 15 MB
                      </span>
                    </div>
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <div className={`h-full ${sizePct>90?"bg-destructive":sizePct>70?"bg-amber-500":"bg-primary"}`}
                           style={{ width: `${sizePct}%` }} />
                    </div>
                  </div>
                  {Array.isArray(c.associations) && c.associations.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {c.associations.map((a: any, i: number) => (
                        <Badge key={i} variant="outline" className="text-xs">{a.domain}</Badge>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </TabsContent>

          {/* Create */}
          <TabsContent value="create" className="space-y-3 mt-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="Slug">
                <Input value={form.slug} onChange={e => setForm({...form, slug: e.target.value})}
                  placeholder="checkout" />
              </Field>
              <Field label="Title">
                <Input value={form.title} onChange={e => setForm({...form, title: e.target.value})}
                  placeholder="Quick Checkout" />
              </Field>
              <Field label="Subtitle">
                <Input value={form.subtitle} onChange={e => setForm({...form, subtitle: e.target.value})}
                  placeholder="Pay in seconds" />
              </Field>
              <Field label="Platform">
                <Select value={form.platform} onValueChange={(v: any) => setForm({...form, platform: v})}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ios">iOS App Clip</SelectItem>
                    <SelectItem value="android">Android Instant App</SelectItem>
                    <SelectItem value="both">Both</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Invocation URL">
                <Input value={form.invocationUrl} onChange={e => setForm({...form, invocationUrl: e.target.value})}
                  placeholder="https://example.com/clip" />
              </Field>
              <Field label="Entry route">
                <Input value={form.entryRoute} onChange={e => setForm({...form, entryRoute: e.target.value})}
                  placeholder="/" />
              </Field>
              <Field label={`Bundle size (KB) — max 15360`}>
                <Input type="number" min={0} max={MAX_KB} value={form.bundleSizeKb}
                  onChange={e => setForm({...form, bundleSizeKb: Number(e.target.value)})} />
              </Field>
              <Field label="Advanced experience">
                <div className="flex items-center gap-2 h-9">
                  <Switch checked={form.advanceExperience}
                    onCheckedChange={(v) => setForm({...form, advanceExperience: v})} />
                  <span className="text-xs text-muted-foreground">Allow upgrade to full app prompt</span>
                </div>
              </Field>
            </div>
            <Field label="Associations (one per line: domain /pattern1 /pattern2)">
              <Textarea rows={3} value={form.associationsText}
                onChange={e => setForm({...form, associationsText: e.target.value})}
                placeholder={"example.com /checkout/* /pay/*\nshop.example.com /clip/*"} />
            </Field>
            <Button onClick={submit} disabled={save.isPending || !form.slug || !form.title || !form.invocationUrl}>
              {save.isPending && <Loader2 className="size-4 animate-spin mr-1" />}
              Save clip
            </Button>
          </TabsContent>

          {/* Simulate */}
          <TabsContent value="simulate" className="space-y-3 mt-3">
            {list.length === 0 ? (
              <p className="text-sm text-muted-foreground">Create a clip first.</p>
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <Field label="Clip">
                    <Select value={simClip || list[0].id} onValueChange={setSimClip}>
                      <SelectTrigger><SelectValue placeholder="Pick" /></SelectTrigger>
                      <SelectContent>
                        {list.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Source">
                    <Select value={simSource} onValueChange={setSimSource}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {["qr","nfc","link","share","smart_banner","other"].map(s =>
                          <SelectItem key={s} value={s}>{s}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Platform">
                    <Select value={simPlatform} onValueChange={(v: any) => setSimPlatform(v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ios">iOS</SelectItem>
                        <SelectItem value="android">Android</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={simConverted} onCheckedChange={setSimConverted} />
                  <span className="text-sm">User installed full app after clip</span>
                </div>
                <Button
                  onClick={() => simulate.mutate({
                    clipId: simClip || list[0].id,
                    projectId,
                    platform: simPlatform,
                    source: simSource,
                    convertedToInstall: simConverted,
                    sessionMs: 8000 + Math.floor(Math.random()*30000),
                  })}
                  disabled={simulate.isPending}
                >
                  {simulate.isPending && <Loader2 className="size-4 animate-spin mr-1" />}
                  Fire invocation
                </Button>
              </>
            )}
          </TabsContent>

          {/* Analytics */}
          <TabsContent value="analytics" className="space-y-3 mt-3">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <BreakdownCard title="By source" data={s?.bySource ?? {}} />
              <BreakdownCard title="By platform" data={s?.byPlatform ?? {}} />
              <div className="border rounded-md p-3">
                <div className="text-xs font-medium mb-2">Top countries</div>
                {(s?.topCountries ?? []).length === 0 && (
                  <p className="text-xs text-muted-foreground">No data yet.</p>
                )}
                {(s?.topCountries ?? []).map((c: any) => (
                  <div key={c.code} className="flex justify-between text-xs py-0.5">
                    <span>{c.code}</span><span className="text-muted-foreground">{c.count}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="border rounded-md">
              <div className="text-xs font-medium p-2 border-b">Recent invocations</div>
              <div className="max-h-60 overflow-auto">
                {(s?.recent ?? []).length === 0 && (
                  <p className="p-3 text-xs text-muted-foreground">No invocations in last 30d.</p>
                )}
                {(s?.recent ?? []).map((r: any, i: number) => (
                  <div key={i} className="flex items-center justify-between text-xs px-2 py-1 border-b last:border-0">
                    <div className="flex gap-2 items-center">
                      <Badge variant="outline" className="text-[10px]">{r.platform}</Badge>
                      <span>{r.source}</span>
                      {r.country && <span className="text-muted-foreground">· {r.country}</span>}
                      {r.converted_to_install && <Badge className="text-[10px] bg-emerald-500/15 text-emerald-600">installed</Badge>}
                    </div>
                    <span className="text-muted-foreground">{new Date(r.created_at).toLocaleTimeString()}</span>
                  </div>
                ))}
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

function Kpi({ label, value }: { label: string; value: any }) {
  return (
    <div className="border rounded-md p-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}
function BreakdownCard({ title, data }: { title: string; data: Record<string, number> }) {
  const entries = Object.entries(data).sort((a,b)=>b[1]-a[1]);
  const total = entries.reduce((a,[,n])=>a+n,0) || 1;
  return (
    <div className="border rounded-md p-3">
      <div className="text-xs font-medium mb-2">{title}</div>
      {entries.length === 0 && <p className="text-xs text-muted-foreground">No data.</p>}
      {entries.map(([k,n]) => (
        <div key={k} className="mb-1">
          <div className="flex justify-between text-xs"><span>{k}</span><span className="text-muted-foreground">{n}</span></div>
          <div className="h-1 bg-muted rounded-full overflow-hidden">
            <div className="h-full bg-primary" style={{ width: `${(n/total)*100}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}
