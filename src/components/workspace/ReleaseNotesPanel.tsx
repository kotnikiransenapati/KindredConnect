import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  generateReleaseNotes, listReleaseNotes, updateReleaseNote, deleteReleaseNote,
} from "@/lib/release-notes.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, Sparkles, Trash2, CheckCircle2, Send } from "lucide-react";

type Channel = "production"|"beta"|"internal";
type Platform = "ios"|"android"|"web"|"all";
type Tone = "friendly"|"formal"|"playful"|"technical";

export function ReleaseNotesPanel({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const gen = useServerFn(generateReleaseNotes);
  const list = useServerFn(listReleaseNotes);
  const upd = useServerFn(updateReleaseNote);
  const del = useServerFn(deleteReleaseNote);

  const notes = useQuery({
    queryKey: ["release-notes", projectId],
    queryFn: () => list({ data: { projectId, limit: 50 } }),
    refetchInterval: 15_000,
  });
  const invalidate = () => qc.invalidateQueries({ queryKey: ["release-notes", projectId] });

  const [version, setVersion] = useState("1.0.0");
  const [channel, setChannel] = useState<Channel>("production");
  const [platform, setPlatform] = useState<Platform>("all");
  const [tone, setTone] = useState<Tone>("friendly");
  const [language, setLanguage] = useState("en");
  const [commitsText, setCommitsText] = useState(
    "feat: redesign onboarding flow\nfix: crash when offline on first launch\nperf: 30% faster cold start\nfeat!: remove deprecated v1 API",
  );

  const generateM = useMutation({
    mutationFn: () => {
      const commits = commitsText.split("\n").map(l => l.trim()).filter(Boolean)
        .map(message => ({ message }));
      if (!commits.length) throw new Error("Add at least one commit / change line");
      return gen({ data: {
        projectId, version, channel, platform, tone, language,
        commits, persistAsDraft: true,
      } });
    },
    onSuccess: (r) => {
      toast.success(`Generated via ${r.provider}`);
      invalidate();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const setStatusM = useMutation({
    mutationFn: ({ id, status }: { id: string; status: "draft"|"approved"|"published"|"archived" }) =>
      upd({ data: { id, projectId, status } }),
    onSuccess: () => { toast.success("Updated"); invalidate(); },
    onError: (e: any) => toast.error(e.message),
  });
  const deleteM = useMutation({
    mutationFn: (id: string) => del({ data: { id, projectId } }),
    onSuccess: () => { toast.success("Deleted"); invalidate(); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-4 w-4" /> Release Notes
          <Badge variant="secondary">{notes.data?.length ?? 0}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="generate">
          <TabsList>
            <TabsTrigger value="generate">Generate</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
          </TabsList>

          <TabsContent value="generate" className="space-y-3 mt-3">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Version</Label>
                <Input value={version} onChange={e => setVersion(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Channel</Label>
                <Select value={channel} onValueChange={(v) => setChannel(v as Channel)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="production">production</SelectItem>
                    <SelectItem value="beta">beta</SelectItem>
                    <SelectItem value="internal">internal</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Platform</Label>
                <Select value={platform} onValueChange={(v) => setPlatform(v as Platform)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">all</SelectItem>
                    <SelectItem value="ios">ios</SelectItem>
                    <SelectItem value="android">android</SelectItem>
                    <SelectItem value="web">web</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Tone</Label>
                <Select value={tone} onValueChange={(v) => setTone(v as Tone)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="friendly">friendly</SelectItem>
                    <SelectItem value="formal">formal</SelectItem>
                    <SelectItem value="playful">playful</SelectItem>
                    <SelectItem value="technical">technical</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Language</Label>
                <Input value={language} onChange={e => setLanguage(e.target.value)} maxLength={10} />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Commits / changes (one per line, conventional-commit aware)</Label>
              <Textarea rows={6} value={commitsText} onChange={e => setCommitsText(e.target.value)}
                placeholder="feat: ... / fix: ... / perf: ... / feat!: breaking ..." />
            </div>
            <Button onClick={() => generateM.mutate()} disabled={generateM.isPending}>
              {generateM.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
              Generate draft
            </Button>
          </TabsContent>

          <TabsContent value="history" className="space-y-2 mt-3">
            {(notes.data ?? []).map((n: any) => (
              <div key={n.id} className="border rounded-lg p-3 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{n.version}</Badge>
                  <Badge variant="secondary">{n.channel}</Badge>
                  <Badge variant="secondary">{n.platform}</Badge>
                  <Badge variant="secondary">{n.tone}</Badge>
                  <Badge>{n.status}</Badge>
                  <div className="ml-auto flex gap-1">
                    {n.status !== "approved" && (
                      <Button size="sm" variant="outline" onClick={() => setStatusM.mutate({ id: n.id, status: "approved" })}>
                        <CheckCircle2 className="h-3 w-3 mr-1" /> Approve
                      </Button>
                    )}
                    {n.status !== "published" && (
                      <Button size="sm" onClick={() => setStatusM.mutate({ id: n.id, status: "published" })}>
                        <Send className="h-3 w-3 mr-1" /> Publish
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => deleteM.mutate(n.id)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
                {Array.isArray(n.highlights) && n.highlights.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {n.highlights.slice(0, 8).map((h: string, i: number) => (
                      <Badge key={i} variant="outline" className="text-xs">{h}</Badge>
                    ))}
                  </div>
                )}
                <pre className="text-xs bg-muted/30 rounded p-2 whitespace-pre-wrap max-h-60 overflow-auto">{n.summary_md}</pre>
                {Array.isArray(n.breaking) && n.breaking.length > 0 && (
                  <div className="text-xs">
                    <div className="font-medium text-destructive mb-1">Breaking</div>
                    <ul className="list-disc list-inside space-y-0.5">
                      {n.breaking.map((b: string, i: number) => <li key={i}>{b}</li>)}
                    </ul>
                  </div>
                )}
              </div>
            ))}
            {!notes.data?.length && <div className="text-sm text-muted-foreground">No release notes yet.</div>}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
