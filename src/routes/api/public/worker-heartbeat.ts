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

        // Public IP the worker is checking in from (as seen at the edge).
        const pick = (name: string): string | null => request.headers.get(name) || null;
        const fwd = pick("x-forwarded-for");
        const publicIp =
          pick("cf-connecting-ip") ??
          (fwd ? fwd.split(",")[0]?.trim() || null : null) ??
          pick("x-real-ip");

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const now = new Date().toISOString();
        const { error } = await supabaseAdmin.from("worker_status").upsert({
          id: "worker",
          last_seen: now,
          version: body.version ?? null,
          hostname: body.hostname ?? null,
          public_ip: publicIp,
          info: (body.info ?? {}) as never,
        });
        if (error) return jsonResponse({ error: error.message }, 500);

        // Restart requested from the app after this worker process started?
        const { data: st } = await supabaseAdmin
          .from("worker_status")
          .select("restart_requested_at")
          .eq("id", "worker")
          .maybeSingle();
        const reqAt = st?.restart_requested_at ? Date.parse(st.restart_requested_at) / 1000 : 0;
        const started = Number((body.info ?? {})["process_started_at"] ?? 0);
        const restart = reqAt > 0 && started > 0 && reqAt > started;
        return jsonResponse({ ok: true, last_seen: now, restart });
      },
    },
  },
});
