// Server-only audit helper. Uses request headers; must not be imported at
// module scope from any client-reachable file. Load via dynamic import inside
// a server-fn handler body.
import { getRequestHeader } from "@tanstack/react-start/server";

const ALLOWED_ACTIONS = [
  "secret.reveal", "secret.create", "secret.delete",
  "member.invite", "member.remove", "member.role_change",
  "deployment.publish", "deployment.rollback",
  "domain.add", "domain.verify", "domain.delete",
  "project.delete", "project.transfer",
  "billing.plan_change",
  "agent.proposal.apply",
  "data.export",
] as const;

export type AuditAction = (typeof ALLOWED_ACTIONS)[number];

export async function recordAudit(
  supabase: any,
  userId: string,
  entry: {
    action: AuditAction;
    resourceType: string;
    resourceId?: string | null;
    projectId?: string | null;
    orgId?: string | null;
    metadata?: Record<string, unknown>;
  },
) {
  try {
    const ua = getRequestHeader("user-agent") ?? null;
    const ipHdr = getRequestHeader("cf-connecting-ip") ?? getRequestHeader("x-forwarded-for") ?? null;
    const ip = ipHdr ? ipHdr.split(",")[0].trim() : null;
    await supabase.from("audit_log").insert({
      actor_id: userId,
      action: entry.action,
      resource_type: entry.resourceType,
      resource_id: entry.resourceId ?? null,
      project_id: entry.projectId ?? null,
      org_id: entry.orgId ?? null,
      ip,
      user_agent: ua,
      metadata: entry.metadata ?? {},
    });
  } catch {
    // never break the parent operation on audit failure
  }
}
