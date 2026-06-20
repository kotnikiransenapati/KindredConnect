import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import { Store, CheckCircle2, AlertTriangle, Loader2, Save, FileDown, ShieldCheck, Apple, Bot, Trash2, Plus } from "lucide-react";
import { toast } from "sonner";
import { getStoreListing, upsertStoreListing, runStoreChecklist, exportStoreManifest } from "@/lib/store-listings.functions";

type Platform = "ios" | "android";

export function StoreListingsPanel({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const get = useServerFn(getStoreListing);
  const upsert = useServerFn(upsertStoreListing);
  const run = useServerFn(runStoreChecklist);
  const exp = useServerFn(exportStoreManifest);

  const [platform, setPlatform] = useState<Platform>("ios");
  const q = useQuery({
    queryKey: ["store-listing", projectId, platform],
    queryFn: () => get({ data: { projectId, platform } }),
  });

  const [form, setForm] = useState({
    title: "", subtitle: "", shortDescription: "", fullDescription: "",
    keywords: [] as string[], category: "", contactEmail: "",
    supportUrl: "", privacyUrl: "", ageRating: "4+",
    screenshots: [] as Array<{ url: string; label?: string }>,
  });
  const [keywordInput, setKeywordInput] = useState("");
  const [shotUrl, setShotUrl] = useState("");

  useEffect(() => {
    const l = q.data?.listing;
    if (!l) return;
    setForm({
      title: l.title ?? "", subtitle: l.subtitle ?? "",
      shortDescription: l.short_description ?? "", fullDescription: l.full_description ?? "",
      keywords: l.keywords ?? [], category: l.category ?? "",
      contactEmail: l.contact_email ?? "", supportUrl: l.support_url ?? "",
      privacyUrl: l.privacy_url ?? "", ageRating: l.age_rating ?? "4+",
      screenshots: Array.isArray(l.screenshots) ? (l.screenshots as Array<{ url: string; label?: string }>) : [],
    });
  }, [q.data, platform]);

  const saveMut = useMutation({
    mutationFn: () => upsert({ data: { projectId, platform, ...form } }),
    onSuccess: () => { toast.success("Listing saved"); qc.invalidateQueries({ queryKey: ["store-listing", projectId, platform] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const checklistMut = useMutation({
    mutationFn: () => run({ data: { projectId, platform } }),
    onSuccess: (r) => {
      if (r.errors === 0) toast.success(`Ready for submission — score ${r.score}/100`);
      else toast.error(`${r.errors} blocker${r.errors > 1 ? "s" : ""} · ${r.warns} warning${r.warns !== 1 ? "s" : ""}`);
      qc.invalidateQueries({ queryKey: ["store-listing", projectId, platform] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const exportMut = useMutation({
    mutationFn: () => exp({ data: { projectId, platform } }),
    onSuccess: (r) => toast.success(`Wrote ${r.written.length} Fastlane files`),
    onError: (e: Error) => toast.error(e.message),
  });

  function addKeyword() {
    const k = keywordInput.trim();
    if (!k) return;
    if (form.keywords.includes(k)) return;
    setForm((p) => ({ ...p, keywords: [...p.keywords, k] }));
    setKeywordInput("");
  }
  function addShot() {
    if (!shotUrl) return;
    setForm((p) => ({ ...p, screenshots: [...p.screenshots, { url: shotUrl }] }));
    setShotUrl("");
  }

  const checklist = (q.data?.listing?.checklist as { status?: string; score?: number; errors?: number; warns?: number; issues?: Array<{ field: string; severity: string; message: string }> } | undefined) ?? undefined;

  return (
    <div className="rounded-2xl border border-border/60 bg-card/40 p-4">
      <div className="mb-3 flex items-center gap-2">
        <Store className="h-4 w-4 text-primary" />
        <h3 className="font-display text-sm font-semibold">App Store / Play Store</h3>
        <div className="ml-auto flex rounded-md border border-border/60 p-0.5 text-xs">
          {(["ios", "android"] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPlatform(p)}
              className={`flex items-center gap-1 rounded px-2 py-1 transition ${platform === p ? "bg-primary/15 text-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              {p === "ios" ? <Apple className="h-3 w-3" /> : <Bot className="h-3 w-3" />}
              {p === "ios" ? "App Store" : "Play Store"}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-2">
        <Input placeholder="Title (max 30)" value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} />
        {platform === "ios" ? (
          <Input placeholder="Subtitle" value={form.subtitle} onChange={(e) => setForm((p) => ({ ...p, subtitle: e.target.value }))} />
        ) : (
          <Input placeholder="Short description (max 80)" value={form.shortDescription} onChange={(e) => setForm((p) => ({ ...p, shortDescription: e.target.value }))} />
        )}
        <Textarea rows={5} placeholder="Full description" value={form.fullDescription} onChange={(e) => setForm((p) => ({ ...p, fullDescription: e.target.value }))} />

        <div className="grid grid-cols-3 gap-2">
          <Input placeholder="Category" value={form.category} onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))} />
          <Select value={form.ageRating} onValueChange={(v) => setForm((p) => ({ ...p, ageRating: v }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {["4+", "9+", "12+", "17+"].map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input placeholder="contact@x.com" value={form.contactEmail} onChange={(e) => setForm((p) => ({ ...p, contactEmail: e.target.value }))} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Input placeholder="https://support.url" value={form.supportUrl} onChange={(e) => setForm((p) => ({ ...p, supportUrl: e.target.value }))} />
          <Input placeholder="https://privacy.url" value={form.privacyUrl} onChange={(e) => setForm((p) => ({ ...p, privacyUrl: e.target.value }))} />
        </div>

        {/* Keywords */}
        <div className="rounded-md border border-border/40 p-2">
          <div className="mb-1 flex items-center gap-2 text-[11px] text-muted-foreground">Keywords {platform === "ios" && <Badge variant="outline" className="text-[10px]">≤100 chars total</Badge>}</div>
          <div className="mb-1 flex flex-wrap gap-1">
            {form.keywords.map((k) => (
              <Badge key={k} variant="secondary" className="text-[10px]">
                {k}
                <button onClick={() => setForm((p) => ({ ...p, keywords: p.keywords.filter((x) => x !== k) }))} className="ml-1 text-muted-foreground">×</button>
              </Badge>
            ))}
          </div>
          <div className="flex gap-1">
            <Input className="h-7 text-xs" placeholder="add keyword" value={keywordInput} onChange={(e) => setKeywordInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addKeyword(); } }} />
            <Button size="sm" variant="ghost" onClick={addKeyword}><Plus className="h-3 w-3" /></Button>
          </div>
        </div>

        {/* Screenshots */}
        <div className="rounded-md border border-border/40 p-2">
          <div className="mb-1 text-[11px] text-muted-foreground">Screenshots ({form.screenshots.length})</div>
          <div className="mb-1 grid grid-cols-3 gap-1">
            {form.screenshots.map((s, i) => (
              <div key={i} className="relative rounded border border-border/30 bg-background/40 p-1">
                <img src={s.url} alt={s.label ?? ""} className="aspect-[9/16] w-full rounded object-cover" />
                <Button size="sm" variant="ghost" className="absolute right-0 top-0 h-6 w-6 p-0" onClick={() => setForm((p) => ({ ...p, screenshots: p.screenshots.filter((_, j) => j !== i) }))}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
          <div className="flex gap-1">
            <Input className="h-7 text-xs" placeholder="https://image-url.png" value={shotUrl} onChange={(e) => setShotUrl(e.target.value)} />
            <Button size="sm" variant="ghost" onClick={addShot}><Plus className="h-3 w-3" /></Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" disabled={saveMut.isPending} onClick={() => saveMut.mutate()}>
            {saveMut.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />} Save
          </Button>
          <Button size="sm" variant="outline" disabled={checklistMut.isPending} onClick={() => checklistMut.mutate()}>
            {checklistMut.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <ShieldCheck className="h-3 w-3" />} Run checklist
          </Button>
          <Button size="sm" variant="outline" disabled={exportMut.isPending} onClick={() => exportMut.mutate()}>
            {exportMut.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileDown className="h-3 w-3" />} Export Fastlane
          </Button>
          {checklist && (
            <Badge className={checklist.status === "ready" ? "bg-emerald-500/20 text-emerald-300" : "bg-rose-500/20 text-rose-300"}>
              {checklist.status} · {checklist.score}/100
            </Badge>
          )}
        </div>

        {checklist?.issues && checklist.issues.length > 0 && (
          <ul className="grid gap-1">
            {checklist.issues.map((i, idx) => (
              <li key={idx} className="flex items-center gap-2 rounded border border-border/30 bg-background/30 px-2 py-1 text-[11px]">
                {i.severity === "error" ? <AlertTriangle className="h-3 w-3 text-rose-400" /> : <CheckCircle2 className="h-3 w-3 text-amber-400" />}
                <span className="font-mono text-muted-foreground">{i.field}</span>
                <span>{i.message}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
