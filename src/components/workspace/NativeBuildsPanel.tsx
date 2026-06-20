import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import {
  Smartphone, KeyRound, Trash2, Upload, Loader2, Play,
  CheckCircle2, XCircle, Clock, Download, Apple, Bot,
} from "lucide-react";
import { toast } from "sonner";
import {
  listSigningProfiles, uploadSigningProfile, deleteSigningProfile,
  listMobileBuilds, requestMobileBuild, getBuildArtifactUrl,
} from "@/lib/native-builds.functions";

type Platform = "ios" | "android";

export function NativeBuildsPanel({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const listSp = useServerFn(listSigningProfiles);
  const upload = useServerFn(uploadSigningProfile);
  const delSp = useServerFn(deleteSigningProfile);
  const listB = useServerFn(listMobileBuilds);
  const reqBuild = useServerFn(requestMobileBuild);
  const getUrl = useServerFn(getBuildArtifactUrl);

  const spQ = useQuery({ queryKey: ["signing-profiles", projectId], queryFn: () => listSp({ data: { projectId } }) });
  const buildsQ = useQuery({
    queryKey: ["mobile-builds", projectId],
    queryFn: () => listB({ data: { projectId } }),
    refetchInterval: 4000,
  });

  // build form
  const [platform, setPlatform] = useState<Platform>("ios");
  const [buildType, setBuildType] = useState<"debug" | "release">("debug");
  const [bundleId, setBundleId] = useState("com.foundry.app");
  const [versionName, setVersionName] = useState("1.0.0");
  const [versionCode, setVersionCode] = useState(1);
  const [signingProfileId, setSigningProfileId] = useState<string>("");

  // signing form
  const [spPlatform, setSpPlatform] = useState<Platform>("ios");
  const [spName, setSpName] = useState("");
  const [spAlias, setSpAlias] = useState("");
  const [spPassword, setSpPassword] = useState("");
  const [spFile, setSpFile] = useState<File | null>(null);

  const matchingProfiles = useMemo(
    () => (spQ.data?.profiles ?? []).filter((p) => p.platform === platform),
    [spQ.data, platform],
  );

  const uploadMut = useMutation({
    mutationFn: async () => {
      if (!spFile) throw new Error("Pick a keystore / .p12 file");
      const buf = new Uint8Array(await spFile.arrayBuffer());
      let bin = ""; for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
      const b64 = typeof btoa !== "undefined" ? btoa(bin) : Buffer.from(buf).toString("base64");
      return upload({
        data: {
          projectId,
          platform: spPlatform,
          name: spName,
          alias: spAlias || undefined,
          filename: spFile.name,
          contentBase64: b64,
          password: spPassword || undefined,
        },
      });
    },
    onSuccess: () => {
      toast.success("Signing profile saved (encrypted at rest)");
      setSpFile(null); setSpName(""); setSpAlias(""); setSpPassword("");
      qc.invalidateQueries({ queryKey: ["signing-profiles", projectId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const delSpMut = useMutation({
    mutationFn: (id: string) => delSp({ data: { projectId, id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["signing-profiles", projectId] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const buildMut = useMutation({
    mutationFn: () => reqBuild({
      data: {
        projectId, platform, buildType, bundleId, versionName, versionCode,
        signingProfileId: buildType === "release" ? (signingProfileId || null) : null,
      },
    }),
    onSuccess: () => {
      toast.success("Build queued");
      qc.invalidateQueries({ queryKey: ["mobile-builds", projectId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function download(buildId: string) {
    try {
      const { url } = await getUrl({ data: { projectId, buildId } });
      window.open(url, "_blank", "noopener");
    } catch (e) { toast.error((e as Error).message); }
  }

  return (
    <div className="rounded-2xl border border-border/60 bg-card/40 p-4">
      <div className="mb-3 flex items-center gap-2">
        <Smartphone className="h-4 w-4 text-primary" />
        <h3 className="font-display text-sm font-semibold">Native Builds</h3>
        <span className="ml-auto text-xs text-muted-foreground">iOS · Android · signed releases</span>
      </div>

      {/* Signing profiles */}
      <div className="mb-3 rounded-lg border border-border/40 bg-background/30 p-3">
        <div className="mb-2 flex items-center gap-2 text-xs font-semibold">
          <KeyRound className="h-3.5 w-3.5 text-amber-400" /> Signing profiles
        </div>
        <div className="grid gap-2 md:grid-cols-[110px_1fr_1fr]">
          <Select value={spPlatform} onValueChange={(v) => setSpPlatform(v as Platform)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ios"><Apple className="mr-1 inline h-3 w-3" /> iOS</SelectItem>
              <SelectItem value="android"><Bot className="mr-1 inline h-3 w-3" /> Android</SelectItem>
            </SelectContent>
          </Select>
          <Input placeholder="Profile name (e.g. prod)" value={spName} onChange={(e) => setSpName(e.target.value)} />
          <Input placeholder="Alias (optional)" value={spAlias} onChange={(e) => setSpAlias(e.target.value)} />
        </div>
        <div className="mt-2 grid gap-2 md:grid-cols-[1fr_1fr_auto]">
          <Input type="file" accept=".p12,.jks,.keystore,.mobileprovision" onChange={(e) => setSpFile(e.target.files?.[0] ?? null)} />
          <Input type="password" placeholder="Keystore password" value={spPassword} onChange={(e) => setSpPassword(e.target.value)} />
          <Button size="sm" disabled={!spFile || !spName || uploadMut.isPending} onClick={() => uploadMut.mutate()}>
            {uploadMut.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />} Save
          </Button>
        </div>
        <ul className="mt-2 grid gap-1">
          {(spQ.data?.profiles ?? []).map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-2 rounded-md border border-border/30 px-2 py-1 text-xs">
              <span className="flex items-center gap-2">
                {p.platform === "ios" ? <Apple className="h-3 w-3" /> : <Bot className="h-3 w-3" />}
                <span className="font-mono">{p.name}</span>
                {p.alias && <Badge variant="outline" className="text-[10px]">{p.alias}</Badge>}
                {p.last_four && <span className="text-muted-foreground">··{p.last_four}</span>}
              </span>
              <Button size="sm" variant="ghost" onClick={() => delSpMut.mutate(p.id)}>
                <Trash2 className="h-3 w-3" />
              </Button>
            </li>
          ))}
        </ul>
      </div>

      {/* Build composer */}
      <div className="mb-3 grid gap-2 rounded-lg border border-border/40 bg-background/30 p-3">
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <Select value={platform} onValueChange={(v) => setPlatform(v as Platform)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ios">iOS</SelectItem>
              <SelectItem value="android">Android</SelectItem>
            </SelectContent>
          </Select>
          <Select value={buildType} onValueChange={(v) => setBuildType(v as "debug" | "release")}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="debug">Debug</SelectItem>
              <SelectItem value="release">Release (signed)</SelectItem>
            </SelectContent>
          </Select>
          <Input placeholder="1.0.0" value={versionName} onChange={(e) => setVersionName(e.target.value)} />
          <Input type="number" min={1} value={versionCode} onChange={(e) => setVersionCode(Number(e.target.value || 1))} />
        </div>
        <Input placeholder="com.acme.app" value={bundleId} onChange={(e) => setBundleId(e.target.value)} />
        {buildType === "release" && (
          <Select value={signingProfileId} onValueChange={setSigningProfileId}>
            <SelectTrigger><SelectValue placeholder="Choose signing profile…" /></SelectTrigger>
            <SelectContent>
              {matchingProfiles.length === 0
                ? <SelectItem value="__none" disabled>No {platform} profiles uploaded</SelectItem>
                : matchingProfiles.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}{p.alias ? ` (${p.alias})` : ""}</SelectItem>
                  ))}
            </SelectContent>
          </Select>
        )}
        <Button size="sm" disabled={buildMut.isPending} onClick={() => buildMut.mutate()}>
          {buildMut.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />} Request build
        </Button>
      </div>

      {/* Build history */}
      <ul className="grid gap-2">
        {(buildsQ.data?.builds ?? []).length === 0
          ? <li className="py-6 text-center text-xs text-muted-foreground">No builds yet.</li>
          : (buildsQ.data?.builds ?? []).map((b) => {
              const StatusIcon =
                b.status === "success" ? CheckCircle2 :
                b.status === "failed" ? XCircle :
                Clock;
              const color =
                b.status === "success" ? "text-emerald-400" :
                b.status === "failed" ? "text-rose-400" :
                "text-amber-400";
              return (
                <li key={b.id} className="rounded-lg border border-border/40 bg-background/30 p-3">
                  <div className="flex items-center gap-2 text-xs">
                    {b.platform === "ios" ? <Apple className="h-3 w-3" /> : <Bot className="h-3 w-3" />}
                    <span className="font-mono">{b.bundle_id}</span>
                    <Badge variant="outline" className="text-[10px]">{b.build_type}</Badge>
                    <span className="text-muted-foreground">v{b.version_name}+{b.version_code}</span>
                    <StatusIcon className={`ml-auto h-4 w-4 ${color}`} />
                    {b.artifact_path && (
                      <Button size="sm" variant="ghost" onClick={() => download(b.id)} title="Download workspace bundle">
                        <Download className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                  {b.log && (
                    <pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap rounded bg-background/50 p-2 text-[10px] text-muted-foreground">{b.log}</pre>
                  )}
                </li>
              );
            })}
      </ul>
    </div>
  );
}
