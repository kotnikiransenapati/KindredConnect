import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  listPrompts, upsertPrompt, deletePrompt, submitResponse, reviewStats,
} from "@/lib/review-prompts.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Loader2, MessageSquareHeart, Star, Trash2 } from "lucide-react";

export function ReviewPromptsPanel({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const lP = useServerFn(listPrompts); const upP = useServerFn(upsertPrompt);
  const dP = useServerFn(deletePrompt); const sR = useServerFn(submitResponse);
  const stat = useServerFn(reviewStats);

  const prompts = useQuery({ queryKey: ["rev-prompts", projectId],
    queryFn: () => lP({ data: { projectId } }), refetchInterval: 10_000 });
  const stats = useQuery({ queryKey: ["rev-stats", projectId],
    queryFn: () => stat({ data: { projectId, days: 30 } }), refetchInterval: 8000 });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["rev-prompts", projectId] });
    qc.invalidateQueries({ queryKey: ["rev-stats", projectId] });
  };

  const [name, setName] = useState(""); const [trigger, setTrigger] = useState<any>("after_session_count");
  const [event, setEvent] = useState(""); const [minSess, setMinSess] = useState(3);
  const [cool, setCool] = useState(90); const [thr, setThr] = useState(4); const [en, setEn] = useState(true);
  const createM = useMutation({
    mutationFn: () => upP({ data: { projectId, name, trigger,
      triggerEvent: event || undefined, minSessions: minSess, cooldownDays: cool,
      sentimentThreshold: thr, enabled: en } }),
    onSuccess: () => { toast.success("Saved"); setName(""); invalidate(); },
    onError: (e: any) => toast.error(e.message),
  });

  const [rating, setRating] = useState(5); const [comment, setComment] = useState("");
  const [subject, setSubject] = useState("test-user-1");
  const [promptId, setPromptId] = useState<string>("");
  const submitM = useMutation({
    mutationFn: () => sR({ data: { projectId, promptId: promptId || undefined,
      subjectId: subject, rating, comment, platform: "ios" } }),
    onSuccess: (r) => { toast.success(`Routed → ${r.routedTo} (s=${r.sentiment})`); setComment(""); invalidate(); },
    onError: (e: any) => toast.error(e.message),
  });

  const t = stats.data?.totals;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><MessageSquareHeart className="h-4 w-4 text-rose-500" />In-app Review Prompts</CardTitle>
        <p className="text-xs text-muted-foreground">Sentiment-routed feedback: happy users → store, unhappy → support</p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          <Stat label="Responses (30d)" value={String(t?.count ?? 0)} />
          <Stat label="Avg ★" value={String(t?.avgRating ?? 0)} />
          <Stat label="Sentiment" value={String(t?.avgSentiment ?? 0)} />
          <Stat label="→ Store" value={String(t?.store ?? 0)} accent />
          <Stat label="→ Support" value={String(t?.support ?? 0)} />
        </div>

        <Tabs defaultValue="campaigns">
          <TabsList>
            <TabsTrigger value="campaigns">Campaigns</TabsTrigger>
            <TabsTrigger value="simulate">Simulate</TabsTrigger>
            <TabsTrigger value="recent">Recent</TabsTrigger>
          </TabsList>

          <TabsContent value="campaigns" className="space-y-2">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 items-end">
              <div><Label className="text-xs">Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
              <div>
                <Label className="text-xs">Trigger</Label>
                <Select value={trigger} onValueChange={setTrigger}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["on_open","after_event","after_purchase","after_session_count","manual"].map(t =>
                      <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {trigger === "after_event" && (
                <div><Label className="text-xs">Event</Label><Input value={event} onChange={(e) => setEvent(e.target.value)} placeholder="checkout_completed" /></div>
              )}
              <div><Label className="text-xs">Min sessions</Label><Input type="number" value={minSess} onChange={(e) => setMinSess(Number(e.target.value)||0)} /></div>
              <div><Label className="text-xs">Cooldown (days)</Label><Input type="number" value={cool} onChange={(e) => setCool(Number(e.target.value)||0)} /></div>
              <div><Label className="text-xs">★ threshold</Label><Input type="number" min={1} max={5} value={thr} onChange={(e) => setThr(Number(e.target.value)||4)} /></div>
              <div className="flex items-center gap-2"><Switch checked={en} onCheckedChange={setEn} /><span className="text-xs">Enabled</span></div>
              <Button size="sm" onClick={() => createM.mutate()} disabled={createM.isPending || !name}>
                {createM.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
              </Button>
            </div>
            <div className="space-y-1">
              {(prompts.data ?? []).map((p: any) => (
                <div key={p.id} className="flex items-center justify-between border rounded p-2 text-xs">
                  <div>
                    <div className="font-semibold">{p.name}</div>
                    <div className="text-muted-foreground">
                      {p.trigger}{p.trigger_event ? `:${p.trigger_event}`:""} • ≥{p.min_sessions} sess • cd {p.cooldown_days}d • ≥{p.sentiment_threshold}★→store
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={p.enabled ? "default" : "outline"}>{p.enabled ? "on" : "off"}</Badge>
                    <Button size="icon" variant="ghost" onClick={() => dP({ data: { projectId, id: p.id } }).then(invalidate)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
              {(prompts.data ?? []).length === 0 && <p className="text-xs text-muted-foreground">No campaigns.</p>}
            </div>
          </TabsContent>

          <TabsContent value="simulate" className="space-y-2">
            <div className="grid grid-cols-3 gap-2 items-end">
              <div><Label className="text-xs">Subject</Label><Input value={subject} onChange={(e) => setSubject(e.target.value)} /></div>
              <div><Label className="text-xs">Rating</Label>
                <div className="flex gap-1">
                  {[1,2,3,4,5].map(n => (
                    <button key={n} onClick={() => setRating(n)} className="p-1">
                      <Star className={`h-5 w-5 ${n <= rating ? "fill-amber-400 text-amber-400" : "text-muted-foreground"}`} />
                    </button>
                  ))}
                </div>
              </div>
              <div><Label className="text-xs">Prompt</Label>
                <Select value={promptId} onValueChange={setPromptId}>
                  <SelectTrigger><SelectValue placeholder="(none)" /></SelectTrigger>
                  <SelectContent>
                    {(prompts.data ?? []).map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Textarea rows={3} value={comment} onChange={(e) => setComment(e.target.value)}
              placeholder="Optional comment — sentiment scored server-side" />
            <Button size="sm" onClick={() => submitM.mutate()} disabled={submitM.isPending}>
              {submitM.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Submit
            </Button>
          </TabsContent>

          <TabsContent value="recent" className="space-y-1 max-h-72 overflow-y-auto">
            {(stats.data?.recent ?? []).map((r: any, i: number) => (
              <div key={i} className="flex items-center justify-between border rounded p-2 text-xs">
                <div>
                  <div className="flex items-center gap-1">
                    {Array.from({length: 5}).map((_, k) => (
                      <Star key={k} className={`h-3 w-3 ${k < r.rating ? "fill-amber-400 text-amber-400" : "text-muted-foreground"}`} />
                    ))}
                    <span className="text-muted-foreground ml-2">s={Number(r.sentiment ?? 0).toFixed(2)}</span>
                  </div>
                  {r.comment && <div className="text-muted-foreground mt-1">{r.comment}</div>}
                </div>
                <Badge variant={r.routed_to === "store" ? "default" : r.routed_to === "support" ? "destructive" : "outline"}>
                  {r.routed_to}
                </Badge>
              </div>
            ))}
            {(stats.data?.recent ?? []).length === 0 && <p className="text-xs text-muted-foreground">No responses yet.</p>}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`rounded-lg border p-2 ${accent ? "border-emerald-500/40 bg-emerald-500/5" : ""}`}>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold">{value}</div>
    </div>
  );
}
