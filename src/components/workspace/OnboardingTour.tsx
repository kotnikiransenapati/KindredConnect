import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Sparkles, MessageSquare, Eye, Rocket, BookOpen } from "lucide-react";

const STORAGE_KEY = "foundry.onboarding.v1";

const STEPS = [
  {
    icon: MessageSquare,
    title: "Chat to build",
    body: "Describe what you want in plain English. The agent plans, writes code, lints it, and self-corrects until it builds.",
  },
  {
    icon: Eye,
    title: "Live preview & code",
    body: "Switch between Preview (instant Sandpack) and Code (file tree + editor). Every change is versioned and restorable.",
  },
  {
    icon: BookOpen,
    title: "Teach it your domain",
    body: "Drop URLs, notes, or files into Knowledge — the agent retrieves the most relevant context on every turn (RAG).",
  },
  {
    icon: Rocket,
    title: "Ship it",
    body: "Deploy publishes a versioned bundle at /p/your-slug. Roll back any time. Invite collaborators with role-based access.",
  },
];

export function OnboardingTour() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const seen = window.localStorage.getItem(STORAGE_KEY);
    if (!seen) setOpen(true);
  }, []);

  const close = () => {
    if (typeof window !== "undefined") window.localStorage.setItem(STORAGE_KEY, "1");
    setOpen(false);
  };

  const s = STEPS[step];
  const Icon = s.icon;
  const isLast = step === STEPS.length - 1;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) close(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-brand text-brand-foreground">
              <Sparkles className="h-4 w-4" />
            </span>
            Welcome to Foundry
          </DialogTitle>
        </DialogHeader>

        <div className="rounded-xl border border-border/60 bg-card/40 p-5">
          <div className="mb-3 grid h-10 w-10 place-items-center rounded-lg bg-primary/10 text-primary">
            <Icon className="h-5 w-5" />
          </div>
          <h3 className="font-display text-lg font-semibold">{s.title}</h3>
          <p className="mt-1.5 text-sm text-muted-foreground">{s.body}</p>
        </div>

        <div className="flex items-center justify-center gap-1.5">
          {STEPS.map((_, i) => (
            <span
              key={i}
              className={`h-1.5 rounded-full transition-all ${i === step ? "w-6 bg-primary" : "w-1.5 bg-muted"}`}
            />
          ))}
        </div>

        <DialogFooter className="sm:justify-between">
          <Button variant="ghost" onClick={close}>Skip</Button>
          {isLast ? (
            <Button onClick={close}>Start building</Button>
          ) : (
            <Button onClick={() => setStep((s) => s + 1)}>Next</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
