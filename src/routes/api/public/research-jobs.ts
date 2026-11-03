import { createFileRoute } from "@tanstack/react-router";

import { need, researchHandler } from "@/lib/research-worker";

/** Queue a job inside a started plan; anything outside the plan is refused and logged. */
export const Route = createFileRoute("/api/public/research-jobs")({
  server: {
    handlers: {
      POST: researchHandler<{
        plan_id: string;
        job_type: string;
        source: string;
        target?: string;
        terms?: string[];
        key: string;
      }>((b, rpc) =>
        rpc("research_submit_job", {
          _plan: need(b.plan_id, "plan_id"),
          _job_type: need(b.job_type, "job_type"),
          _source: need(b.source, "source"),
          _target: b.target ?? null,
          _terms: b.terms ?? [],
          _key: need(b.key, "key"),
        }),
      ),
    },
  },
});
