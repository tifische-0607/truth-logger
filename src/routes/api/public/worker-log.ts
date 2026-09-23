import { createFileRoute } from "@tanstack/react-router";

import { checkWorkerToken, jsonResponse, readJson } from "@/lib/worker-shared";

type Body = { job_id?: string; lines?: string[]; warnings?: string[] };

export const Route = createFileRoute("/api/public/worker-log")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = checkWorkerToken(request);
        if (denied) return denied;

        const body = await readJson<Body>(request);
        if (!body.job_id) return jsonResponse({ error: "job_id is required" }, 400);

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { error } = await supabaseAdmin.rpc("append_job_log", {
          p_job_id: body.job_id,
          p_lines: body.lines ?? [],
          p_warnings: body.warnings ?? [],
        });
        if (error) return jsonResponse({ error: error.message }, 500);

        return jsonResponse({
          ok: true,
          appended: (body.lines?.length ?? 0) + (body.warnings?.length ?? 0),
        });
      },
    },
  },
});
