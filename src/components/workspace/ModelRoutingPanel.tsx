import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import { Cpu, Save, Loader2, Trash2, Zap, Brain, Image as ImageIcon, MessageSquare, Code2, DollarSign } from "lucide-react";
import { toast } from "sonner";
import {
  listModelRoutes, upsertModelRoute, deleteModelRoute,
} from "@/lib/model-routing.functions";
import type { TaskKind, QualityTier } from "@/lib/models.catalog";

const TASK_META: Record<TaskKind, { label: string; icon: typeof Zap; hint: string }> = {
  chat:      { label: "Chat",      icon: MessageSquare, hint: "General assistant conversations" },
  code:      { label: "Code",      icon: Code2,         hint: "Code generation & editing" },
  reasoning: { label: "Reasoning", icon: Brain,         hint: "Multi-step planning, hard tasks" },
  cheap:     { label: "Cheap",     icon: DollarSign,    hint: "Low-cost classification, summaries" },
  vision:    { label: "Vision",    icon: ImageIcon,     hint: "Image understanding" },
  embedding: { label: "Embedding", icon: Cpu,           hint: "Vector search" },
};

export function ModelRoutingPanel({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const list = useServerFn(listModelRoutes);
  const upsert = useServerFn(upsertModelRoute);
  const del = useServerFn(deleteModelRoute);

  const q = useQuery({
    queryKey: ["model-routes", projectId],
    queryFn: () => list({ data: { projectId } }),
  });

  const byKind = useMemo(() => {
    const m: Partial<Record<TaskKind, any>> = {};
    for (const r of q.data?.routes ?? []) m[r.task_kind as TaskKind] = r;
    return m;
  }, [q.data]);

  return (
    <section className="rounded-2xl border border-border/60 bg-card/40 p-4">
      <header className="mb-3 flex items-center gap-2">
        <Cpu className="h-4 w-4 text-primary" />
        <h2 className="font-display text-sm font-semibold">AI model routing</h2>
        <Badge variant="outline" className="ml-auto text-[10px]">cost · quality auto-routing</Badge>
      </header>
      <p className="mb-3 text-xs text-muted-foreground">
        Pick the best model per task. The router falls back automatically if a model errors, and never picks one above your cost cap.
      </p>

      <div className="space-y-2">
        {(Object.keys(TASK_META) as TaskKind[]).map((kind) => (
          <RouteRow
            key={kind}
            projectId={projectId}
            kind={kind}
            route={byKind[kind]}
            catalog={q.data?.catalog ?? []}
            defaultModel={q.data?.defaults?.[kind] ?? ""}
            onSave={async (v) => {
              await upsert({ data: { projectId, taskKind: kind, ...v } });
              toast.success(`${TASK_META[kind].label} route saved`);
              qc.invalidateQueries({ queryKey: ["model-routes", projectId] });
            }}
            onDelete={async (id) => {
              await del({ data: { id } });
              toast.success("Route reset to default");
              qc.invalidateQueries({ queryKey: ["model-routes", projectId] });
            }}
          />
        ))}
      </div>
    </section>
  );
}

function RouteRow({
  projectId: _projectId, kind, route, catalog, defaultModel, onSave, onDelete,
}: {
  projectId: string;
  kind: TaskKind;
  route: any;
  catalog: { id: string; label: string; vendor: string; quality: QualityTier; inputCostPerMTokens: number; outputCostPerMTokens: number; goodFor: TaskKind[] }[];
  defaultModel: string;
  onSave: (v: { preferredModel: string; fallbackModels: string[]; maxCostUsd: number; qualityTier: QualityTier; enabled: boolean }) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const Meta = TASK_META[kind];
  const Icon = Meta.icon;

  const compatible = catalog.filter((m) => m.goodFor.includes(kind));
  const [preferred, setPreferred] = useState<string>(route?.preferred_model ?? defaultModel);
  const [fallbacks, setFallbacks] = useState<string[]>(route?.fallback_models ?? []);
  const [maxCost, setMaxCost] = useState<number>(route?.max_cost_usd ?? 0.10);
  const [tier, setTier] = useState<QualityTier>((route?.quality_tier ?? "balanced") as QualityTier);
  const [enabled, setEnabled] = useState<boolean>(route?.enabled ?? false);
  const [saving, setSaving] = useState(false);

  const preferredMeta = catalog.find((m) => m.id === preferred);

  const save = async () => {
    setSaving(true);
    try {
      await onSave({ preferredModel: preferred, fallbackModels: fallbacks, maxCostUsd: maxCost, qualityTier: tier, enabled });
    } catch (e) { toast.error((e as Error).message); }
    finally { setSaving(false); }
  };

  return (
    <div className="rounded-xl border border-border/60 bg-background/40 p-3">
      <div className="mb-2 flex items-center gap-2">
        <Icon className="h-3.5 w-3.5 text-primary" />
        <span className="text-sm font-medium">{Meta.label}</span>
        <span className="text-[11px] text-muted-foreground">— {Meta.hint}</span>
        <div className="ml-auto flex items-center gap-2">
          <Switch checked={enabled} onCheckedChange={setEnabled} />
          <Label className="text-[11px] text-muted-foreground">Override</Label>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-[1fr_140px_120px]">
        <Select value={preferred} onValueChange={setPreferred}>
          <SelectTrigger><SelectValue placeholder="Preferred model" /></SelectTrigger>
          <SelectContent>
            {compatible.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.label} · {m.vendor} · ${ (m.inputCostPerMTokens + m.outputCostPerMTokens).toFixed(2) }/M
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={tier} onValueChange={(v) => setTier(v as QualityTier)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="low">Low</SelectItem>
            <SelectItem value="balanced">Balanced</SelectItem>
            <SelectItem value="high">High</SelectItem>
          </SelectContent>
        </Select>
        <div className="relative">
          <DollarSign className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="number" min={0} step={0.01} value={maxCost}
            onChange={(e) => setMaxCost(parseFloat(e.target.value) || 0)}
            className="pl-7"
          />
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] text-muted-foreground">Fallbacks:</span>
        {compatible.filter((m) => m.id !== preferred).map((m) => {
          const on = fallbacks.includes(m.id);
          return (
            <button
              key={m.id} type="button"
              onClick={() => setFallbacks(on ? fallbacks.filter((x) => x !== m.id) : [...fallbacks, m.id])}
              className={`rounded-md border px-2 py-0.5 text-[10px] transition ${on ? "border-primary/60 bg-primary/15 text-primary" : "border-border/60 bg-background/40 text-muted-foreground hover:text-foreground"}`}
            >
              {m.label}
            </button>
          );
        })}
      </div>

      <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
        <span>
          {preferredMeta
            ? `~$${(preferredMeta.inputCostPerMTokens + preferredMeta.outputCostPerMTokens).toFixed(2)}/M tokens · ${preferredMeta.quality}`
            : `Auto: ${defaultModel}`}
        </span>
        <div className="flex gap-1.5">
          {route && (
            <Button size="sm" variant="ghost" className="h-7 text-destructive" onClick={() => onDelete(route.id)}>
              <Trash2 className="h-3 w-3" />
            </Button>
          )}
          <Button size="sm" className="h-7" onClick={save} disabled={saving || !preferred}>
            {saving ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Save className="mr-1 h-3 w-3" />}
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}
