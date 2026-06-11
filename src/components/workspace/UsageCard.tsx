import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyUsage } from "@/lib/members.functions";
import { Activity, Zap, Wrench, MessageSquare } from "lucide-react";

export function UsageCard() {
  const fn = useServerFn(getMyUsage);
  const { data } = useQuery({ queryKey: ["my-usage"], queryFn: () => fn() });
  const t = data?.total ?? { messages: 0, prompt: 0, response: 0, tools: 0 };

  const cells = [
    { icon: MessageSquare, label: "Messages", value: t.messages.toLocaleString() },
    { icon: Zap, label: "Prompt chars", value: t.prompt.toLocaleString() },
    { icon: Activity, label: "Response chars", value: t.response.toLocaleString() },
    { icon: Wrench, label: "Tool calls", value: t.tools.toLocaleString() },
  ];

  return (
    <div className="rounded-2xl border border-border/60 bg-card/70 p-5 shadow-card backdrop-blur">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">AI usage · last 30 days</div>
        <div className="text-[10px] text-muted-foreground">Rate limit: 20/min · 200/day</div>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {cells.map((c) => (
          <div key={c.label} className="rounded-xl border border-border/60 bg-background/40 p-3">
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
              <c.icon className="h-3 w-3" /> {c.label}
            </div>
            <div className="mt-1 font-display text-xl font-semibold">{c.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
