import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { Send, Sparkles, FileCode, Trash2, FileText, ChevronDown, Search, ArrowRightLeft, ImagePlus, X, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Props {
  projectId: string;
  initialMessages: UIMessage[];
}

export function ChatPanel({ projectId, initialMessages }: Props) {
  const qc = useQueryClient();
  const transport = useMemo(
    () => new DefaultChatTransport({
      api: "/api/chat",
      fetch: async (input, init) => {
        const { data: { session } } = await supabase.auth.getSession();
        const headers = new Headers(init?.headers);
        if (session?.access_token) headers.set("Authorization", `Bearer ${session.access_token}`);
        return fetch(input, { ...init, headers });
      },
      prepareSendMessagesRequest: ({ messages, id }) => ({
        body: { messages, projectId, id },
      }),
    }),
    [projectId],
  );

  const { messages, sendMessage, status, error } = useChat({
    id: projectId,
    messages: initialMessages,
    transport,
    onError: (e) => toast.error(e.message || "AI request failed"),
    onFinish: () => { qc.invalidateQueries({ queryKey: ["project-files", projectId] }); },
  });

  const [input, setInput] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, [projectId, status]);
  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }); }, [messages, status]);

  const isLoading = status === "submitted" || status === "streaming";

  const onPickFiles = (list: FileList | null) => {
    if (!list) return;
    const next: File[] = [];
    for (const f of Array.from(list)) {
      if (!f.type.startsWith("image/")) { toast.error(`${f.name}: only images allowed`); continue; }
      if (f.size > 5 * 1024 * 1024) { toast.error(`${f.name}: max 5MB`); continue; }
      next.push(f);
    }
    setFiles((prev) => [...prev, ...next].slice(0, 4));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if ((!text && files.length === 0) || isLoading) return;
    setInput("");
    const attached = files;
    setFiles([]);
    const dt = new DataTransfer();
    for (const f of attached) dt.items.add(f);
    const fileList = attached.length > 0 ? dt.files : undefined;
    await sendMessage({ text: text || "(see attached image)", files: fileList });
  };

  const sendQuickPrompt = async (text: string) => {
    if (isLoading) return;
    await sendMessage({ text });
  };

  return (
    <div className="flex h-[calc(100vh-200px)] min-h-[520px] flex-col rounded-2xl border border-border/60 bg-card/70 shadow-card backdrop-blur">
      <div className="flex items-center gap-2 border-b border-border/60 px-4 py-3">
        <div className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-brand text-brand-foreground">
          <Sparkles className="h-3.5 w-3.5" />
        </div>
        <div className="text-sm font-semibold">Foundry AI</div>
        <div className="ml-auto text-xs text-muted-foreground">gemini-3-flash</div>
      </div>

      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {messages.length === 0 && (
          <div className="space-y-3">
            <div className="rounded-xl border border-dashed border-border/60 p-4 text-sm text-muted-foreground">
              Describe what you want to build. Attach a screenshot to copy a design, or ask for a mobile app.
            </div>
            <div className="flex flex-wrap gap-1.5">
              {[
                { icon: <Smartphone className="h-3 w-3" />, text: "Build a mobile-first todo app for iOS and Android" },
                { icon: <Sparkles className="h-3 w-3" />, text: "Landing page with hero, features, pricing, footer" },
                { icon: <FileCode className="h-3 w-3" />, text: "Dashboard with sidebar, chart, and data table" },
              ].map((c) => (
                <button key={c.text} type="button" onClick={() => sendQuickPrompt(c.text)}
                  className="flex items-center gap-1.5 rounded-full border border-border/60 bg-background/40 px-2.5 py-1 text-[11px] text-muted-foreground transition hover:border-brand/50 hover:text-foreground">
                  {c.icon}<span>{c.text}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m) => (
          <MessageView key={m.id} message={m} />
        ))}
        {status === "submitted" && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="h-2 w-2 animate-pulse rounded-full bg-brand" /> Thinking…
          </div>
        )}
        {error && <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">{error.message}</div>}
      </div>

      <form onSubmit={handleSubmit} className="border-t border-border/60 p-3">
        {files.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {files.map((f, i) => (
              <div key={i} className="group relative h-14 w-14 overflow-hidden rounded-md border border-border/60">
                <img src={URL.createObjectURL(f)} alt={f.name} className="h-full w-full object-cover" />
                <button type="button" onClick={() => setFiles((p) => p.filter((_, j) => j !== i))}
                  className="absolute right-0.5 top-0.5 grid h-4 w-4 place-items-center rounded-full bg-background/80 text-foreground opacity-0 transition group-hover:opacity-100">
                  <X className="h-2.5 w-2.5" />
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <Textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSubmit(e as unknown as React.FormEvent); }
            }}
            placeholder="Build a landing page, or drop a screenshot to copy its design…"
            className="min-h-[60px] resize-none bg-background/60"
            disabled={isLoading}
          />
          <div className="flex flex-col gap-1.5 self-stretch">
            <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { onPickFiles(e.target.files); e.target.value = ""; }} />
            <Button type="button" size="icon" variant="outline" onClick={() => fileRef.current?.click()} disabled={isLoading} title="Attach image (max 4, 5MB each)">
              <ImagePlus className="h-4 w-4" />
            </Button>
            <Button type="submit" size="icon" disabled={isLoading || (!input.trim() && files.length === 0)} className="flex-1">
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}

function MessageView({ message }: { message: UIMessage }) {
  const isUser = message.role === "user";
  return (
    <div className={cn("flex flex-col gap-1", isUser ? "items-end" : "items-start")}>
      <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        {isUser ? "You" : "Foundry"}
      </div>
      <div className={cn(
        "max-w-[90%] rounded-xl px-3.5 py-2.5 text-sm",
        isUser ? "bg-primary text-primary-foreground" : "bg-background/60 border border-border/60",
      )}>
        {message.parts.map((part, i) => {
          if (part.type === "text") {
            return (
              <div key={i} className="prose prose-sm prose-invert max-w-none [&_p]:my-1 [&_pre]:bg-muted/50 [&_pre]:p-2 [&_pre]:rounded">
                <ReactMarkdown>{part.text}</ReactMarkdown>
              </div>
            );
          }
          if (part.type === "file") {
            const f = part as { mediaType?: string; url?: string; filename?: string };
            if (f.mediaType?.startsWith("image/") && f.url) {
              return <img key={i} src={f.url} alt={f.filename ?? "attachment"} className="mt-1.5 max-h-48 rounded-md border border-border/60" />;
            }
            return null;
          }
          if (part.type?.startsWith("tool-")) {
            return <ToolView key={i} part={part} />;
          }
          return null;
        })}
      </div>
    </div>
  );
}

function ToolView({ part }: { part: { type: string; state?: string; input?: unknown; output?: unknown } }) {
  const [open, setOpen] = useState(false);
  const name = part.type.replace(/^tool-/, "");
  const icon = name === "writeFile" ? <FileCode className="h-3.5 w-3.5" /> :
               name === "deleteFile" ? <Trash2 className="h-3.5 w-3.5" /> :
               name === "searchFiles" ? <Search className="h-3.5 w-3.5" /> :
               name === "renameFile" ? <ArrowRightLeft className="h-3.5 w-3.5" /> :
               name === "scaffoldCapacitor" ? <Smartphone className="h-3.5 w-3.5" /> :
               <FileText className="h-3.5 w-3.5" />;
  const path = (part.input as { path?: string } | undefined)?.path;
  const done = part.state === "output-available" || part.state === "result";
  const output = part.output as { patch?: string; lint?: { ok: boolean; errors?: { line: number; message: string }[] }; action?: string } | undefined;
  const patch = output?.patch;
  const lint = output?.lint;
  const lintBad = lint && lint.ok === false;
  return (
    <div className={cn("my-1.5 rounded-lg border bg-muted/30 text-xs", lintBad ? "border-destructive/50" : "border-border/60")}>
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2 px-2.5 py-1.5">
        <span className={cn("grid h-5 w-5 place-items-center rounded",
          lintBad ? "bg-destructive/20 text-destructive" :
          done ? "bg-brand/20 text-brand" : "bg-muted text-muted-foreground")}>
          {icon}
        </span>
        <span className="font-mono">{name}</span>
        {path && <span className="truncate text-muted-foreground">{path}</span>}
        {output?.action && <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase">{output.action}</span>}
        {lintBad && <span className="rounded bg-destructive/20 px-1.5 py-0.5 text-[10px] text-destructive">lint error</span>}
        <ChevronDown className={cn("ml-auto h-3 w-3 transition", open && "rotate-180")} />
      </button>
      {open && (
        <div className="border-t border-border/60">
          {lintBad && lint?.errors && (
            <div className="border-b border-border/60 bg-destructive/5 p-2 text-[11px] text-destructive">
              {lint.errors.map((e, i) => <div key={i}>Line {e.line}: {e.message}</div>)}
            </div>
          )}
          {patch ? (
            <pre className="max-h-72 overflow-auto p-2 font-mono text-[10px] leading-snug">
              {patch.split("\n").map((line, i) => {
                const cls = line.startsWith("+") && !line.startsWith("+++") ? "text-emerald-400" :
                            line.startsWith("-") && !line.startsWith("---") ? "text-rose-400" :
                            line.startsWith("@@") ? "text-brand" : "text-muted-foreground";
                return <div key={i} className={cls}>{line || " "}</div>;
              })}
            </pre>
          ) : (
            <pre className="overflow-x-auto p-2 text-[10px] leading-snug">
{JSON.stringify({ input: part.input, output: part.output }, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
