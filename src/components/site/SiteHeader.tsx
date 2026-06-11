import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";
import { NotificationsBell } from "@/components/site/NotificationsBell";

export function SiteHeader() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setAuthed(!!data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => setAuthed(!!session));
    return () => sub.subscription.unsubscribe();
  }, []);

  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/70 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
        <Link to="/" className="flex items-center gap-2 font-display text-lg font-semibold tracking-tight">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-brand text-brand-foreground shadow-elegant">
            <Sparkles className="h-4 w-4" />
          </span>
          Foundry
        </Link>
        <nav className="hidden items-center gap-8 text-sm text-muted-foreground md:flex">
          <Link to="/" hash="features" className="hover:text-foreground transition-colors">Features</Link>
          <Link to="/pricing" className="hover:text-foreground transition-colors" activeProps={{ className: "text-foreground" }}>Pricing</Link>
          <Link to="/" hash="how" className="hover:text-foreground transition-colors">How it works</Link>
        </nav>
        <div className="flex items-center gap-2">
          {authed ? (
            <>
              <NotificationsBell />
              <Button variant="ghost" asChild>
                <Link to="/app">Dashboard</Link>
              </Button>
              <Button variant="ghost" asChild className="hidden sm:inline-flex">
                <Link to="/_authenticated/templates" search={{}}>Templates</Link>
              </Button>
              <Button
                variant="outline"
                onClick={async () => {
                  await supabase.auth.signOut();
                  navigate({ to: "/" });
                }}
              >
                Sign out
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" asChild>
                <Link to="/auth">Sign in</Link>
              </Button>
              <Button asChild className="bg-gradient-brand text-brand-foreground hover:opacity-90">
                <Link to="/auth">Start building</Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
