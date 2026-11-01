import { Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { strToU8, zipSync, type Zippable } from "fflate";
import { House, Loader2, PackageCheck } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { fetchDarkNightFile, logHomeVaultEvent, useDarkNight } from "@/lib/darknight";
import { currentHandler, refFiles } from "@/lib/sources";
import { formatBytes } from "@/lib/format";

type Problem = { recordCode: string; filename: string | null; reason: string };

function safe(part: string) {
  return part.replace(/[^\w.@-]+/g, "_").slice(0, 120) || "file";
}

/**
 * Builds the home-vault part of an export ON THIS DEVICE: every file is fetched
 * straight from the gateway, re-hashed here, and must match the hash recorded
 * when it was linked. Any mismatch or missing file blocks the bundle.
 */
export function HomeVaultExport({
  caseId,
  recipient,
  purpose,
}: {
  caseId: string;
  recipient: string;
  purpose: string;
}) {
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

  const build = useMutation({
    mutationFn: async () => {
      const root = `CASE-${safe(caseId)}/HOME-VAULT`;
      const files: Zippable = {};
      const manifest: string[] = [];
      const problems: Problem[] = [];
      const exported: { refId: string; filename: string | null; sha256: string }[] = [];
      let bytes = 0;

      for (const ref of refs.data ?? []) {
        const inc = ref.incidents?.incident_id
          ? `INC-${safe(ref.incidents.incident_id)}`
          : "NO-INCIDENT";
        const folder = `${root}/${inc}/${safe(ref.source_id)}_${safe(ref.record_code)}`;
        for (const f of refFiles(ref.files)) {
          try {
            const got = await fetchDarkNightFile(dn.base!, ref.record_id, f.file_id);
            if (!f.sha256 || got.sha256 !== f.sha256) {
              problems.push({
                recordCode: ref.record_code,
                filename: f.filename,
                reason: f.sha256
                  ? "hash does not match the case record"
                  : "no hash recorded at linking",
              });
              continue;
            }
            const name = `${folder}/${safe(f.filename ?? f.file_id)}`;
            files[name] = new Uint8Array(await got.blob.arrayBuffer());
            bytes += got.blob.size;
            manifest.push(
              `${got.sha256}  ${name}  source=${ref.source_id} record=${ref.record_id}`,
            );
            exported.push({ refId: ref.id, filename: f.filename, sha256: got.sha256 });
          } catch (e) {
            problems.push({
              recordCode: ref.record_code,
              filename: f.filename,
              reason: e instanceof Error ? e.message : "could not be fetched",
            });
          }
        }
      }

      if (problems.length) return { ok: false as const, problems };

      const when = new Date().toISOString();
      files[`${root}/manifest.txt`] = strToU8(
        [
          `Home-vault evidence for CASE-${caseId}`,
          `Built on the analyst's device at ${when}; files fetched from the home vault and re-hashed before packing.`,
          `Released to: ${recipient}`,
          purpose ? `Purpose: ${purpose}` : "",
          `Handler: ${currentHandler()}`,
          "",
          "SHA-256  path  origin",
          ...manifest,
          "",
        ]
          .filter((l) => l !== null)
          .join("\n"),
      );
      const zip = zipSync(files, { level: 0 });
      const blob = new Blob([zip], { type: "application/zip" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `CASE-${safe(caseId)}_home-vault_${when.slice(0, 10)}.zip`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);

      for (const e of exported) {
        await logHomeVaultEvent({
          evidenceRefId: e.refId,
          action: "exported",
          filename: e.filename,
          sha256: e.sha256,
          notes: `Exported to ${recipient}${purpose ? ` (${purpose})` : ""} in an on-device bundle`,
        });
      }
      return { ok: true as const, count: exported.length, bytes };
    },
    onSuccess: (r) => {
      if (r.ok) toast.success(`Home-vault bundle saved: ${r.count} files`);
      else toast.error("Home-vault export blocked");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Home-vault export failed"),
  });

  if (!refs.data?.length) return null;
  const count = refs.data.reduce((n, r) => n + refFiles(r.files).length, 0);

  return (
    <section
      className="panel border-home-foreground/30 space-y-4 p-5"
      aria-labelledby="hv-export-h"
    >
      <div className="flex flex-wrap items-center gap-3">
        <House className="text-home-foreground size-5" aria-hidden />
        <h2 id="hv-export-h" className="font-semibold">
          Home-vault bundle
        </h2>
        <span className="text-muted-foreground text-sm">
          {refs.data.length} linked {refs.data.length === 1 ? "item" : "items"} · {count}{" "}
          {count === 1 ? "file" : "files"} · built on this device, never sent through the cloud
        </span>
      </div>
      <p className="text-sm">
        The bundle above holds cloud-vault files only. Build this second ZIP to include the
        home-vault files. Each file is re-hashed here and must match the hash recorded when it was
        linked.
      </p>
      {dn.online ? (
        <Button
          className="min-h-12"
          disabled={recipient.trim().length < 2 || build.isPending}
          onClick={() => build.mutate()}
        >
          {build.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <PackageCheck className="size-4" />
          )}{" "}
          Verify and build home-vault bundle
        </Button>
      ) : (
        <p className="bg-home/50 rounded-lg px-4 py-3 text-sm">
          {dn.state === "not_configured" ? "DarkNight isn't connected" : "DarkNight is offline"}, so
          the home-vault bundle can't be built now.{" "}
          <Link to="/sources" className="font-semibold hover:underline">
            Sources
          </Link>
        </p>
      )}
      {build.data && !build.data.ok ? (
        <div className="space-y-2">
          <span className="bg-failed text-failed-foreground inline-block rounded-full px-3 py-1 text-sm font-semibold">
            Blocked
          </span>
          <ul className="text-sm">
            {build.data.problems.map((p, i) => (
              <li key={i}>
                <span className="font-mono">{p.recordCode}</span> · {p.filename ?? "file"}:{" "}
                {p.reason}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {build.data?.ok ? (
        <p className="text-sm">
          <span className="bg-done text-done-foreground mr-2 rounded-full px-3 py-1 font-semibold">
            Saved
          </span>
          {build.data.count} files · {formatBytes(build.data.bytes)}
        </p>
      ) : null}
    </section>
  );
}
