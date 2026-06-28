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
import { OtaPanel } from "@/components/workspace/OtaPanel";
import { QualityGatesPanel } from "@/components/workspace/QualityGatesPanel";
import { VersionsPanel } from "@/components/workspace/VersionsPanel";
import { SecretsVaultPanel } from "@/components/workspace/SecretsVaultPanel";
import { DomainsPanel } from "@/components/workspace/DomainsPanel";
import { SkillsMarketplacePanel } from "@/components/workspace/SkillsMarketplacePanel";
import { CiGatesPanel } from "@/components/workspace/CiGatesPanel";
import { NativeBuildsPanel } from "@/components/workspace/NativeBuildsPanel";
import { MobileScreensPanel } from "@/components/workspace/MobileScreensPanel";
import { PushPanel } from "@/components/workspace/PushPanel";
import { StoreListingsPanel } from "@/components/workspace/StoreListingsPanel";
import { AgentsPanel } from "@/components/workspace/AgentsPanel";
import { AgentSchedulesPanel } from "@/components/workspace/AgentSchedulesPanel";
import { ModelRoutingPanel } from "@/components/workspace/ModelRoutingPanel";
import { E2ETestsPanel } from "@/components/workspace/E2ETestsPanel";
import { SelfHealPanel } from "@/components/workspace/SelfHealPanel";
import { OrganizationsPanel } from "@/components/workspace/OrganizationsPanel";
import { AnalyticsPanel } from "@/components/workspace/AnalyticsPanel";
import { AuditLogPanel } from "@/components/workspace/AuditLogPanel";
import { SsoConnectionsPanel } from "@/components/workspace/SsoConnectionsPanel";
import { GuardrailsPanel } from "@/components/workspace/GuardrailsPanel";
import { ScimPanel } from "@/components/workspace/ScimPanel";
import { MarketplacePanel } from "@/components/workspace/MarketplacePanel";
import { SiemStreamingPanel } from "@/components/workspace/SiemStreamingPanel";
import { A2APanel } from "@/components/workspace/A2APanel";
import { UsageMeteringPanel } from "@/components/workspace/UsageMeteringPanel";
import { ZeroTrustPanel } from "@/components/workspace/ZeroTrustPanel";
import { DevicePairingPanel } from "@/components/workspace/DevicePairingPanel";
import { NativeCapabilitiesPanel } from "@/components/workspace/NativeCapabilitiesPanel";
import { CrashReportsPanel } from "@/components/workspace/CrashReportsPanel";
import { StoreSubmissionsPanel } from "@/components/workspace/StoreSubmissionsPanel";
import { ExperimentsPanel } from "@/components/workspace/ExperimentsPanel";
import { BundleAnalyzerPanel } from "@/components/workspace/BundleAnalyzerPanel";
import { HotReloadPanel } from "@/components/workspace/HotReloadPanel";
import { CanaryPanel } from "@/components/workspace/CanaryPanel";
import { AssetCompressionPanel } from "@/components/workspace/AssetCompressionPanel";
import { EdgeCachePanel } from "@/components/workspace/EdgeCachePanel";
import { PasskeysPanel } from "@/components/workspace/PasskeysPanel";
import { ReviewPromptsPanel } from "@/components/workspace/ReviewPromptsPanel";
import { ReleaseNotesPanel } from "@/components/workspace/ReleaseNotesPanel";
import { ResidencyPanel } from "@/components/workspace/ResidencyPanel";
import { AppClipsPanel } from "@/components/workspace/AppClipsPanel";
import { OnDeviceLlmPanel } from "@/components/workspace/OnDeviceLlmPanel";
import { KmsPanel } from "@/components/workspace/KmsPanel";
import { AnomalyDetectionPanel } from "@/components/workspace/AnomalyDetectionPanel";
import { CollabEditorPanel } from "@/components/workspace/CollabEditorPanel";
import { BuildPipelinePanel } from "@/components/workspace/BuildPipelinePanel";
import { AiTestsPanel } from "@/components/workspace/AiTestsPanel";
import { FailoverPanel } from "@/components/workspace/FailoverPanel";
import { ProvenancePanel } from "@/components/workspace/ProvenancePanel";
import { EdgeAiRouterPanel } from "@/components/workspace/EdgeAiRouterPanel";
import { ImpactAnalysisPanel } from "@/components/workspace/ImpactAnalysisPanel";
import { FleetPanel } from "@/components/workspace/FleetPanel";
import { WhiteboardPanel } from "@/components/workspace/WhiteboardPanel";
import { CostGuardrailsPanel } from "@/components/workspace/CostGuardrailsPanel";
import { PluginsPanel } from "@/components/workspace/PluginsPanel";
import { SpatialScenePanel } from "@/components/workspace/SpatialScenePanel";
import { ComponentPalettePanel } from "@/components/workspace/ComponentPalettePanel";
import { DeviceStudioPanel } from "@/components/workspace/DeviceStudioPanel";
import { InspectorHudPanel } from "@/components/workspace/InspectorHudPanel";
import { AnimationTimelinePanel } from "@/components/workspace/AnimationTimelinePanel";
import { SpatialPresencePanel } from "@/components/workspace/SpatialPresencePanel";
import { AccessibilityPanel } from "@/components/workspace/AccessibilityPanel";
import { IrEditorPanel } from "@/components/workspace/IrEditorPanel";
import { IrPlannerPanel } from "@/components/workspace/IrPlannerPanel";
import { PageEditorPanel } from "@/components/workspace/PageEditorPanel";
import { IrPatchReviewPanel } from "@/components/workspace/IrPatchReviewPanel";
import { PipelineTimelinePanel } from "@/components/workspace/PipelineTimelinePanel";
import { RuntimeAdaptersPanel } from "@/components/workspace/RuntimeAdaptersPanel";
import { CrossPlatformTargetsPanel } from "@/components/workspace/CrossPlatformTargetsPanel";
import { DeployOrchestratorPanel } from "@/components/workspace/DeployOrchestratorPanel";
import { ProductionReadinessPanel } from "@/components/workspace/ProductionReadinessPanel";
import { FoundryLaunchCenterPanel } from "@/components/workspace/FoundryLaunchCenterPanel";


import { PreferencesDialog } from "@/components/workspace/PreferencesDialog";
import { OnboardingTour } from "@/components/workspace/OnboardingTour";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ArrowLeft, Play, Code2 } from "lucide-react";
import { AvRoomsPanel } from "@/components/workspace/AvRoomsPanel";
import { AiChangelogPanel } from "@/components/workspace/AiChangelogPanel";
import { EvidenceVaultPanel } from "@/components/workspace/EvidenceVaultPanel";
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
                <AgentsPanel projectId={projectId} />
                <AgentSchedulesPanel projectId={projectId} />
                <ModelRoutingPanel projectId={projectId} />
                <QualityGatesPanel projectId={projectId} />
                <MobileBuilderPanel projectId={projectId} />
                <MobileScreensPanel projectId={projectId} />
                <NativeBuildsPanel projectId={projectId} />
                <PushPanel projectId={projectId} />
                <StoreListingsPanel projectId={projectId} />
                <OtaPanel projectId={projectId} />


                <SecretsVaultPanel projectId={projectId} />
                <DomainsPanel projectId={projectId} />
                <VersionsPanel projectId={projectId} />
                <SkillsMarketplacePanel projectId={projectId} />
                <CiGatesPanel projectId={projectId} />
                <E2ETestsPanel projectId={projectId} />
                <SelfHealPanel projectId={projectId} />
                <OrganizationsPanel />
                <AnalyticsPanel projectId={projectId} />
                <AuditLogPanel projectId={projectId} />
                <SsoConnectionsPanel />
                <GuardrailsPanel projectId={projectId} />
                <ScimPanel />
                <MarketplacePanel />
                <SiemStreamingPanel />
                <A2APanel projectId={projectId} />
                <UsageMeteringPanel />
                <ZeroTrustPanel />
                <DevicePairingPanel projectId={projectId} />
                <NativeCapabilitiesPanel projectId={projectId} />
                <CrashReportsPanel projectId={projectId} />
                <StoreSubmissionsPanel projectId={projectId} />
                <ExperimentsPanel projectId={projectId} />
                <BundleAnalyzerPanel projectId={projectId} />
                <HotReloadPanel projectId={projectId} />
                <CanaryPanel projectId={projectId} />
                <AssetCompressionPanel projectId={projectId} />
                <EdgeCachePanel projectId={projectId} />
                <PasskeysPanel projectId={projectId} />
                <ReviewPromptsPanel projectId={projectId} />
                <ReleaseNotesPanel projectId={projectId} />
                <ResidencyPanel projectId={projectId} />
                <AppClipsPanel projectId={projectId} />
                <OnDeviceLlmPanel projectId={projectId} />
                <KmsPanel projectId={projectId} />
                <AnomalyDetectionPanel projectId={projectId} />
                <CollabEditorPanel projectId={projectId} />
                <BuildPipelinePanel projectId={projectId} />
                <AiTestsPanel projectId={projectId} />
                <FailoverPanel projectId={projectId} />
                <ProvenancePanel projectId={projectId} />
                <EdgeAiRouterPanel projectId={projectId} />
                <ImpactAnalysisPanel projectId={projectId} />
                <FleetPanel projectId={projectId} />
                <WhiteboardPanel projectId={projectId} />
                <CostGuardrailsPanel projectId={projectId} />
                <PluginsPanel projectId={projectId} />
                <AvRoomsPanel projectId={projectId} />
                <AiChangelogPanel projectId={projectId} />
                <EvidenceVaultPanel projectId={projectId} />
                <SpatialScenePanel projectId={projectId} />
                <ComponentPalettePanel projectId={projectId} />
                <DeviceStudioPanel projectId={projectId} />
                <InspectorHudPanel projectId={projectId} />
                <AnimationTimelinePanel projectId={projectId} />
                <SpatialPresencePanel projectId={projectId} />
                <AccessibilityPanel projectId={projectId} />
                <IrPlannerPanel projectId={projectId} />
                <PageEditorPanel projectId={projectId} />
                <IrPatchReviewPanel projectId={projectId} />
                <PipelineTimelinePanel projectId={projectId} />
                <RuntimeAdaptersPanel projectId={projectId} />
                <CrossPlatformTargetsPanel projectId={projectId} />
                <DeployOrchestratorPanel projectId={projectId} />
                <ProductionReadinessPanel projectId={projectId} />
                <FoundryLaunchCenterPanel projectId={projectId} />
                <IrEditorPanel projectId={projectId} />
                <ActivityFeed projectId={projectId} />



              </div>
            </div>
          </>
        ) : null}
      </main>
    </div>
  );
}
