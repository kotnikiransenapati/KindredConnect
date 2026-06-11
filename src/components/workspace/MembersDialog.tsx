import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listMembers, inviteMember, updateMemberRole, removeMember } from "@/lib/members.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Users, UserPlus, X } from "lucide-react";
import { toast } from "sonner";

export function MembersDialog({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const list = useServerFn(listMembers);
  const invite = useServerFn(inviteMember);
  const update = useServerFn(updateMemberRole);
  const remove = useServerFn(removeMember);

  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"editor" | "viewer">("editor");

  const membersQ = useQuery({
    queryKey: ["members", projectId],
    queryFn: () => list({ data: { projectId } }),
    enabled: open,
  });

  const inviteMut = useMutation({
    mutationFn: () => invite({ data: { projectId, email: email.trim(), role } }),
    onSuccess: () => { setEmail(""); toast.success("Member invited"); qc.invalidateQueries({ queryKey: ["members", projectId] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm"><Users className="mr-1.5 h-3.5 w-3.5" /> Members</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Project members</DialogTitle></DialogHeader>

        <form onSubmit={(e) => { e.preventDefault(); inviteMut.mutate(); }} className="flex gap-2">
          <Input type="email" placeholder="teammate@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <Select value={role} onValueChange={(v) => setRole(v as "editor" | "viewer")}>
            <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="editor">Editor</SelectItem>
              <SelectItem value="viewer">Viewer</SelectItem>
            </SelectContent>
          </Select>
          <Button type="submit" disabled={inviteMut.isPending}>
            <UserPlus className="mr-1.5 h-3.5 w-3.5" /> Invite
          </Button>
        </form>

        <div className="mt-3 max-h-[50vh] space-y-2 overflow-y-auto">
          {membersQ.data?.members.length === 0 && (
            <p className="text-sm text-muted-foreground">No collaborators yet.</p>
          )}
          {membersQ.data?.members.map((m) => (
            <div key={m.id} className="flex items-center gap-2 rounded-lg border border-border/60 bg-background/40 p-2.5">
              <div className="grid h-8 w-8 place-items-center rounded-full bg-gradient-brand text-xs font-semibold text-brand-foreground">
                {(m.display_name ?? "?").slice(0, 1).toUpperCase()}
              </div>
              <div className="flex-1">
                <div className="text-sm font-medium">{m.display_name ?? "Unnamed user"}</div>
                <div className="text-[10px] font-mono text-muted-foreground">{m.user_id.slice(0, 8)}…</div>
              </div>
              <Select
                value={m.role}
                onValueChange={(v) => update({ data: { memberId: m.id, role: v as "editor" | "viewer" } })
                  .then(() => qc.invalidateQueries({ queryKey: ["members", projectId] }))}
              >
                <SelectTrigger className="h-8 w-24 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="editor">Editor</SelectItem>
                  <SelectItem value="viewer">Viewer</SelectItem>
                </SelectContent>
              </Select>
              <Button size="icon" variant="ghost" onClick={() => remove({ data: { memberId: m.id } })
                .then(() => { toast.success("Removed"); qc.invalidateQueries({ queryKey: ["members", projectId] }); })}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
