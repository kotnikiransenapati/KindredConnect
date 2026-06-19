import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

/**
 * Server-only rate limit helper. Uses the `check_rate_limit` security-definer
 * RPC backed by the `rate_limits` table.
 *
 * Throws with a clear error message when exceeded so callers can let it
 * bubble up to the client. The admin client is used because rate_limits
 * is locked down by RLS to service_role.
 */
export async function assertRateLimit(
  userId: string,
  bucket: string,
  window: "1 minute" | "1 hour" | "1 day",
  max: number,
): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await (supabaseAdmin as SupabaseClient<Database>).rpc("check_rate_limit", {
    _user_id: userId,
    _bucket: bucket,
    _window: window,
    _max: max,
  });
  if (error) throw new Error(`Rate limit check failed: ${error.message}`);
  if (data === false) {
    throw new Error(`Rate limit exceeded for ${bucket}. Try again later.`);
  }
}
