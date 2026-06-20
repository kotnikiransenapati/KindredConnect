// Custom domain wiring per project: add, list, verify (DNS TXT check),
// delete. Verification uses Cloudflare's DNS-over-HTTPS for portability
// across the Worker runtime.

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const HostnameRe = /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i;

async function assertRole(supabase: any, userId: string, projectId: string, role: "viewer" | "editor" | "owner") {
  const { data } = await supabase.rpc("has_project_role", { _project_id: projectId, _user_id: userId, _min_role: role });
  if (!data) throw new Error("Forbidden");
}

export const listProjectDomains = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ projectId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertRole(supabase, userId, data.projectId, "viewer");
    const { data: rows, error } = await supabase
      .from("project_domains")
      .select("id, hostname, status, region, verification_token, created_at, verified_at, last_checked_at")
      .eq("project_id", data.projectId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { domains: rows ?? [] };
  });

export const addProjectDomain = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    projectId: z.string().uuid(),
    hostname: z.string().trim().toLowerCase().regex(HostnameRe, "Invalid hostname").max(253),
    region: z.enum(["global", "us", "eu", "ap"]).default("global"),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertRole(supabase, userId, data.projectId, "editor");
    const { randomBytes } = await import("crypto");
    const token = "foundry-verify=" + randomBytes(18).toString("base64url");
    const { data: row, error } = await supabase.from("project_domains").insert({
      project_id: data.projectId,
      hostname: data.hostname,
      region: data.region,
      verification_token: token,
      status: "pending",
      created_by: userId,
    }).select("id, hostname, status, region, verification_token, created_at").single();
    if (error) throw new Error(error.code === "23505" ? "Domain already attached to a project" : error.message);
    return row;
  });

export const verifyProjectDomain = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    projectId: z.string().uuid(), id: z.string().uuid(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertRole(supabase, userId, data.projectId, "editor");
    const { data: dom, error } = await supabase
      .from("project_domains").select("hostname, verification_token")
      .eq("id", data.id).eq("project_id", data.projectId).maybeSingle();
    if (error || !dom) throw new Error("Domain not found");

    const txtName = `_foundry-challenge.${dom.hostname}`;
    let verified = false;
    try {
      const res = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(txtName)}&type=TXT`, {
        headers: { accept: "application/dns-json" },
      });
      if (res.ok) {
        const json = (await res.json()) as { Answer?: Array<{ data: string }> };
        verified = (json.Answer ?? []).some((a) => a.data.replace(/^"|"$/g, "").includes(dom.verification_token));
      }
    } catch { /* network error → leave verified=false */ }

    const update = verified
      ? { status: "verified", verified_at: new Date().toISOString(), last_checked_at: new Date().toISOString() }
      : { status: "failed", last_checked_at: new Date().toISOString() };
    await supabase.from("project_domains").update(update).eq("id", data.id);
    return { verified, txtName };
  });

export const deleteProjectDomain = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    projectId: z.string().uuid(), id: z.string().uuid(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertRole(supabase, userId, data.projectId, "owner");
    const { error } = await supabase.from("project_domains")
      .delete().eq("id", data.id).eq("project_id", data.projectId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
