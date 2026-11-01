import { Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { House, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { HashChip } from "@/components/HashChip";
import { Button } from "@/components/ui/button";
import { logHomeVaultEvent, rehashDarkNightRecord, useDarkNight } from "@/lib/darknight";
import { refFiles } from "@/lib/sources";
import { cn } from "@/lib/utils";

type Row = {
  refId: string;
  recordId: string;
  recordCode: string;
  filename: string | null;
  expected: string | null;
  actual: string | null;
  status: "MATCH" | "MISMATCH" | "MISSING" | "NO_BASELINE";
};

const STYLE: Record<Row["status"], string> = {
  MATCH: "bg-done text-done-foreground",
  MISMATCH: "bg-failed text-failed-foreground",
  MISSING: "bg-failed text-failed-foreground",
  NO_BASELINE: "bg-queued text-queued-foreground",
};

/** Re-hashes a case's home-vault files at home (through the gateway) and compares with the case record. */
export function HomeVaultVerify({ caseId }: { caseId: string }) {
  const dn = useDarkNight();
  const refs = useQuery({
    queryKey: ["evidence-refs", "case", caseId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("evidence_refs")
        .select("*, incidents(incident_id)")
        .eq("case_id", caseId)
        .order("published_at", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return data;
    },
  });

  const run = useMutation({
    mutationFn: async (): Promise<Row[]> => {
      const rows: Row[] = [];
      for (const ref of refs.data ?? []) {
        const expected = new Map(refFiles(ref.files).map((f) => [f.file_id, f]));
        const result = await rehashDarkNightRecord(dn.base!, ref.record_id);
        const seen = new Set<string>();
        for (const r of result.results) {
          seen.add(r.file_id);
          const base = expected.get(r.file_id)?.sha256 ?? null;
          const status: Row["status"] = !r.sha256
            ? "MISSING"
            : !base
              ? "NO_BASELINE"
              : base === r.sha256
                ? "MATCH"
                : "MISMATCH";
          rows.push({
            refId: ref.id,
            recordId: ref.record_id,
            recordCode: ref.record_code,
            filename: r.filename,
            expected: base,
            actual: r.sha256,
            status,
          });
        }
        // A file recorded at linking that DarkNight no longer lists is missing.
        for (const [fileId, f] of expected) {
          if (!seen.has(fileId)) {
            rows.push({
              refId: ref.id,
              recordId: ref.record_id,
              recordCode: ref.record_code,
              filename: f.filename,
              expected: f.sha256,
              actual: null,
              status: "MISSING",
            });
          }
        }
      }
      for (const row of rows) {
        await logHomeVaultEvent({
          evidenceRefId: row.refId,
          action: "re-hashed",
          filename: row.filename,
          sha256: row.actual,
          notes: `Case verification · re-hashed at home by the gateway · ${row.status}`,
        });
      }
      return rows;
    },
    onSuccess: (rows) => {
      const bad = rows.filter((r) => r.status === "MISMATCH" || r.status === "MISSING").length;
      if (bad) toast.error(`${bad} home-vault file(s) failed`);
      else toast.success(`All ${rows.length} home-vault files match`);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Home-vault check failed"),
  });

  if (!refs.data?.length) return null;
  const fileCount = refs.data.reduce((n, r) => n + refFiles(r.files).length, 0);

  return (
    <section
      className="panel border-home-foreground/30 space-y-4 p-5"
      aria-labelledby="hv-verify-h"
    >
      <div className="flex flex-wrap items-center gap-3">
        <House className="text-home-foreground size-5" aria-hidden />
        <h2 id="hv-verify-h" className="font-semibold">
          Home-vault files
        </h2>
        <span className="text-muted-foreground text-sm">
          {refs.data.length} linked {refs.data.length === 1 ? "item" : "items"} · {fileCount}{" "}
          {fileCount === 1 ? "file" : "files"} · re-hashed at home, compared with the hashes
          recorded at linking
        </span>
      </div>
      {dn.online ? (
        <Button className="min-h-12" disabled={run.isPending} onClick={() => run.mutate()}>
          {run.isPending ? <Loader2 className="size-4 animate-spin" /> : null} Re-hash home-vault
          files
        </Button>
      ) : (
        <p className="bg-home/50 rounded-lg px-4 py-3 text-sm">
          {dn.state === "not_configured" ? "DarkNight isn't connected" : "DarkNight is offline"}, so
          these files can't be re-hashed now.{" "}
          <Link to="/sources" className="font-semibold hover:underline">
            Sources
          </Link>
        </p>
      )}
      {run.data ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="text-muted-foreground text-left text-xs uppercase">
              <tr>
                <th className="px-4 py-3">Item</th>
                <th className="px-4 py-3">File</th>
                <th className="px-4 py-3">At linking</th>
                <th className="px-4 py-3">Now</th>
                <th className="px-4 py-3">Result</th>
              </tr>
            </thead>
            <tbody>
              {run.data.map((r, i) => (
                <tr key={`${r.refId}-${i}`} className="border-border/60 border-t">
                  <td className="px-4 py-3 font-mono text-xs font-semibold">{r.recordCode}</td>
                  <td className="px-4 py-3">{r.filename ?? "—"}</td>
                  <td className="px-4 py-3">
                    <HashChip value={r.expected} />
                  </td>
                  <td className="px-4 py-3">
                    <HashChip value={r.actual} />
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        "rounded-full px-3 py-1 text-xs font-semibold",
                        STYLE[r.status],
                      )}
                    >
                      {r.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
