import { createFileRoute } from "@tanstack/react-router";

import { checkWorkerToken, jsonResponse } from "@/lib/worker-shared";

export const Route = createFileRoute("/api/public/worker-claim")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = checkWorkerToken(request);
        if (denied) return denied;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin.rpc("claim_next_job");
        if (error) return jsonResponse({ error: error.message }, 500);

        const { data: settingsRow } = await supabaseAdmin
          .from("capture_settings")
          .select(
            "fb_account_label, proxy_url, timeout_seconds, expand_comments, save_pdf, notes",
          )
          .eq("id", "default")
          .maybeSingle();
        const settings = settingsRow ?? null;

        const job = Array.isArray(data) ? data[0] : data;
        if (!job) return jsonResponse({ job: null, settings });
        return jsonResponse({ job, settings });
      },
    },
  },
});
