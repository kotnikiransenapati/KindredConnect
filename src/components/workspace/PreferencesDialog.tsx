import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Brain } from "lucide-react";
import { getMyPreferences, setMyPreferences } from "@/lib/preferences.functions";
import { toast } from "sonner";

export function PreferencesDialog() {
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState("");
  const qc = useQueryClient();
  const getFn = useServerFn(getMyPreferences);
  const setFn = useServerFn(setMyPreferences);

  useQuery({
    queryKey: ["my-preferences"],
    queryFn: async () => {
      const r = await getFn({});
      setNotes(r.notes);
      return r;
    },
    enabled: open,
  });

  const save = useMutation({
    mutationFn: () => setFn({ data: { notes } }),
    onSuccess: () => {
      toast.success("Preferences saved — the agent will use these next chat.");
      qc.invalidateQueries({ queryKey: ["my-preferences"] });
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Brain className="mr-1.5 h-3.5 w-3.5" /> Agent memory
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Long-term agent preferences</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Free-form notes the AI will see on every project (writing style, preferred stack, accessibility rules, tone, etc.).
        </p>
        <Textarea
          rows={10}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder={"e.g. Prefer Tailwind over inline styles.\nAlways use semantic HTML.\nDefault to dark theme.\nKeep components under 150 lines."}
          maxLength={4000}
        />
        <div className="text-right text-xs text-muted-foreground">{notes.length} / 4000</div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
