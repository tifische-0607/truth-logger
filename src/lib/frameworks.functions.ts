import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { extractionState } from "@/lib/frameworks";

/**
 * Replaceable extraction step for loaded resources. Reports honestly:
 * "not_configured" when no extraction service is set, "not_attempted" when one is set,
 * because outside connections are not allowed yet. Staff then record learnings by hand.
 */
export const extractLearnings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ sourceId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: src, error } = await context.supabase.from("framework_sources").select("id").eq("id", data.sourceId).maybeSingle();
    if (error) throw new Error(error.message);
    if (!src) throw new Error("Resource not found.");
    return extractionState(process.env as Record<string, string | undefined>);
  });
