import { createFileRoute } from "@tanstack/react-router";

import { need, researchHandler } from "@/lib/research-worker";

/** Report the vault write result for a capture; the hash on write must equal the hash at capture. */
export const Route = createFileRoute("/api/public/research-vault-write")({
  server: {
    handlers: {
      POST: researchHandler<{ capture_id: string; sha256_on_write: string; custody_event_id?: string }>(
        (b, rpc) =>
          rpc("research_report_vault_write", {
            _capture: need(b.capture_id, "capture_id"),
            _sha256_on_write: need(b.sha256_on_write, "sha256_on_write"),
            _custody_event: b.custody_event_id ?? null,
          }),
      ),
    },
  },
});
