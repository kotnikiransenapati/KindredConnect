// Project activity feed. Reads are gated by RLS (project members only).

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface ActivityRow {
  id: string;
  actor_id: string | null;
  action: string;
  target: string | null;
  metadata: Record<string, string | number | boolean | null>;
  created_at: string;
}

const Input = z.object({ projectId: z.string().uuid(), limit: z.number().int().min(1).max(100).optional() });

export const listProjectActivity = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => Input.parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("activity_log")
      .select("id, actor_id, action, target, metadata, created_at")
      .eq("project_id", data.projectId)
      .order("created_at", { ascending: false })
      .limit(data.limit ?? 30);
    if (error) throw new Error(error.message);
    return { events: (rows ?? []) as ActivityRow[] };
  });
