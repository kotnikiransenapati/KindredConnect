import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation } from "@tanstack/react-query";
import { bundleMobileProject, listCapacitorPlugins } from "@/lib/mobile.functions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Smartphone, Download, Loader2, Apple, Bot } from "lucide-react";
import { toast } from "sonner";

export function MobileBuilderPanel({ projectId }: { projectId: string }) {
  const fetchPlugins = useServerFn(listCapacitorPlugins);
  const bundle = useServerFn(bundleMobileProject);
  const [downloading, setDownloading] = useState(false);

  const pluginsQ = useQuery({
    queryKey: ["capacitor-plugins"],
    queryFn: () => fetchPlugins(),
    staleTime: 60 * 60_000,
  });

  const downloadMut = useMutation({
    mutationFn: async () => {
      setDownloading(true);
      const r = await bundle({ data: { projectId } });
      const bin = Uint8Array.from(atob(r.base64), (c) => c.charCodeAt(0));
      const blob = new Blob([bin], { type: "application/zip" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = r.filename;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5_000);
      return r;
    },
    onSuccess: (r) => toast.success(`Downloaded ${r.filename}`, { description: `${(r.size / 1024).toFixed(1)} KB` }),
    onError: (e: Error) => toast.error(e.message),
    onSettled: () => setDownloading(false),
  });

  return (
    <section className="rounded-2xl border border-border/60 bg-card/40 p-4">
      <header className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Smartphone className="h-4 w-4 text-muted-foreground" />
          <h2 className="font-display text-sm font-semibold">Mobile (iOS / Android)</h2>
        </div>
        <Button size="sm" onClick={() => downloadMut.mutate()} disabled={downloading}>
          {downloading ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Download className="mr-1.5 h-3.5 w-3.5" />}
          Download bundle
        </Button>
      </header>

      <p className="mb-3 text-xs text-muted-foreground">
        Ask the agent to <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px]">scaffoldCapacitor</span> first, then download
        the project as a zip — unzip locally and follow <span className="font-mono text-[10px]">README.MOBILE.md</span> to open in Xcode
        or Android Studio.
      </p>

      <div className="mb-2 flex items-center gap-2 text-[11px] text-muted-foreground">
        <Apple className="h-3 w-3" /> iOS
        <span className="opacity-50">·</span>
        <Bot className="h-3 w-3" /> Android
        <span className="opacity-50">·</span>
        Capacitor 6
      </div>

      <details className="group">
        <summary className="cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground">
          Available native plugins ({pluginsQ.data?.plugins.length ?? 0})
        </summary>
        <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
          {pluginsQ.data?.plugins.map((p) => (
            <li key={p.id} className="rounded-md border border-border/40 bg-background/30 p-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium">{p.name}</span>
                <Badge variant="outline" className="font-mono text-[9px]">{p.id}</Badge>
              </div>
              <p className="mt-0.5 text-[10px] text-muted-foreground">{p.desc}</p>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-[10px] text-muted-foreground">
          Ask the agent: <em>"add the camera plugin"</em> — it will call <span className="font-mono">addCapacitorPlugin</span>.
        </p>
      </details>
    </section>
  );
}
