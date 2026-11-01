import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { checkWorkerToken, jsonResponse } from "@/lib/worker-shared";

const Body = z.object({
  target_id: z.string().uuid(),
  post_urls: z.array(z.string().url().max(2000)).max(100).default([]),
  error: z.string().max(1000).optional(),
});

const DEFAULT_OPTIONS = {
  recapture: false,
  capture_profile: true,
  timestamps: true,
  transcript: true,
  include_replies: true,
  live_screenshots: true,
  max_comments: 500,
  translate: true,
  auto_watch: true,
};

// The Mac mini reports the post links it saw on a watched page. Links never
// seen before are queued as captures in the watched case, all under one new
// incident per scan. The very first scan only records a baseline so the
// page's back catalogue isn't captured.
export const Route = createFileRoute("/api/public/worker-watch-report")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = checkWorkerToken(request);
        if (denied) return denied;
        const parsed = Body.safeParse(await request.json().catch(() => ({})));
        if (!parsed.success) return jsonResponse({ error: parsed.error.message }, 400);
        const { target_id, post_urls, error: scanError } = parsed.data;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: target } = await supabaseAdmin
          .from("watch_targets")
          .select("id, url, case_id, created_by, label")
          .eq("id", target_id)
          .maybeSingle();
        if (!target) return jsonResponse({ error: "unknown target" }, 404);

        if (scanError) {
          await supabaseAdmin
            .from("watch_targets")
            .update({ last_error: scanError })
            .eq("id", target_id);
          return jsonResponse({ ok: true, queued: 0 });
        }

        const urls = [...new Set(post_urls)];
        const { count: seenBefore } = await supabaseAdmin
          .from("watch_seen")
          .select("id", { count: "exact", head: true })
          .eq("target_id", target_id);
        const baseline = (seenBefore ?? 0) === 0;

        const { data: existing } = await supabaseAdmin
          .from("watch_seen")
          .select("post_url")
          .eq("target_id", target_id)
          .in("post_url", urls.length ? urls : ["-"]);
        const known = new Set((existing ?? []).map((r) => r.post_url));
        const fresh = urls.filter((u) => !known.has(u));

        let queued = 0;
        if (baseline || fresh.length === 0) {
          if (fresh.length) {
            await supabaseAdmin
              .from("watch_seen")
              .upsert(
                fresh.map((u) => ({ target_id, post_url: u, baseline: true })),
                { onConflict: "target_id,post_url", ignoreDuplicates: true },
              );
          }
        } else {
          // Next incident number in the case.
          const [{ data: incs }, { data: jobs }] = await Promise.all([
            supabaseAdmin.from("incidents").select("incident_id").eq("case_id", target.case_id),
            supabaseAdmin.from("capture_jobs").select("incident_id").eq("case_id", target.case_id),
          ]);
          let max = 0;
          for (const r of [...(incs ?? []), ...(jobs ?? [])]) {
            const n = Number.parseInt(String(r.incident_id ?? ""), 10);
            if (Number.isFinite(n)) max = Math.max(max, n);
          }
          const incidentId = String(max + 1).padStart(2, "0");
          const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kuala_Lumpur" });
          const summary = `New posts found automatically on ${target.label || target.url}`;
          await supabaseAdmin
            .from("incidents")
            .upsert(
              { case_id: target.case_id, incident_id: incidentId, start_date: today, summary },
              { onConflict: "case_id,incident_id" },
            );
          for (const u of fresh) {
            const { data: job, error } = await supabaseAdmin
              .from("capture_jobs")
              .insert({
                url: u,
                case_id: target.case_id,
                incident_id: incidentId,
                incident_date: today,
                options: { ...DEFAULT_OPTIONS, watch_target_id: target_id },
                case_meta: {},
                incident_meta: { start_date: today, summary },
                created_by: target.created_by,
              })
              .select("id")
              .single();
            if (error) continue;
            await supabaseAdmin
              .from("watch_seen")
              .upsert(
                { target_id, post_url: u, job_id: job.id },
                { onConflict: "target_id,post_url", ignoreDuplicates: true },
              );
            queued++;
          }
        }

        await supabaseAdmin
          .from("watch_targets")
          .update({ last_error: null, last_found: urls.length })
          .eq("id", target_id);
        return jsonResponse({ ok: true, baseline, new: fresh.length, queued });
      },
    },
  },
});
