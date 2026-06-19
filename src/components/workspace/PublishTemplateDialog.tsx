import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { publishProjectAsTemplate } from "@/lib/templates.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Globe } from "lucide-react";
import { toast } from "sonner";

export function PublishTemplateDialog({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const doPublish = useServerFn(publishProjectAsTemplate);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("Community");
  const [thumb, setThumb] = useState("");

  const m = useMutation({
    mutationFn: () => doPublish({ data: {
      projectId, name: name.trim(), description: description.trim(),
      category: category.trim() || "Community",
      thumbnailUrl: thumb.trim() || undefined,
    } }),
    onSuccess: (r) => {
      toast.success(`Published: ${r.template.name}`);
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["templates"] });
      qc.invalidateQueries({ queryKey: ["public-templates"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <Globe className="h-3.5 w-3.5" /> Publish as template
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Publish to the marketplace</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Input placeholder="Template name" value={name} onChange={(e) => setName(e.target.value)} />
          <Textarea placeholder="Short description (what it does, who it's for)" rows={3}
            value={description} onChange={(e) => setDescription(e.target.value)} />
          <div className="grid grid-cols-2 gap-2">
            <Input placeholder="Category (e.g. SaaS, Portfolio)" value={category} onChange={(e) => setCategory(e.target.value)} />
            <Input placeholder="Thumbnail URL (optional)" value={thumb} onChange={(e) => setThumb(e.target.value)} />
          </div>
          <Button
            className="w-full"
            disabled={m.isPending || name.trim().length < 2 || description.trim().length < 2}
            onClick={() => m.mutate()}
          >
            {m.isPending ? "Publishing…" : "Publish"}
          </Button>
          <p className="text-[11px] text-muted-foreground">
            Public templates are visible to everyone. Anyone can fork them; your current files are snapshotted on publish.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
