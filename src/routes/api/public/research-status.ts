import { createFileRoute } from "@tanstack/react-router";

import { need, researchHandler } from "@/lib/research-worker";

/** Report run status (running, delivered, failed) and/or home-vault reachability. */
export const Route = createFileRoute("/api/public/research-status")({
  server: {
    handlers: {
      POST: researchHandler<{
        run_id?: string;
        status?: string;
        expected?: number;
        vault?: { source_id: string; online: boolean; note?: string };
      }>(async (b, rpc) => {
        const out: Record<string, unknown> = {};
        if (b.vault) {
          out["vault"] = await rpc("research_report_vault", {
            _source: need(b.vault.source_id, "vault.source_id"),
            _online: b.vault.online === true,
            _note: b.vault.note ?? null,
          });
        }
        if (b.run_id) {
          out["run"] = await rpc("research_report_run", {
            _run: b.run_id,
            _status: need(b.status, "status"),
            _expected: b.expected ?? null,
          });
        }
        if (!b.vault && !b.run_id) throw new Error("Send run_id with status, or vault");
        return out;
      }),
    },
  },
});
