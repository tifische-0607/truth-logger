import { createFileRoute } from "@tanstack/react-router";

import { researchHandler } from "@/lib/research-worker";

/** Claim the next queued research job. Optional plan_sha256 + cycle make the call idempotent per plan. */
export const Route = createFileRoute("/api/public/research-claim")({
  server: {
    handlers: {
      POST: researchHandler<{ plan_sha256?: string; cycle?: number }>((b, rpc) =>
        rpc("research_claim_job", { _plan_sha256: b.plan_sha256 ?? null, _cycle: b.cycle ?? null }),
      ),
    },
  },
});
