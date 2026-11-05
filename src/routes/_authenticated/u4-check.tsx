import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { RequirementsRegister } from "@/components/research/RequirementsRegister";

// TEMPORARY visual check harness (Sample data, never persisted). Removed after screenshots.
const PID = "00000000-0000-0000-0000-000000000001";
const req = (n: number, v: number, extra: Record<string, unknown>) => ({
  id: `s-${n}-${v}`, project_id: PID, req_no: n, code: `REQ-00${n}`, version: v, brief_id: "b", brief_version: 2, status: "active",
  platform: "facebook", accounts: [], keywords: [], languages: ["ms"], window_from: "2026-10-01", window_to: "2026-12-31",
  legal_basis: "Sample: client instruction for a CMA 1998 s.233 complaint", change_reason: null, created_by: null, created_at: "2026-11-05T04:00:00Z", ...extra,
});

export const Route = createFileRoute("/_authenticated/u4-check")({ component: Page });

function Page() {
  const qc = useQueryClient();
  const rows = [
    req(1, 1, { accounts: ["Sample Page Kuala Lumpur"], keywords: ["sample keyword"], languages: ["ms", "en"] }),
    req(2, 2, { platform: "tiktok", accounts: ["@sample_account"], languages: ["ms"], change_reason: "Sample: handle corrected" }),
    req(3, 2, { platform: "x", keywords: ["sample"], status: "withdrawn", change_reason: "Sample: out of scope" }),
  ];
  const sample = {["research", "register", PID], {
    all: rows, current: rows, marks: [],
    status: { brief_signed: true, brief_id: "b", brief_version: 2, complete: false, problems: [], register_sha256: "0".repeat(64) },
    brief: { platforms: ["Facebook", "TikTok", "X"], languages: ["Malay", "English"], window_from: "2026-10-01", window_to: "2026-12-31" },
  };
  useEffect(() => { const t = setTimeout(() => qc.setQueryData(["research", "register", PID], sample), 1500); return () => clearTimeout(t); });
  return (
    <div className="mx-auto max-w-5xl p-4">
      <p className="kicker">Sample</p>
      <RequirementsRegister projectId={PID} canEdit canMark />
    </div>
  );
}
