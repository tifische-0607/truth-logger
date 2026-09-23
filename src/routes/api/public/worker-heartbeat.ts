import { createFileRoute } from "@tanstack/react-router";

import { checkWorkerToken, jsonResponse } from "@/lib/worker-shared";

export const Route = createFileRoute("/api/public/worker-heartbeat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = checkWorkerToken(request);
        if (denied) return denied;

        let body: { version?: string; hostname?: string; info?: Record<string, unknown> } = {};
        try {
          body = (await request.json()) as typeof body;
        } catch {
          body = {};
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const now = new Date().toISOString();
        const { error } = await supabaseAdmin.from("worker_status").upsert({
          id: "worker",
          last_seen: now,
          version: body.version ?? null,
          hostname: body.hostname ?? null,
          info: (body.info ?? {}) as never,
        });
        if (error) return jsonResponse({ error: error.message }, 500);
        return jsonResponse({ ok: true, last_seen: now });
      },
    },
  },
});
