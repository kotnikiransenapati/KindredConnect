import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { KeyRound, Eye, EyeOff, Trash2, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import {
  listProjectSecrets, upsertProjectSecret,
  deleteProjectSecret, revealProjectSecret,
} from "@/lib/secrets-vault.functions";

export function SecretsVaultPanel({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const list = useServerFn(listProjectSecrets);
  const upsert = useServerFn(upsertProjectSecret);
  const del = useServerFn(deleteProjectSecret);
  const reveal = useServerFn(revealProjectSecret);

  const q = useQuery({ queryKey: ["secrets", projectId], queryFn: () => list({ data: { projectId } }) });
  const [name, setName] = useState("");
  const [value, setValue] = useState("");
  const [revealed, setRevealed] = useState<Record<string, string>>({});

  const upsertMut = useMutation({
    mutationFn: () => upsert({ data: { projectId, name, value } }),
    onSuccess: () => {
      toast.success("Secret saved");
      setName(""); setValue("");
      qc.invalidateQueries({ queryKey: ["secrets", projectId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const delMut = useMutation({
    mutationFn: (id: string) => del({ data: { projectId, id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["secrets", projectId] }),
    onError: (e: Error) => toast.error(e.message),
  });

  async function toggleReveal(id: string) {
    if (revealed[id]) { const n = { ...revealed }; delete n[id]; setRevealed(n); return; }
    try {
      const r = await reveal({ data: { projectId, id } });
      setRevealed((p) => ({ ...p, [id]: r.value }));
    } catch (e) { toast.error((e as Error).message); }
  }

  return (
    <div className="space-y-3 rounded-2xl border border-border/60 bg-card/60 p-4">
      <header className="flex items-center gap-2 font-display">
        <KeyRound className="h-4 w-4 text-brand" /> Secrets vault
      </header>
      <p className="text-xs text-muted-foreground">
        AES-256-GCM encrypted, scoped to this project. Names must be UPPER_SNAKE_CASE.
      </p>

      <div className="flex flex-wrap gap-2">
        <Input
          placeholder="API_KEY_NAME"
          value={name}
          onChange={(e) => setName(e.target.value.toUpperCase())}
          className="w-44 font-mono text-xs"
        />
        <Input
          type="password"
          placeholder="value"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="flex-1 min-w-[160px] font-mono text-xs"
        />
        <Button size="sm" onClick={() => upsertMut.mutate()} disabled={upsertMut.isPending || !name || !value}>
          {upsertMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
          Save
        </Button>
      </div>

      <ul className="space-y-1 text-sm">
        {(q.data?.secrets ?? []).length === 0 && (
          <li className="text-xs text-muted-foreground">No secrets yet.</li>
        )}
        {(q.data?.secrets ?? []).map((s) => (
          <li key={s.id} className="flex items-center justify-between gap-2 rounded-md border border-border/40 px-2 py-1.5">
            <div className="min-w-0 flex-1">
              <div className="truncate font-mono text-xs">{s.name}</div>
              <div className="truncate font-mono text-[10px] text-muted-foreground">
                {revealed[s.id] ?? `••••${s.last_four}`}
              </div>
            </div>
            <Button size="sm" variant="ghost" onClick={() => toggleReveal(s.id)} title="Reveal">
              {revealed[s.id] ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => delMut.mutate(s.id)} disabled={delMut.isPending} title="Delete">
              <Trash2 className="h-3.5 w-3.5 text-rose-500" />
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
