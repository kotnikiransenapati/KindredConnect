// SCIM 2.0 catch-all endpoint — RFC 7644 subset for Users.
// Auth: Bearer <scim_token>. Token is SHA-256 hashed at rest.
// Routes:
//   GET    /api/public/scim/v2/Users?filter=userName eq "x@y" | startIndex=&count=
//   GET    /api/public/scim/v2/Users/:id
//   POST   /api/public/scim/v2/Users
//   PUT    /api/public/scim/v2/Users/:id
//   PATCH  /api/public/scim/v2/Users/:id
//   DELETE /api/public/scim/v2/Users/:id
//   GET    /api/public/scim/v2/ServiceProviderConfig
//   GET    /api/public/scim/v2/ResourceTypes
//   GET    /api/public/scim/v2/Schemas
import { createFileRoute } from "@tanstack/react-router";

const SCIM_CT = "application/scim+json";

function scimError(status: number, detail: string, scimType?: string) {
  return new Response(
    JSON.stringify({
      schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
      status: String(status),
      detail,
      ...(scimType ? { scimType } : {}),
    }),
    { status, headers: { "content-type": SCIM_CT } },
  );
}

function ok(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": SCIM_CT } });
}

async function sha256Hex(input: string) {
  const buf = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function parseFilterUserName(filter: string | null): string | null {
  if (!filter) return null;
  const m = filter.match(/userName\s+eq\s+"([^"]+)"/i);
  return m ? m[1] : null;
}

function toScimUser(row: any) {
  return {
    schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
    id: row.id,
    externalId: row.external_id,
    userName: row.email,
    active: row.active,
    name: { formatted: row.display_name ?? row.email },
    emails: [{ value: row.email, primary: true }],
    meta: { resourceType: "User", created: row.created_at, lastModified: row.updated_at },
  };
}

async function authorize(request: Request) {
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token) return { error: scimError(401, "Missing bearer token") };
  const hash = await sha256Hex(token);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: row, error } = await supabaseAdmin
    .from("scim_tokens")
    .select("id, org_id, revoked_at")
    .eq("token_hash", hash)
    .maybeSingle();
  if (error || !row) return { error: scimError(401, "Invalid token") };
  if (row.revoked_at) return { error: scimError(401, "Token revoked") };
  // fire-and-forget last_used update
  void supabaseAdmin.from("scim_tokens").update({ last_used_at: new Date().toISOString() }).eq("id", row.id);
  return { tokenId: row.id as string, orgId: row.org_id as string, supabaseAdmin };
}

async function audit(admin: any, orgId: string, tokenId: string | null, method: string, path: string, status: number, externalId: string | null, detail: any) {
  try {
    await admin.from("scim_audit").insert({
      org_id: orgId, token_id: tokenId, method, path, status_code: status, external_id: externalId, detail: detail ?? {},
    });
  } catch { /* never block SCIM response on audit failure */ }
}

async function handleUsers(admin: any, orgId: string, request: Request, rest: string[]) {
  const url = new URL(request.url);
  const method = request.method.toUpperCase();
  const id = rest[1] ?? null;

  if (method === "GET" && !id) {
    const filter = parseFilterUserName(url.searchParams.get("filter"));
    const startIndex = Math.max(1, parseInt(url.searchParams.get("startIndex") ?? "1", 10));
    const count = Math.min(200, Math.max(1, parseInt(url.searchParams.get("count") ?? "50", 10)));
    let q = admin.from("scim_provisioned_users").select("*", { count: "exact" }).eq("org_id", orgId);
    if (filter) q = q.ilike("email", filter);
    const { data: rows, count: total, error } = await q.range(startIndex - 1, startIndex - 1 + count - 1);
    if (error) return scimError(500, error.message);
    return ok({
      schemas: ["urn:ietf:params:scim:api:messages:2.0:ListResponse"],
      totalResults: total ?? rows?.length ?? 0,
      startIndex, itemsPerPage: rows?.length ?? 0,
      Resources: (rows ?? []).map(toScimUser),
    });
  }

  if (method === "GET" && id) {
    const { data: row, error } = await admin.from("scim_provisioned_users").select("*").eq("org_id", orgId).eq("id", id).maybeSingle();
    if (error) return scimError(500, error.message);
    if (!row) return scimError(404, "User not found");
    return ok(toScimUser(row));
  }

  if (method === "POST") {
    const body = await request.json().catch(() => null);
    if (!body) return scimError(400, "Invalid JSON", "invalidSyntax");
    const email = (body.userName ?? body.emails?.[0]?.value ?? "").toString().trim().toLowerCase();
    const externalId = (body.externalId ?? email).toString();
    const displayName = body.displayName ?? body.name?.formatted ?? null;
    const active = body.active !== false;
    if (!email) return scimError(400, "userName required", "invalidValue");
    const { data: row, error } = await admin
      .from("scim_provisioned_users")
      .upsert({ org_id: orgId, external_id: externalId, email, display_name: displayName, active, raw: body }, { onConflict: "org_id,external_id" })
      .select("*").single();
    if (error) return scimError(409, error.message, "uniqueness");
    return ok(toScimUser(row), 201);
  }

  if ((method === "PUT" || method === "PATCH") && id) {
    const body = await request.json().catch(() => null);
    if (!body) return scimError(400, "Invalid JSON", "invalidSyntax");
    const patch: any = { raw: body };
    if (method === "PUT") {
      patch.email = (body.userName ?? body.emails?.[0]?.value ?? "").toString().toLowerCase();
      patch.display_name = body.displayName ?? body.name?.formatted ?? null;
      patch.active = body.active !== false;
    } else {
      // minimal PATCH: { Operations: [{op, path, value}] }
      for (const op of body.Operations ?? []) {
        const path = (op.path ?? "").toLowerCase();
        if (path === "active" || (path === "" && typeof op.value?.active === "boolean")) {
          patch.active = path === "active" ? !!op.value : !!op.value.active;
        }
        if (path === "displayname") patch.display_name = op.value;
      }
    }
    const { data: row, error } = await admin.from("scim_provisioned_users").update(patch).eq("org_id", orgId).eq("id", id).select("*").maybeSingle();
    if (error) return scimError(500, error.message);
    if (!row) return scimError(404, "User not found");
    return ok(toScimUser(row));
  }

  if (method === "DELETE" && id) {
    // SCIM "soft delete" — flip active=false rather than hard delete so audit history remains.
    const { error } = await admin.from("scim_provisioned_users").update({ active: false }).eq("org_id", orgId).eq("id", id);
    if (error) return scimError(500, error.message);
    return new Response(null, { status: 204 });
  }

  return scimError(405, "Method not allowed");
}

function spc() {
  return ok({
    schemas: ["urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig"],
    patch: { supported: true }, bulk: { supported: false }, filter: { supported: true, maxResults: 200 },
    changePassword: { supported: false }, sort: { supported: false }, etag: { supported: false },
    authenticationSchemes: [{ name: "OAuth Bearer Token", description: "Bearer token", type: "oauthbearertoken", primary: true }],
  });
}

async function handler({ request }: { request: Request }) {
  const url = new URL(request.url);
  const segments = url.pathname.split("/").filter(Boolean); // ["api","public","scim","v2",...]
  const rest = segments.slice(4);
  const root = rest[0];

  if (root === "ServiceProviderConfig") return spc();
  if (root === "ResourceTypes") return ok({ schemas: ["urn:ietf:params:scim:api:messages:2.0:ListResponse"], Resources: [
    { schemas: ["urn:ietf:params:scim:schemas:core:2.0:ResourceType"], id: "User", name: "User", endpoint: "/Users", schema: "urn:ietf:params:scim:schemas:core:2.0:User" },
  ] });
  if (root === "Schemas") return ok({ schemas: ["urn:ietf:params:scim:api:messages:2.0:ListResponse"], Resources: [] });

  const authResult = await authorize(request);
  if ("error" in authResult) return authResult.error;
  const { supabaseAdmin: admin, orgId, tokenId } = authResult;

  let res: Response;
  if (root === "Users") {
    res = await handleUsers(admin, orgId, request, rest);
  } else {
    res = scimError(404, "Resource not found");
  }
  const externalId = rest[1] ?? null;
  void audit(admin, orgId, tokenId, request.method, url.pathname, res.status, externalId, {});
  return res;
}

export const Route = createFileRoute("/api/public/scim/v2/$")({
  server: { handlers: { GET: handler, POST: handler, PUT: handler, PATCH: handler, DELETE: handler } },
});
