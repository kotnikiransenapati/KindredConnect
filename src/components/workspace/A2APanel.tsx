import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listAgents, upsertAgent, deleteAgent, discoverAgents, sendAgentMessage, listAgentMessages, acknowledgeMessage } from "@/lib/a2a.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Bot, Trash2, Send, Network, Check, X } from "lucide-react";

export function A2APanel({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const list = useServerFn(listAgents);
  const upsert = useServerFn(upsertAgent);
  const del = useServerFn(deleteAgent);
  const discover = useServerFn(discoverAgents);
  const send = useServerFn(sendAgentMessage);
  const listMsg = useServerFn(listAgentMessages);
  const ack = useServerFn(acknowledgeMessage);

  const agentsQ = useQuery({ queryKey: ["a2a-agents", projectId], queryFn: () => list({ data: { projectId } }) });
  const msgsQ = useQuery({
    queryKey: ["a2a-msgs", projectId],
    queryFn: () => listMsg({ data: { projectId, limit: 50 } }),
    refetchInterval: 8000,
  });

  const [form, setForm] = useState({ name: "", description: "", capabilities: "", endpointUrl: "", publicKey: "" });
  const [filterCap, setFilterCap] = useState("");
  const [msg, setMsg] = useState({ fromAgentId: "", toAgentId: "", intent: "", payload: "{}" });

  const agents: any[] = agentsQ.data?.agents ?? [];
  const messages: any[] = msgsQ.data?.messages ?? [];
  const nameById = useMemo(() => Object.fromEntries(agents.map((a) => [a.id, a.name])), [agents]);

  const discoverQ = useQuery({
    queryKey: ["a2a-discover", projectId, filterCap],
    queryFn: () => discover({ data: { projectId, capability: filterCap || undefined } }),
  });

  const upsertMut = useMutation({
    mutationFn: () => upsert({ data: {
      projectId, name: form.name, description: form.description || null,
      capabilities: form.capabilities.split(",").map((s) => s.trim()).filter(Boolean),
      endpointUrl: form.endpointUrl || null, publicKey: form.publicKey || null,
      status: "active" as const, metadata: {},
    } }),
    onSuccess: () => { toast.success("Agent registered"); setForm({ name: "", description: "", capabilities: "", endpointUrl: "", publicKey: "" }); qc.invalidateQueries({ queryKey: ["a2a-agents", projectId] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const sendMut = useMutation({
    mutationFn: () => {
      let parsed: any = {};
      try { parsed = JSON.parse(msg.payload || "{}"); } catch { throw new Error("Payload must be valid JSON"); }
      return send({ data: { projectId, fromAgentId: msg.fromAgentId, toAgentId: msg.toAgentId, intent: msg.intent, payload: parsed } });
    },
    onSuccess: (r) => { toast.success(r.delivered ? "Delivered" : r.error ? `Send failed: ${r.error}` : "Queued"); qc.invalidateQueries({ queryKey: ["a2a-msgs", projectId] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Network className="h-4 w-4" /> Agent-to-Agent (A2A) Protocol</CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="registry">
          <TabsList>
            <TabsTrigger value="registry">Registry</TabsTrigger>
            <TabsTrigger value="discover">Discover</TabsTrigger>
            <TabsTrigger value="send">Send</TabsTrigger>
            <TabsTrigger value="messages">Messages</TabsTrigger>
          </TabsList>

          <TabsContent value="registry" className="space-y-3">
            <div className="space-y-2 rounded border p-3">
              <Label>Register an agent</Label>
              <Input placeholder="agent name (e.g. researcher.v1)" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              <Input placeholder="description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              <Input placeholder="capabilities (csv: search,summarize,translate)" value={form.capabilities} onChange={(e) => setForm({ ...form, capabilities: e.target.value })} />
              <Input placeholder="https endpoint (optional)" value={form.endpointUrl} onChange={(e) => setForm({ ...form, endpointUrl: e.target.value })} />
              <Textarea placeholder="public key (PEM, optional)" value={form.publicKey} onChange={(e) => setForm({ ...form, publicKey: e.target.value })} rows={3} />
              <Button onClick={() => upsertMut.mutate()} disabled={upsertMut.isPending}>Register</Button>
            </div>
            <div className="space-y-2">
              {agents.map((a) => (
                <div key={a.id} className="flex items-start justify-between rounded border p-2">
                  <div className="text-sm">
                    <div className="flex items-center gap-2 font-medium"><Bot className="h-3.5 w-3.5" />{a.name} <Badge variant={a.status === "active" ? "default" : "secondary"}>{a.status}</Badge></div>
                    {a.description && <div className="text-xs text-muted-foreground">{a.description}</div>}
                    <div className="mt-1 flex flex-wrap gap-1">{(a.capabilities ?? []).map((c: string) => <Badge key={c} variant="outline" className="text-xs">{c}</Badge>)}</div>
                    {a.endpoint_url && <div className="text-xs text-muted-foreground mt-1">→ {a.endpoint_url}</div>}
                  </div>
                  <Button size="icon" variant="ghost" onClick={async () => { await del({ data: { id: a.id } }); qc.invalidateQueries({ queryKey: ["a2a-agents", projectId] }); }}><Trash2 className="h-4 w-4" /></Button>
                </div>
              ))}
              {agents.length === 0 && <p className="text-sm text-muted-foreground">No agents registered.</p>}
            </div>
          </TabsContent>

          <TabsContent value="discover" className="space-y-2">
            <Input placeholder="Filter by capability (e.g. summarize)" value={filterCap} onChange={(e) => setFilterCap(e.target.value)} />
            {(discoverQ.data?.agents ?? []).map((a: any) => (
              <div key={a.id} className="rounded border p-2 text-sm">
                <div className="font-medium">{a.name}</div>
                <div className="text-xs text-muted-foreground">{a.description}</div>
                <div className="mt-1 flex flex-wrap gap-1">{(a.capabilities ?? []).map((c: string) => <Badge key={c} variant="outline" className="text-xs">{c}</Badge>)}</div>
              </div>
            ))}
            {(discoverQ.data?.agents?.length ?? 0) === 0 && <p className="text-sm text-muted-foreground">No matching active agents.</p>}
          </TabsContent>

          <TabsContent value="send" className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>From</Label>
                <Select value={msg.fromAgentId} onValueChange={(v) => setMsg({ ...msg, fromAgentId: v })}>
                  <SelectTrigger><SelectValue placeholder="From agent" /></SelectTrigger>
                  <SelectContent>{agents.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>To</Label>
                <Select value={msg.toAgentId} onValueChange={(v) => setMsg({ ...msg, toAgentId: v })}>
                  <SelectTrigger><SelectValue placeholder="To agent" /></SelectTrigger>
                  <SelectContent>{agents.filter((a) => a.id !== msg.fromAgentId).map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <Input placeholder="intent (e.g. summarize.url)" value={msg.intent} onChange={(e) => setMsg({ ...msg, intent: e.target.value })} />
            <Textarea placeholder='payload JSON, e.g. {"url":"https://..."}' value={msg.payload} onChange={(e) => setMsg({ ...msg, payload: e.target.value })} rows={4} className="font-mono text-xs" />
            <Button onClick={() => sendMut.mutate()} disabled={sendMut.isPending || !msg.fromAgentId || !msg.toAgentId || !msg.intent}><Send className="h-4 w-4 mr-1" /> Send signed envelope</Button>
          </TabsContent>

          <TabsContent value="messages" className="space-y-1 max-h-80 overflow-auto">
            {messages.map((m) => (
              <div key={m.id} className="rounded border p-2 text-xs">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-mono">{nameById[m.from_agent_id] ?? "?"} → {nameById[m.to_agent_id] ?? "?"}</span>
                    <Badge className="ml-2" variant={m.status === "delivered" || m.status === "acknowledged" ? "default" : m.status === "failed" || m.status === "rejected" ? "destructive" : "secondary"}>{m.status}</Badge>
                  </div>
                  <div className="text-muted-foreground">{new Date(m.created_at).toLocaleTimeString()}</div>
                </div>
                <div className="mt-1">intent: <code>{m.intent}</code></div>
                {m.error && <div className="text-destructive">{m.error}</div>}
                {m.status === "delivered" && (
                  <div className="mt-1 flex gap-1">
                    <Button size="sm" variant="outline" onClick={async () => { await ack({ data: { id: m.id, status: "acknowledged" } }); qc.invalidateQueries({ queryKey: ["a2a-msgs", projectId] }); }}><Check className="h-3 w-3 mr-1" /> Ack</Button>
                    <Button size="sm" variant="outline" onClick={async () => { await ack({ data: { id: m.id, status: "rejected" } }); qc.invalidateQueries({ queryKey: ["a2a-msgs", projectId] }); }}><X className="h-3 w-3 mr-1" /> Reject</Button>
                  </div>
                )}
              </div>
            ))}
            {messages.length === 0 && <p className="text-sm text-muted-foreground">No messages yet.</p>}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
