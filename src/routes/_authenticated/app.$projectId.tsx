import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { getProject } from "@/lib/projects.functions";
import { listMessages, listProjectFiles } from "@/lib/chat.functions";
import { SiteHeader } from "@/components/site/SiteHeader";
import { ChatPanel } from "@/components/workspace/ChatPanel";
import { FileTree } from "@/components/workspace/FileTree";
import { FileViewer } from "@/components/workspace/FileViewer";
import { LivePreview } from "@/components/workspace/LivePreview";
import { ProjectActions } from "@/components/workspace/ProjectActions";
import { MembersDialog } from "@/components/workspace/MembersDialog";
import { ActivityFeed } from "@/components/workspace/ActivityFeed";
import { KnowledgePanel } from "@/components/workspace/KnowledgePanel";
import { DeploymentsPanel } from "@/components/workspace/DeploymentsPanel";
import { PresenceBar } from "@/components/workspace/PresenceBar";
import { CommentsPanel } from "@/components/workspace/CommentsPanel";
import { IntegrationsPanel } from "@/components/workspace/IntegrationsPanel";
import { PublishTemplateDialog } from "@/components/workspace/PublishTemplateDialog";
import { MobileBuilderPanel } from "@/components/workspace/MobileBuilderPanel";
import { PreferencesDialog } from "@/components/workspace/PreferencesDialog";
import { OnboardingTour } from "@/components/workspace/OnboardingTour";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ArrowLeft, Play, Code2 } from "lucide-react";
import type { UIMessage } from "ai";

export const Route = createFileRoute("/_authenticated/app/$projectId")({
  head: () => ({ meta: [{ title: "Project — Foundry" }] }),
  component: ProjectWorkspace,
  errorComponent: ({ error }) => <div className="p-10 text-destructive">{error.message}</div>,
  notFoundComponent: () => <div className="p-10">Project not found.</div>,
});

function ProjectWorkspace() {
  const { projectId } = useParams({ from: "/_authenticated/app/$projectId" });
  const fetchProject = useServerFn(getProject);
  const fetchMessages = useServerFn(listMessages);
  const fetchFiles = useServerFn(listProjectFiles);

  const projectQ = useQuery({
    queryKey: ["project", projectId],
    queryFn: () => fetchProject({ data: { id: projectId } }),
  });
  const msgsQ = useQuery({
    queryKey: ["messages", projectId],
    queryFn: () => fetchMessages({ data: { projectId } }),
  });
  const filesQ = useQuery({
    queryKey: ["project-files", projectId],
    queryFn: () => fetchFiles({ data: { projectId } }),
    refetchInterval: 3000,
  });

  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [tab, setTab] = useState<"preview" | "code">("preview");

  const initialMessages: UIMessage[] = (msgsQ.data?.messages ?? []).map((m) => ({
    id: m.id,
    role: m.role as "user" | "assistant" | "system",
    parts: (Array.isArray(m.parts) ? m.parts : []) as UIMessage["parts"],
  }));

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-[1500px] px-6 py-6">
        <Link to="/app" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> All projects
        </Link>

        {projectQ.isLoading || msgsQ.isLoading ? (
          <div className="h-64 animate-pulse rounded-2xl border border-border/60 bg-card/40" />
        ) : projectQ.data ? (
          <>
            <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h1 className="font-display text-3xl font-semibold tracking-tight">{projectQ.data.name}</h1>
                {projectQ.data.description && <p className="mt-1 text-sm text-muted-foreground">{projectQ.data.description}</p>}
              </div>
              <div className="flex items-center gap-2">
                <PresenceBar projectId={projectId} />
                <PreferencesDialog />
                <PublishTemplateDialog projectId={projectId} />
                <MembersDialog projectId={projectId} />
                <ProjectActions
                  projectId={projectId}
                  isPublic={projectQ.data.is_public ?? false}
                  shareToken={projectQ.data.public_share_token ?? null}
                />
              </div>
            </div>
            <OnboardingTour />


            <div className="grid gap-4 lg:grid-cols-[400px_1fr]">
              <ChatPanel projectId={projectId} initialMessages={initialMessages} />

              <div className="space-y-3">
                <Tabs value={tab} onValueChange={(v) => setTab(v as "preview" | "code")}>
                  <TabsList>
                    <TabsTrigger value="preview"><Play className="mr-1.5 h-3.5 w-3.5" /> Preview</TabsTrigger>
                    <TabsTrigger value="code"><Code2 className="mr-1.5 h-3.5 w-3.5" /> Code</TabsTrigger>
                  </TabsList>
                  <TabsContent value="preview" className="mt-3">
                    <LivePreview files={filesQ.data?.files ?? []} />
                  </TabsContent>
                  <TabsContent value="code" className="mt-3">
                    <div className="grid gap-3 md:grid-cols-[240px_1fr]">
                      <FileTree projectId={projectId} selectedPath={selectedPath} onSelect={setSelectedPath} />
                      <FileViewer projectId={projectId} path={selectedPath} slug={projectQ.data.slug} />
                    </div>
                  </TabsContent>
                </Tabs>
                <DeploymentsPanel projectId={projectId} />
                <CommentsPanel projectId={projectId} anchorPath={selectedPath} />
                <KnowledgePanel projectId={projectId} />
                <IntegrationsPanel projectId={projectId} />
                <MobileBuilderPanel projectId={projectId} />
                <ActivityFeed projectId={projectId} />
              </div>
            </div>
          </>
        ) : null}
      </main>
    </div>
  );
}
