// Invite acceptance landing — signed-in users only.
import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { useEffect } from "react";
import { acceptInvitation } from "@/lib/organizations.functions";
import { SiteHeader } from "@/components/site/SiteHeader";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/invite")({
  head: () => ({ meta: [{ title: "Accept invitation — Foundry" }] }),
  validateSearch: (s: Record<string, unknown>) => ({ token: typeof s.token === "string" ? s.token : "" }),
  component: InvitePage,
  errorComponent: ({ error }) => <div className="p-10 text-destructive">{error.message}</div>,
  notFoundComponent: () => <div className="p-10">Invitation not found.</div>,
});

function InvitePage() {
  const { token } = useSearch({ from: "/_authenticated/invite" });
  const navigate = useNavigate();
  const accept = useServerFn(acceptInvitation);
  const mu = useMutation({
    mutationFn: () => accept({ data: { token } }),
    onSuccess: () => { setTimeout(() => navigate({ to: "/app" }), 1200); },
  });

  useEffect(() => { if (token) mu.mutate(); }, [token]);

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto grid max-w-md place-items-center px-6 py-24 text-center">
        {mu.isPending && <><Loader2 className="h-8 w-8 animate-spin text-brand" /><p className="mt-4 text-sm text-muted-foreground">Joining workspace…</p></>}
        {mu.isSuccess && <><CheckCircle2 className="h-10 w-10 text-emerald-400" /><h1 className="mt-4 font-display text-2xl">You're in!</h1><p className="mt-2 text-sm text-muted-foreground">Redirecting to your projects…</p></>}
        {mu.isError && <><XCircle className="h-10 w-10 text-destructive" /><h1 className="mt-4 font-display text-2xl">Cannot accept invitation</h1><p className="mt-2 text-sm text-destructive">{(mu.error as Error).message}</p></>}
        {!token && <p className="text-sm text-muted-foreground">Missing invite token in URL.</p>}
      </main>
    </div>
  );
}
