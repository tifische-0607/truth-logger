import { createFileRoute } from "@tanstack/react-router";

import { need, researchHandler } from "@/lib/research-worker";

/**
 * Post captures (standard schema, one shape for every connector). Each item is validated and
 * scope-checked by the database; invalid items are quarantined (logged, never stored).
 */
export const Route = createFileRoute("/api/public/research-captures")({
  server: {
    handlers: {
      POST: researchHandler<{ run_id: string; items: Record<string, unknown>[] }>(async (b, rpc) => {
        const run = need(b.run_id, "run_id");
        if (!Array.isArray(b.items) || b.items.length === 0) throw new Error("items is required");
        if (b.items.length > 200) throw new Error("At most 200 items per call");
        const results = [];
        for (const item of b.items) {
          results.push(await rpc("research_submit_capture_std", { _run: run, _item: item }));
        }
        return { results };
      }),
    },
  },
});
