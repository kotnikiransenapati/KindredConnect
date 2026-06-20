// Team workspaces: create orgs, manage members, invitations, plan/seats.
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  listMyOrganizations, createOrganization, updateOrganizationPlan,
  listOrganizationMembers, updateMemberRole, removeMember,
  listInvitations, inviteMember, revokeInvitation,
} from "@/lib/organizations.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Building2, Plus, UserPlus, Trash2, Copy, Crown, Shield } from "lucide-react";
import { toast } from "sonner";

const PLANS = [
  { id: "hobby", label: "Hobby", seats: 3 },
  { id: "pro", label: "Pro", seats: 10 },
  { id: "team", label: "Team", seats: 25 },
  { id: "enterprise", label: "Enterprise", seats: 100 },
] as const;

export function OrganizationsPanel() {
  const qc = useQueryClient();
  const listFn = useServerFn(listMyOrganizations);
  const orgsQ = useQuery({ queryKey: ["orgs"], queryFn: () => listFn(), refetchInterval: 30_000 });
  const [active, setActive] = useState<string | null>(null);
  const orgs = orgsQ.data?.organizations ?? [];
  const current = orgs.find((o: any) => o.id === active) ?? orgs[0];

  return (
    <section className="rounded-2xl border border-border/60 bg-card/70 p-4 shadow-card backdrop-blur">
      <header className="mb-3 flex items-center gap-2">
        <Building2 className="h-4 w-4 text-brand" />
        <h3 className="font-display text-sm font-semibold">Team workspaces</h3>
        <span className="ml-auto text-[10px] text-muted-foreground">{orgs.length} org{orgs.length === 1 ? "" : "s"}</span>
      </header>

      <CreateOrgForm onCreated={(id) => { qc.invalidateQueries({ queryKey: ["orgs"] }); setActive(id); }} />

      {orgs.length > 0 && (
        <>
          <div className="mb-3 mt-4 flex flex-wrap gap-1.5">
            {orgs.map((o: any) => (
              <button key={o.id} onClick={() => setActive(o.id)}
                className={`rounded-full border px-2.5 py-1 text-[11px] ${current?.id === o.id ? "border-brand bg-brand/10 text-brand" : "border-border/60 text-muted-foreground hover:text-foreground"}`}>
                {o.name} <span className="opacity-60">/{o.slug}</span>
              </button>
            ))}
          </div>

          {current && <OrgDetail org={current} />}
        </>
      )}
    </section>
  );
}

function CreateOrgForm({ onCreated }: { onCreated: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const createFn = useServerFn(createOrganization);
  const mu = useMutation({
    mutationFn: () => createFn({ data: { name, slug } }),
    onSuccess: (r: any) => { onCreated(r.organization.id); setName(""); setSlug(""); setOpen(false); toast.success("Workspace created"); },
    onError: (e: any) => toast.error(e.message),
  });
  return (
    <div>
      {!open ? (
        <Button size="sm" variant="outline" onClick={() => setOpen(true)} className="h-8 text-xs">
          <Plus className="mr-1 h-3 w-3" /> New workspace
        </Button>
      ) : (
        <div className="space-y-2 rounded-lg border border-border/60 p-3">
          <Input placeholder="Acme Studio" value={name} onChange={(e) => {
            setName(e.target.value);
            if (!slug) setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40));
          }} className="h-8 text-xs" />
          <Input placeholder="acme-studio" value={slug} onChange={(e) => setSlug(e.target.value)} className="h-8 font-mono text-xs" />
          <div className="flex gap-2">
            <Button size="sm" className="h-8 text-xs" disabled={!name || !slug || mu.isPending}
              onClick={() => mu.mutate()}>{mu.isPending ? "Creating…" : "Create"}</Button>
            <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setOpen(false)}>Cancel</Button>
          </div>
        </div>
      )}
    </div>
  );
}

function OrgDetail({ org }: { org: any }) {
  const qc = useQueryClient();
  const membersFn = useServerFn(listOrganizationMembers);
  const invitesFn = useServerFn(listInvitations);
  const planFn = useServerFn(updateOrganizationPlan);
  const membersQ = useQuery({ queryKey: ["org-members", org.id], queryFn: () => membersFn({ data: { orgId: org.id } }) });
  const invitesQ = useQuery({ queryKey: ["org-invites", org.id], queryFn: () => invitesFn({ data: { orgId: org.id } }) });

  const isAdmin = org.my_role === "owner" || org.my_role === "admin";

  const planMu = useMutation({
    mutationFn: (p: { planId: any; seats: number }) => planFn({ data: { orgId: org.id, ...p } }),
    onSuccess: () => { toast.success("Plan updated"); qc.invalidateQueries({ queryKey: ["orgs"] }); },
    onError: (e: any) => toast.error(e.message),
  });


  return (
    <Tabs defaultValue="members">
      <TabsList className="h-8">
        <TabsTrigger value="members" className="h-7 text-[11px]">Members</TabsTrigger>
        <TabsTrigger value="invites" className="h-7 text-[11px]">Invitations</TabsTrigger>
        <TabsTrigger value="billing" className="h-7 text-[11px]">Billing</TabsTrigger>
      </TabsList>

      <TabsContent value="members" className="mt-3 space-y-2">
        {(membersQ.data?.members ?? []).map((m: any) => (
          <MemberRow key={m.id} member={m} canManage={isAdmin && m.role !== "owner"} orgId={org.id} />
        ))}
        {membersQ.isLoading && <p className="text-[11px] text-muted-foreground">Loading…</p>}
      </TabsContent>

      <TabsContent value="invites" className="mt-3 space-y-2">
        {isAdmin && <InviteForm orgId={org.id} />}
        {(invitesQ.data?.invitations ?? []).map((inv: any) => (
          <InviteRow key={inv.id} invite={inv} canManage={isAdmin} />
        ))}
        {(invitesQ.data?.invitations ?? []).length === 0 && (
          <p className="text-[11px] text-muted-foreground">No pending invitations.</p>
        )}
      </TabsContent>

      <TabsContent value="billing" className="mt-3 space-y-3">
        <div className="rounded-lg border border-border/60 p-3 text-xs">
          <p className="text-muted-foreground">Current plan</p>
          <p className="mt-1 font-semibold">{org.plan_id} · {org.seats} seats</p>
        </div>
        {isAdmin && (
          <div className="grid grid-cols-2 gap-2">
            {PLANS.map((p) => (
              <button key={p.id}
                disabled={planMu.isPending || p.id === org.plan_id}
                onClick={() => planMu.mutate({ planId: p.id, seats: p.seats })}
                className={`rounded-lg border p-3 text-left text-xs transition ${
                  p.id === org.plan_id ? "border-brand bg-brand/10" : "border-border/60 hover:border-brand/40"
                }`}>
                <div className="font-semibold">{p.label}</div>
                <div className="text-muted-foreground">{p.seats} seats</div>
              </button>
            ))}
          </div>
        )}
      </TabsContent>
    </Tabs>
  );
}

function MemberRow({ member, canManage, orgId }: { member: any; canManage: boolean; orgId: string }) {
  const qc = useQueryClient();
  const updateFn = useServerFn(updateMemberRole);
  const removeFn = useServerFn(removeMember);
  const roleMu = useMutation({
    mutationFn: (role: any) => updateFn({ data: { memberId: member.id, role } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["org-members", orgId] }),
    onError: (e: any) => toast.error(e.message),
  });
  const removeMu = useMutation({
    mutationFn: () => removeFn({ data: { memberId: member.id } }),
    onSuccess: () => { toast.success("Removed"); qc.invalidateQueries({ queryKey: ["org-members", orgId] }); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="flex items-center gap-2 rounded-lg border border-border/60 p-2 text-xs">
      {member.role === "owner" ? <Crown className="h-3.5 w-3.5 text-amber-400" /> : <Shield className="h-3.5 w-3.5 text-muted-foreground" />}
      <span className="flex-1 truncate">{member.profiles?.display_name ?? member.user_id.slice(0, 8)}</span>
      {canManage ? (
        <Select value={member.role} onValueChange={(v) => roleMu.mutate(v)}>
          <SelectTrigger className="h-7 w-24 text-[11px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="admin">Admin</SelectItem>
            <SelectItem value="editor">Editor</SelectItem>
            <SelectItem value="viewer">Viewer</SelectItem>
          </SelectContent>
        </Select>
      ) : (
        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px]">{member.role}</span>
      )}
      {canManage && (
        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => removeMu.mutate()}>
          <Trash2 className="h-3 w-3" />
        </Button>
      )}
    </div>
  );
}

function InviteForm({ orgId }: { orgId: string }) {
  const qc = useQueryClient();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "editor" | "viewer">("editor");
  const inviteFn = useServerFn(inviteMember);
  const mu = useMutation({
    mutationFn: () => inviteFn({ data: { orgId, email, role } }),
    onSuccess: () => { setEmail(""); qc.invalidateQueries({ queryKey: ["org-invites", orgId] }); toast.success("Invitation sent"); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="flex gap-2">
      <Input placeholder="teammate@example.com" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="h-8 text-xs" />
      <Select value={role} onValueChange={(v) => setRole(v as any)}>
        <SelectTrigger className="h-8 w-24 text-[11px]"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="admin">Admin</SelectItem>
          <SelectItem value="editor">Editor</SelectItem>
          <SelectItem value="viewer">Viewer</SelectItem>
        </SelectContent>
      </Select>
      <Button size="sm" className="h-8 text-xs" disabled={!email || mu.isPending} onClick={() => mu.mutate()}>
        <UserPlus className="mr-1 h-3 w-3" />{mu.isPending ? "Sending…" : "Invite"}
      </Button>
    </div>
  );
}

function InviteRow({ invite, canManage }: { invite: any; canManage: boolean }) {
  const qc = useQueryClient();
  const revokeFn = useServerFn(revokeInvitation);
  const revokeMu = useMutation({
    mutationFn: () => revokeFn({ data: { invitationId: invite.id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["org-invites"] }),
    onError: (e: any) => toast.error(e.message),
  });

  const link = `${typeof window !== "undefined" ? window.location.origin : ""}/invite?token=${invite.token}`;
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border/60 p-2 text-xs">
      <span className="flex-1 truncate">{invite.email}</span>
      <span className="rounded-full bg-muted px-2 py-0.5 text-[10px]">{invite.role}</span>
      {invite.accepted_at ? (
        <span className="text-[10px] text-emerald-400">accepted</span>
      ) : (
        <>
          <Button size="icon" variant="ghost" className="h-7 w-7"
            onClick={() => { navigator.clipboard.writeText(link); toast.success("Invite link copied"); }}>
            <Copy className="h-3 w-3" />
          </Button>
          {canManage && (
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => revokeMu.mutate()}>
              <Trash2 className="h-3 w-3" />
            </Button>
          )}
        </>
      )}
    </div>
  );
}
