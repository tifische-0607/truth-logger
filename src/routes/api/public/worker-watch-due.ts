import { createFileRoute } from "@tanstack/react-router";

import { checkWorkerToken, jsonResponse } from "@/lib/worker-shared";

// Returns watched pages that are due for a check and leases them (sets
// last_checked_at now) so a second call doesn't hand them out again.
export const Route = createFileRoute("/api/public/worker-watch-due")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = checkWorkerToken(request);
        if (denied) return denied;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin
          .from("watch_targets")
          .select("id, url, platform, case_id, interval_minutes, last_checked_at")
          .eq("active", true);
        if (error) return jsonResponse({ error: error.message }, 500);
        const now = Date.now();
        const due = (data ?? [])
          .filter(
            (t) =>
              !t.last_checked_at ||
              now - Date.parse(t.last_checked_at) >= t.interval_minutes * 60_000,
          )
          .slice(0, 3);
        if (due.length) {
          await supabaseAdmin
            .from("watch_targets")
            .update({ last_checked_at: new Date(now).toISOString() })
            .in(
              "id",
              due.map((t) => t.id),
            );
        }
        return jsonResponse({
          targets: due.map((t) => ({ id: t.id, url: t.url, platform: t.platform })),
        });
      },
    },
  },
});
