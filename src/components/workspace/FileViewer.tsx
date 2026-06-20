import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { listProjectFiles } from "@/lib/chat.functions";
import { Sparkles, Pencil, Eye } from "lucide-react";
import { useCollabCursors, CollabFileIndicator } from "./CollabCursors";
import { CollabEditor } from "./CollabEditor";
import { Button } from "@/components/ui/button";

interface Props { projectId: string; path: string | null; slug: string; }

export function FileViewer({ projectId, path, slug }: Props) {
  const fetchFiles = useServerFn(listProjectFiles);
  const [editing, setEditing] = useState(false);
  const { data } = useQuery({
    queryKey: ["project-files", projectId],
    queryFn: () => fetchFiles({ data: { projectId } }),
    refetchInterval: 4000,
  });
  const cursors = useCollabCursors(projectId, path);

  const file = data?.files.find((f) => f.path === path);

  if (file && editing && path) {
    return (
      <div className="space-y-2">
        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditing(false)}>
          <Eye className="mr-1 h-3 w-3" /> Read-only view
        </Button>
        <CollabEditor projectId={projectId} path={path} initialContent={file.content ?? ""} version={file.version ?? 0} />
      </div>
    );
  }

  return (
    <section className="rounded-2xl border border-border/60 bg-card/70 shadow-card backdrop-blur">
      <div className="flex items-center gap-1.5 border-b border-border/60 px-4 py-3">
        <span className="h-2.5 w-2.5 rounded-full bg-destructive/70" />
        <span className="h-2.5 w-2.5 rounded-full bg-brand/70" />
        <span className="h-2.5 w-2.5 rounded-full bg-aurora-3/70" />
        <span className="ml-3 font-mono text-xs text-muted-foreground">
          {file ? file.path : `${slug}.foundry.app`}
        </span>
        {path && <CollabFileIndicator cursors={cursors} path={path} />}
        {file && (
          <>
            <span className="ml-auto text-[10px] text-muted-foreground">v{file.version}</span>
            <Button size="sm" variant="ghost" className="ml-2 h-6 px-2 text-[11px]" onClick={() => setEditing(true)}>
              <Pencil className="mr-1 h-3 w-3" /> Live edit
            </Button>
          </>
        )}
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

