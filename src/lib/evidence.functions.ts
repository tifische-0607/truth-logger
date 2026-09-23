import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { VerifyResult } from "@/lib/evidence.server";

export type VerifyReport = {
  caseId: string;
  scope: "case" | "item";
  artefactCount: number;
  ok: boolean;
  counts: Record<string, number>;
  results: VerifyResult[];
  checkedAt: string;
};

export type ExportReport = {
  ok: boolean;
  blocked?: boolean;
  caseId: string;
  verify: VerifyReport;
  downloadUrl?: string;
  storagePath?: string;
  fileCount?: number;
  sizeBytes?: number;
};

function summarise(results: VerifyResult[]) {
  const counts: Record<string, number> = {};
  for (const r of results) counts[r.status] = (counts[r.status] ?? 0) + 1;
  return counts;
}

export const verifyEvidence = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { scope: "case" | "item"; id: string; handler?: string }) => {
    if (!data?.id) throw new Error("Choose a case or evidence item to verify.");
    return {
      scope: data.scope === "item" ? ("item" as const) : ("case" as const),
      id: String(data.id),
      handler: String(data.handler ?? "unknown").slice(0, 120),
    };
  })
  .handler(async ({ data }): Promise<VerifyReport> => {
    const { loadScope, rehashArtefacts } = await import("@/lib/evidence.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const scopeData = await loadScope(supabaseAdmin, data.scope, data.id);
    const { results } = await rehashArtefacts(scopeData, data.handler, {
      note: "manual verification",
    });
    const counts = summarise(results);
    return {
      caseId: scopeData.caseId,
      scope: data.scope,
      artefactCount: results.length,
      ok: results.length > 0 && results.every((r) => r.status === "MATCH"),
      counts,
      results,
      checkedAt: new Date().toISOString(),
    };
  });

export const exportBundle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: { caseId: string; recipient: string; purpose?: string; handler?: string }) => {
      if (!data?.caseId) throw new Error("Choose a case to export.");
      const recipient = String(data.recipient ?? "").trim();
      if (recipient.length < 2) throw new Error("Name the recipient this bundle is released to.");
      return {
        caseId: String(data.caseId),
        recipient: recipient.slice(0, 200),
        purpose: String(data.purpose ?? "").slice(0, 500),
        handler: String(data.handler ?? "unknown").slice(0, 120),
      };
    },
  )
  .handler(async ({ data }): Promise<ExportReport> => {
    const { loadScope, rehashArtefacts, buildBundle, uploadBundle } = await import(
      "@/lib/evidence.server"
    );
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const scopeData = await loadScope(supabaseAdmin, "case", data.caseId);
    const generatedAt = new Date().toISOString();
    const { results, bytes } = await rehashArtefacts(scopeData, data.handler, {
      note: `pre-export verification for ${data.recipient}`,
    });

    const verify: VerifyReport = {
      caseId: scopeData.caseId,
      scope: "case",
      artefactCount: results.length,
      ok: results.length > 0 && results.every((r) => r.status === "MATCH"),
      counts: summarise(results),
      results,
      checkedAt: generatedAt,
    };

    if (!verify.ok) {
      return { ok: false, blocked: true, caseId: data.caseId, verify };
    }

    const { zip, fileCount } = await buildBundle(scopeData, results, bytes, {
      handler: data.handler,
      recipient: data.recipient,
      purpose: data.purpose,
      generatedAt,
    });
    const { path, signedUrl } = await uploadBundle(data.caseId, zip);

    for (const artefact of scopeData.artefacts) {
      await supabaseAdmin.from("custody_events").insert({
        artefact_id: artefact.id,
        item_id: artefact.item_id,
        filename: artefact.filename,
        sha256: artefact.sha256,
        action: "exported",
        handler: data.handler,
        tool_version: "fb-evidence-monitor/export",
        notes: `Released to ${data.recipient}${data.purpose ? ` · ${data.purpose}` : ""} · bundle ${path}`,
      });
    }

    return {
      ok: true,
      caseId: data.caseId,
      verify,
      downloadUrl: signedUrl,
      storagePath: path,
      fileCount,
      sizeBytes: zip.byteLength,
    };
  });
