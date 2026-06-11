import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { createProject, deleteProject, listProjects } from "@/lib/projects.functions";
import { SiteHeader } from "@/components/site/SiteHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Trash2, ArrowRight, Sparkles, LayoutTemplate } from "lucide-react";
import { UsageCard } from "@/components/workspace/UsageCard";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

export const Route = createFileRoute("/_authenticated/app")({
  head: () => ({ meta: [{ title: "Dashboard — Foundry" }] }),
  component: Dashboard,
});

function Dashboard() {
  const list = useServerFn(listProjects);
  const create = useServerFn(createProject);
  const remove = useServerFn(deleteProject);
  const qc = useQueryClient();
  const navigate = useNavigate();

  const { data: projects, isLoading } = useQuery({
    queryKey: ["projects"],
    queryFn: () => list(),
  });

  const createMut = useMutation({
    mutationFn: (data: { name: string; initial_prompt?: string }) => create({ data }),
    onSuccess: (proj) => {
      qc.invalidateQueries({ queryKey: ["projects"] });
      toast.success("Project created");
      navigate({ to: "/app/$projectId", params: { projectId: proj!.id } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projects"] });
      toast.success("Project deleted");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-7xl px-6 py-12">
        <div className="mb-10 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="font-display text-4xl font-semibold tracking-tight">Your projects</h1>
            <p className="mt-1 text-sm text-muted-foreground">Pick up where you left off, or start something new.</p>
          </div>
          <NewProjectDialog onCreate={(d) => createMut.mutate(d)} loading={createMut.isPending} />
        </div>

        <div className="mb-8 grid gap-4 md:grid-cols-[1fr_320px]">
          <UsageCard />
          <Link
            to="/templates"
            className="group flex items-center justify-between rounded-2xl border border-border/60 bg-gradient-to-br from-brand/10 to-transparent p-5 shadow-card transition-colors hover:border-brand/50"
          >
            <div>
              <div className="flex items-center gap-2 font-display text-base font-semibold">
                <LayoutTemplate className="h-4 w-4 text-brand" /> Templates
              </div>
              <p className="mt-1 text-xs text-muted-foreground">Start from a curated starter — SaaS, dashboard, blog, more.</p>
            </div>
            <ArrowRight className="h-4 w-4 text-brand transition-transform group-hover:translate-x-1" />
          </Link>
        </div>




        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-44 animate-pulse rounded-2xl border border-border/60 bg-card/40" />
            ))}
          </div>
        ) : projects && projects.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {projects.map((p) => (
              <ProjectCard
                key={p.id}
                project={p}
                onDelete={() => deleteMut.mutate(p.id)}
                deleting={deleteMut.isPending}
              />
            ))}
          </div>
        ) : (
          <EmptyState onCreate={(d) => createMut.mutate(d)} loading={createMut.isPending} />
        )}
      </main>
    </div>
  );
}

function ProjectCard({
  project,
  onDelete,
  deleting,
}: {
  project: { id: string; name: string; description: string | null; updated_at: string };
  onDelete: () => void;
  deleting: boolean;
}) {
  return (
    <div className="group relative rounded-2xl border border-border/60 bg-card/70 p-6 shadow-card backdrop-blur transition-colors hover:border-brand/40">
      <button
        onClick={(e) => {
          e.preventDefault();
          if (confirm(`Delete "${project.name}"? This cannot be undone.`)) onDelete();
        }}
        disabled={deleting}
        className="absolute right-4 top-4 rounded-md p-1.5 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
        aria-label="Delete project"
      >
        <Trash2 className="h-4 w-4" />
      </button>
      <Link to="/app/$projectId" params={{ projectId: project.id }} className="block">
        <div className="font-display text-xl">{project.name}</div>
        <p className="mt-2 line-clamp-2 min-h-[2.5rem] text-sm text-muted-foreground">
          {project.description || "No description yet."}
        </p>
        <div className="mt-6 flex items-center justify-between text-xs text-muted-foreground">
          <span>Updated {formatDistanceToNow(new Date(project.updated_at), { addSuffix: true })}</span>
          <span className="inline-flex items-center gap-1 text-brand">
            Open <ArrowRight className="h-3 w-3" />
          </span>
        </div>
      </Link>
    </div>
  );
}

function EmptyState({ onCreate, loading }: { onCreate: (d: { name: string; initial_prompt?: string }) => void; loading: boolean }) {
  return (
    <div className="rounded-3xl border border-dashed border-border/80 bg-card/30 p-16 text-center">
      <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-gradient-brand text-brand-foreground shadow-elegant">
        <Sparkles className="h-6 w-6" />
      </div>
      <h2 className="mt-6 font-display text-2xl">No projects yet</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
        Start by describing what you want to build. Foundry will scaffold the app, the database, and the UI for you.
      </p>
      <div className="mt-6 inline-block">
        <NewProjectDialog onCreate={onCreate} loading={loading} />
      </div>
    </div>
  );
}

function NewProjectDialog({
  onCreate,
  loading,
}: {
  onCreate: (d: { name: string; initial_prompt?: string }) => void;
  loading: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [prompt, setPrompt] = useState("");

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="bg-gradient-brand text-brand-foreground hover:opacity-95">
          <Plus className="mr-1 h-4 w-4" /> New project
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">Start a new project</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return;
            onCreate({ name: name.trim(), initial_prompt: prompt.trim() || undefined });
            setOpen(false);
            setName("");
            setPrompt("");
          }}
          className="space-y-4"
        >
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Project name</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="My yoga booking app" maxLength={80} required />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">What do you want to build? (optional)</label>
            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="A booking page for my yoga studio with a calendar and Stripe checkout…"
              maxLength={4000}
              rows={5}
            />
          </div>
          <Button type="submit" disabled={loading} className="w-full bg-gradient-brand text-brand-foreground hover:opacity-95">
            {loading ? "Creating…" : "Create project"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
