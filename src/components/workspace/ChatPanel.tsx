import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { Send, Sparkles, FileCode, Trash2, FileText, ChevronDown, Search, ArrowRightLeft } from "lucide-react";
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
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, [projectId, status]);
  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }); }, [messages, status]);

  const isLoading = status === "submitted" || status === "streaming";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || isLoading) return;
    setInput("");
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
          <div className="rounded-xl border border-dashed border-border/60 p-4 text-sm text-muted-foreground">
            Describe what you want to build. The AI will generate files in your project.
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
        <div className="flex gap-2">
          <Textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSubmit(e as unknown as React.FormEvent); }
            }}
            placeholder="Build a landing page with a hero and pricing table…"
            className="min-h-[60px] resize-none bg-background/60"
            disabled={isLoading}
          />
          <Button type="submit" size="icon" disabled={isLoading || !input.trim()} className="h-auto self-stretch">
            <Send className="h-4 w-4" />
          </Button>
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
               <FileText className="h-3.5 w-3.5" />;
  const path = (part.input as { path?: string } | undefined)?.path;
  const done = part.state === "output-available" || part.state === "result";
  return (
    <div className="my-1.5 rounded-lg border border-border/60 bg-muted/30 text-xs">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2 px-2.5 py-1.5">
        <span className={cn("grid h-5 w-5 place-items-center rounded", done ? "bg-brand/20 text-brand" : "bg-muted text-muted-foreground")}>
          {icon}
        </span>
        <span className="font-mono">{name}</span>
        {path && <span className="truncate text-muted-foreground">{path}</span>}
        <ChevronDown className={cn("ml-auto h-3 w-3 transition", open && "rotate-180")} />
      </button>
      {open && (
        <pre className="overflow-x-auto border-t border-border/60 p-2 text-[10px] leading-snug">
{JSON.stringify({ input: part.input, output: part.output }, null, 2)}
        </pre>
      )}
    </div>
  );
}
