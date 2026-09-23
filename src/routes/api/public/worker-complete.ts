import { createFileRoute } from "@tanstack/react-router";

import { checkWorkerToken, jsonResponse, readJson } from "@/lib/worker-shared";

type Body = { job_id?: string; status?: string; result?: Record<string, unknown> };

export const Route = createFileRoute("/api/public/worker-complete")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = checkWorkerToken(request);
        if (denied) return denied;

        const body = await readJson<Body>(request);
        if (!body.job_id) return jsonResponse({ error: "job_id is required" }, 400);
        const status = body.status ?? "done";
        if (!["done", "failed"].includes(status)) {
          return jsonResponse({ error: "status must be 'done' or 'failed'" }, 400);
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { error } = await supabaseAdmin
          .from("capture_jobs")
          .update({
            status,
            result: (body.result ?? {}) as never,
            finished_at: new Date().toISOString(),
          })
          .eq("id", body.job_id);
        if (error) return jsonResponse({ error: error.message }, 500);

        return jsonResponse({ ok: true, job_id: body.job_id, status });
      },
    },
  },
});
