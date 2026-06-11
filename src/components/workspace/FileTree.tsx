import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listProjectFiles } from "@/lib/chat.functions";
import { FileCode, FileText } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  projectId: string;
  selectedPath: string | null;
  onSelect: (path: string) => void;
}

export function FileTree({ projectId, selectedPath, onSelect }: Props) {
  const fetchFiles = useServerFn(listProjectFiles);
  const { data, isLoading } = useQuery({
    queryKey: ["project-files", projectId],
    queryFn: () => fetchFiles({ data: { projectId } }),
    refetchInterval: 4000,
  });

  const files = data?.files ?? [];

  return (
    <div className="rounded-2xl border border-border/60 bg-card/70 p-3 shadow-card backdrop-blur">
      <div className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Files {files.length > 0 && <span className="text-foreground/60">({files.length})</span>}
      </div>
      {isLoading && files.length === 0 ? (
        <div className="px-2 py-4 text-xs text-muted-foreground">Loading…</div>
      ) : files.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border/60 p-3 text-xs text-muted-foreground">
          No files yet. Ask the AI to build something.
        </div>
      ) : (
        <ul className="space-y-0.5">
          {files.map((f) => {
            const isCode = /\.(tsx?|jsx?|css|html|json)$/.test(f.path);
            return (
              <li key={f.id}>
                <button
                  onClick={() => onSelect(f.path)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition",
                    selectedPath === f.path ? "bg-brand/15 text-foreground" : "hover:bg-muted/50 text-muted-foreground",
                  )}
                >
                  {isCode ? <FileCode className="h-3.5 w-3.5 shrink-0" /> : <FileText className="h-3.5 w-3.5 shrink-0" />}
                  <span className="truncate font-mono">{f.path}</span>
                  <span className="ml-auto text-[9px] text-muted-foreground">v{f.version}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
