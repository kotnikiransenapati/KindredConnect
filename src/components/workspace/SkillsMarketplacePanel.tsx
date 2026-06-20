import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import { Sparkles, Plug2, Wrench, MessageSquareCode, Trash2, Download, Loader2, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import {
  listProjectSkills, listMarketplaceSkills,
  upsertSkill, deleteSkill, installSkill,
} from "@/lib/skills.functions";

type Kind = "mcp" | "http_tool" | "prompt";
const kindMeta: Record<Kind, { label: string; icon: typeof Plug2; color: string }> = {
  mcp: { label: "MCP", icon: Plug2, color: "text-cyan-400" },
  http_tool: { label: "HTTP tool", icon: Wrench, color: "text-amber-400" },
  prompt: { label: "Prompt", icon: MessageSquareCode, color: "text-violet-400" },
};

const blankConfig: Record<Kind, string> = {
  mcp: JSON.stringify({ endpoint: "https://example.com/mcp", auth_header: "" }, null, 2),
  http_tool: JSON.stringify({ method: "POST", url: "https://api.example.com/x", headers: {}, body_template: {} }, null, 2),
  prompt: JSON.stringify({ system: "You are a senior reviewer.", user_template: "Review: {{input}}", model: "google/gemini-3-flash-preview" }, null, 2),
};

export function SkillsMarketplacePanel({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const listMine = useServerFn(listProjectSkills);
  const listMarket = useServerFn(listMarketplaceSkills);
  const upsert = useServerFn(upsertSkill);
  const del = useServerFn(deleteSkill);
  const install = useServerFn(installSkill);

  const mineQ = useQuery({ queryKey: ["skills", projectId], queryFn: () => listMine({ data: { projectId } }) });
  const [tab, setTab] = useState<"mine" | "market">("mine");
  const [q, setQ] = useState("");
  const [kindFilter, setKindFilter] = useState<"" | Kind>("");
  const marketQ = useQuery({
    queryKey: ["skills-market", q, kindFilter],
    queryFn: () => listMarket({ data: { q: q || undefined, kind: kindFilter || undefined } }),
    enabled: tab === "market",
  });

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [kind, setKind] = useState<Kind>("http_tool");
  const [visibility, setVisibility] = useState<"private" | "public">("private");
  const [configText, setConfigText] = useState(blankConfig.http_tool);
  const [enabled, setEnabled] = useState(true);

  function resetForm() {
    setName(""); setDescription(""); setKind("http_tool");
    setVisibility("private"); setConfigText(blankConfig.http_tool); setEnabled(true);
  }

  const upsertMut = useMutation({
    mutationFn: async () => {
      let config: Record<string, unknown> = {};
      try { config = JSON.parse(configText); } catch { throw new Error("Config must be valid JSON"); }
      return upsert({ data: { projectId, name, description, kind, visibility, config, enabled } });
    },
    onSuccess: () => {
      toast.success("Skill saved"); resetForm();
      qc.invalidateQueries({ queryKey: ["skills", projectId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const delMut = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["skills", projectId] }),
    onError: (e: Error) => toast.error(e.message),
  });
  const installMut = useMutation({
    mutationFn: (sourceId: string) => install({ data: { sourceId, targetProjectId: projectId } }),
    onSuccess: () => { toast.success("Installed into project"); qc.invalidateQueries({ queryKey: ["skills", projectId] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="rounded-2xl border border-border/60 bg-card/40 p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <h3 className="font-display text-sm font-semibold">Agent Skills</h3>
        </div>
        <div className="flex rounded-md border border-border/60 p-0.5 text-xs">
          {(["mine", "market"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded px-2 py-1 capitalize transition ${tab === t ? "bg-primary/15 text-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              {t === "mine" ? "Installed" : "Marketplace"}
            </button>
          ))}
        </div>
      </div>

      {tab === "mine" ? (
        <>
          <div className="mb-3 grid gap-2 rounded-lg border border-border/40 bg-background/30 p-3">
            <div className="grid grid-cols-2 gap-2">
              <Input placeholder="skill-name" value={name} onChange={(e) => setName(e.target.value)} />
              <Select value={kind} onValueChange={(v) => { const k = v as Kind; setKind(k); setConfigText(blankConfig[k]); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="mcp">MCP connector</SelectItem>
                  <SelectItem value="http_tool">HTTP tool</SelectItem>
                  <SelectItem value="prompt">Prompt template</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Input placeholder="Description" value={description} onChange={(e) => setDescription(e.target.value)} />
            <Textarea
              className="font-mono text-xs"
              rows={5}
              value={configText}
              onChange={(e) => setConfigText(e.target.value)}
            />
            <div className="flex items-center justify-between gap-2">
              <Select value={visibility} onValueChange={(v) => setVisibility(v as "private" | "public")}>
                <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="private">Private</SelectItem>
                  <SelectItem value="public">Public</SelectItem>
                </SelectContent>
              </Select>
              <label className="flex items-center gap-1 text-xs text-muted-foreground">
                <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} /> Enabled
              </label>
              <Button size="sm" disabled={!name || upsertMut.isPending} onClick={() => upsertMut.mutate()}>
                {upsertMut.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />} Save skill
              </Button>
            </div>
          </div>
          <SkillList
            loading={mineQ.isLoading}
            skills={mineQ.data?.skills ?? []}
            onDelete={(id) => delMut.mutate(id)}
            deletingId={delMut.isPending ? (delMut.variables as string) : null}
          />
        </>
      ) : (
        <>
          <div className="mb-3 flex gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input className="pl-7" placeholder="Search public skills" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <Select value={kindFilter || "all"} onValueChange={(v) => setKindFilter(v === "all" ? "" : (v as Kind))}>
              <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All kinds</SelectItem>
                <SelectItem value="mcp">MCP</SelectItem>
                <SelectItem value="http_tool">HTTP tool</SelectItem>
                <SelectItem value="prompt">Prompt</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {marketQ.isLoading ? (
            <div className="py-6 text-center text-xs text-muted-foreground">Loading marketplace…</div>
          ) : (marketQ.data?.skills ?? []).length === 0 ? (
            <div className="py-6 text-center text-xs text-muted-foreground">No public skills yet.</div>
          ) : (
            <ul className="grid gap-2">
              {(marketQ.data?.skills ?? []).map((s) => {
                const meta = kindMeta[s.kind as Kind];
                const Icon = meta.icon;
                return (
                  <li key={s.id} className="flex items-center justify-between gap-3 rounded-lg border border-border/40 bg-background/30 p-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Icon className={`h-3.5 w-3.5 ${meta.color}`} />
                        <span className="truncate font-mono text-xs">{s.name}</span>
                        <Badge variant="outline" className="text-[10px]">{meta.label}</Badge>
                        <span className="text-[10px] text-muted-foreground">↓ {s.install_count}</span>
                      </div>
                      {s.description && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{s.description}</p>}
                    </div>
                    <Button size="sm" variant="outline"
                      disabled={installMut.isPending && installMut.variables === s.id}
                      onClick={() => installMut.mutate(s.id)}>
                      {installMut.isPending && installMut.variables === s.id
                        ? <Loader2 className="h-3 w-3 animate-spin" />
                        : <Download className="h-3 w-3" />}
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

function SkillList({
  loading, skills, onDelete, deletingId,
}: {
  loading: boolean;
  skills: Array<{ id: string; name: string; description: string; kind: string; visibility: string; enabled: boolean }>;
  onDelete: (id: string) => void;
  deletingId: string | null;
}) {
  if (loading) return <div className="py-6 text-center text-xs text-muted-foreground">Loading skills…</div>;
  if (skills.length === 0)
    return <div className="py-6 text-center text-xs text-muted-foreground">No skills yet — add one above or install from the marketplace.</div>;
  return (
    <ul className="grid gap-2">
      {skills.map((s) => {
        const meta = kindMeta[s.kind as Kind];
        const Icon = meta?.icon ?? Wrench;
        return (
          <li key={s.id} className="flex items-center justify-between gap-3 rounded-lg border border-border/40 bg-background/30 p-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <Icon className={`h-3.5 w-3.5 ${meta?.color ?? ""}`} />
                <span className="truncate font-mono text-xs">{s.name}</span>
                <Badge variant="outline" className="text-[10px]">{meta?.label ?? s.kind}</Badge>
                {s.visibility === "public" && <Badge className="text-[10px]">public</Badge>}
                {!s.enabled && <Badge variant="secondary" className="text-[10px]">disabled</Badge>}
              </div>
              {s.description && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{s.description}</p>}
            </div>
            <Button size="sm" variant="ghost" disabled={deletingId === s.id} onClick={() => onDelete(s.id)}>
              {deletingId === s.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
            </Button>
          </li>
        );
      })}
    </ul>
  );
}
