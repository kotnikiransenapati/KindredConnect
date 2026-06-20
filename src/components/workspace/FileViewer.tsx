import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listProjectFiles } from "@/lib/chat.functions";
import { Sparkles } from "lucide-react";
import { useCollabCursors, CollabFileIndicator } from "./CollabCursors";

interface Props { projectId: string; path: string | null; slug: string; }

export function FileViewer({ projectId, path, slug }: Props) {
  const fetchFiles = useServerFn(listProjectFiles);
  const { data } = useQuery({
    queryKey: ["project-files", projectId],
    queryFn: () => fetchFiles({ data: { projectId } }),
    refetchInterval: 4000,
  });

  const file = data?.files.find((f) => f.path === path);

  return (
    <section className="rounded-2xl border border-border/60 bg-card/70 shadow-card backdrop-blur">
      <div className="flex items-center gap-1.5 border-b border-border/60 px-4 py-3">
        <span className="h-2.5 w-2.5 rounded-full bg-destructive/70" />
        <span className="h-2.5 w-2.5 rounded-full bg-brand/70" />
        <span className="h-2.5 w-2.5 rounded-full bg-aurora-3/70" />
        <span className="ml-3 font-mono text-xs text-muted-foreground">
          {file ? file.path : `${slug}.foundry.app`}
        </span>
        {file && <span className="ml-auto text-[10px] text-muted-foreground">v{file.version}</span>}
      </div>
      {file ? (
        <pre className="max-h-[calc(100vh-260px)] overflow-auto p-4 text-xs leading-relaxed">
          <code>{file.content}</code>
        </pre>
      ) : (
        <div className="grid min-h-[420px] place-items-center p-10 text-center">
          <div>
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-gradient-brand text-brand-foreground shadow-elegant">
              <Sparkles className="h-6 w-6" />
            </div>
            <h2 className="mt-6 font-display text-2xl">Workspace ready</h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
              Ask Foundry to build something. Generated files will appear in the tree on the left.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
