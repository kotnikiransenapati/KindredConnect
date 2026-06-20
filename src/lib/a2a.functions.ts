// P18 — Agent-to-Agent (A2A) protocol: registry, capability discovery, signed envelopes.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const STATUS = ["active", "paused", "revoked"] as const;
const MSG_STATUS = ["pending", "delivered", "acknowledged", "failed", "rejected"] as const;

async function sha256Hex(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export const listAgents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { projectId: string }) => z.object({ projectId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("a2a_agents")
      .select("id,name,description,capabilities,endpoint_url,public_key,status,metadata,created_at,updated_at")
      .eq("project_id", data.projectId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return { agents: rows ?? [] };
  });

export const upsertAgent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      id: z.string().uuid().optional(),
      projectId: z.string().uuid(),
      name: z.string().min(2).max(80).regex(/^[a-zA-Z0-9_.-]+$/, "letters/digits/._- only"),
      description: z.string().max(500).optional().nullable(),
      capabilities: z.array(z.string().min(1).max(60)).max(30).default([]),
      endpointUrl: z.string().url().optional().nullable().refine(
        (u) => !u || u.startsWith("https://"), "HTTPS required"),
      publicKey: z.string().max(4096).optional().nullable(),
      status: z.enum(STATUS).default("active"),
      metadata: z.record(z.string(), z.any()).default({}),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const ok = await context.supabase.rpc("check_rate_limit", {
      _user_id: context.userId, _bucket: "a2a.agent.upsert", _window: "00:01:00", _max: 30,
    });
    if (ok.error || ok.data === false) throw new Error("Rate limit exceeded");

    const base: Record<string, unknown> = {
      project_id: data.projectId,
      name: data.name,
      description: data.description ?? null,
      capabilities: data.capabilities,
      endpoint_url: data.endpointUrl ?? null,
      public_key: data.publicKey ?? null,
      status: data.status,
      metadata: data.metadata,
    };
    if (data.id) {
      const { error } = await context.supabase.from("a2a_agents").update(base).eq("id", data.id);
      if (error) throw error;
      return { id: data.id };
    }
    base.created_by = context.userId;
    const { data: row, error } = await context.supabase.from("a2a_agents").insert(base).select("id").single();
    if (error) throw error;
    return { id: row.id };
  });

export const deleteAgent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("a2a_agents").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const discoverAgents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      projectId: z.string().uuid(),
      capability: z.string().min(1).max(60).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase.from("a2a_agents")
      .select("id,name,description,capabilities,status,endpoint_url")
      .eq("project_id", data.projectId).eq("status", "active");
    if (data.capability) q = q.contains("capabilities", [data.capability]);
    const { data: rows, error } = await q;
    if (error) throw error;
    return { agents: rows ?? [] };
  });

export const sendAgentMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      projectId: z.string().uuid(),
      fromAgentId: z.string().uuid(),
      toAgentId: z.string().uuid(),
      intent: z.string().min(1).max(80),
      payload: z.record(z.string(), z.any()).default({}),
      correlationId: z.string().uuid().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const ok = await context.supabase.rpc("check_rate_limit", {
      _user_id: context.userId, _bucket: "a2a.message.send", _window: "00:01:00", _max: 120,
    });
    if (ok.error || ok.data === false) throw new Error("Rate limit exceeded");

    if (data.fromAgentId === data.toAgentId) throw new Error("Cannot send to self");

    // Verify both agents are in project and active.
    const { data: agents, error: aErr } = await context.supabase
      .from("a2a_agents").select("id,status,project_id,endpoint_url")
      .in("id", [data.fromAgentId, data.toAgentId]);
    if (aErr) throw aErr;
    if (!agents || agents.length !== 2) throw new Error("Agent(s) not found");
    for (const a of agents) {
      if (a.project_id !== data.projectId) throw new Error("Agent project mismatch");
      if (a.status !== "active") throw new Error(`Agent ${a.id} is ${a.status}`);
    }
    const target = agents.find((a) => a.id === data.toAgentId)!;

    const envelopeJson = JSON.stringify({
      v: 1, from: data.fromAgentId, to: data.toAgentId,
      intent: data.intent, payload: data.payload,
      correlationId: data.correlationId ?? null, ts: new Date().toISOString(),
    });
    const signature = await sha256Hex(envelopeJson + ":" + context.userId);

    const { data: row, error } = await context.supabase.from("a2a_messages").insert({
      project_id: data.projectId,
      from_agent_id: data.fromAgentId,
      to_agent_id: data.toAgentId,
      intent: data.intent,
      payload: data.payload,
      signature,
      status: "pending",
      correlation_id: data.correlationId ?? null,
      sent_by: context.userId,
    }).select("id").single();
    if (error) throw error;

    // Best-effort dispatch to target endpoint (if registered).
    let delivered = false;
    let respBody: unknown = null;
    let errMsg: string | null = null;
    if (target.endpoint_url) {
      try {
        const ctrl = new AbortController();
        const to = setTimeout(() => ctrl.abort(), 6000);
        const res = await fetch(target.endpoint_url, {
          method: "POST",
          headers: { "content-type": "application/json", "x-a2a-signature": signature, "x-a2a-message-id": row.id },
          body: envelopeJson, signal: ctrl.signal,
        });
        clearTimeout(to);
        if (res.ok) {
          delivered = true;
          try { respBody = await res.json(); } catch { respBody = await res.text().then((t) => ({ text: t.slice(0, 500) })); }
        } else errMsg = `HTTP ${res.status}`;
      } catch (e) { errMsg = e instanceof Error ? e.message : String(e); }
    }

    await context.supabase.from("a2a_messages").update({
      status: delivered ? "delivered" : (target.endpoint_url ? "failed" : "pending"),
      response: respBody as any,
      error: errMsg,
    }).eq("id", row.id);

    return { id: row.id, delivered, signature, error: errMsg };
  });

export const listAgentMessages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      projectId: z.string().uuid(),
      agentId: z.string().uuid().optional(),
      limit: z.number().int().min(1).max(200).default(50),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase.from("a2a_messages")
      .select("id,from_agent_id,to_agent_id,intent,payload,status,response,error,correlation_id,created_at,updated_at")
      .eq("project_id", data.projectId)
      .order("created_at", { ascending: false }).limit(data.limit);
    if (data.agentId) q = q.or(`from_agent_id.eq.${data.agentId},to_agent_id.eq.${data.agentId}`);
    const { data: rows, error } = await q;
    if (error) throw error;
    return { messages: rows ?? [] };
  });

export const acknowledgeMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      id: z.string().uuid(),
      status: z.enum(["acknowledged", "rejected"]),
      response: z.record(z.string(), z.any()).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("a2a_messages").update({
      status: data.status, response: data.response ?? null,
    }).eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });
