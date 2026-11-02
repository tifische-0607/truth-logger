import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  Crop,
  Download,
  FileText,
  House,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Stamp,
} from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { HashChip } from "@/components/HashChip";
import { LinkToCaseDialog } from "@/components/LinkToCaseDialog";
import { SourceBadge } from "@/components/SourceBadge";
import { Button } from "@/components/ui/button";
import {
  classificationLabel,
  fetchDarkNightFile,
  getDarkNightRecord,
  getHomeCustody,
  logHomeVaultEvent,
  platformLabel,
  rehashDarkNightRecord,
  useDarkNight,
  type DarkNightFile,
} from "@/lib/darknight";
import { formatBytes, formatDateTime } from "@/lib/format";
import { refFiles } from "@/lib/sources";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/vault/$sourceId/$recordId")({
  head: () => ({ meta: [{ title: "Home-vault item — Evidence Hub" }] }),
  component: VaultItemPage,
});

type Viewed = {
  fileId: string;
  url: string;
  type: string;
  sha256: string;
  verdict: "MATCH" | "MISMATCH" | "NO_BASELINE";
};

const VERDICT_STYLE: Record<string, string> = {
  MATCH: "bg-done text-done-foreground",
  MISMATCH: "bg-failed text-failed-foreground",
  MISSING: "bg-failed text-failed-foreground",
  NO_BASELINE: "bg-queued text-queued-foreground",
  AMBIGUOUS: "bg-failed text-failed-foreground",
};

const PATH_NOTE: Record<string, string> = {
  MISSING: "Not found on the NAS",
  AMBIGUOUS: "Path matches two different files — run reconcile",
  UNSAFE: "Path is outside the evidence share",
};

function VaultItemPage() {
  const { sourceId, recordId } = Route.useParams();
  const queryClient = useQueryClient();
  const dn = useDarkNight();
  const [linkOpen, setLinkOpen] = useState(false);
  const [viewed, setViewed] = useState<Viewed | null>(null);

  useEffect(
    () => () => {
      if (viewed) URL.revokeObjectURL(viewed.url);
    },
    [viewed],
  );

  const refs = useQuery({
    queryKey: ["evidence-refs", sourceId, recordId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("evidence_refs")
        .select("*")
        .eq("source_id", sourceId)
        .eq("record_id", recordId)
        .order("linked_at");
      if (error) throw error;
      return data;
    },
  });

  const record = useQuery({
    queryKey: ["darknight-record", dn.base, recordId],
    enabled: dn.online && !!dn.base,
    queryFn: () => getDarkNightRecord(dn.base!, recordId),
  });

  const homeLog = useQuery({
    queryKey: ["darknight-custody", dn.base, recordId],
    enabled: dn.online && !!dn.base,
    queryFn: () => getHomeCustody(dn.base!, recordId),
  });

  const cloudLog = useQuery({
    queryKey: ["custody-refs", recordId, (refs.data ?? []).map((r) => r.id).join(",")],
    enabled: !!refs.data?.length,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("custody_events")
        .select("id, action, handler, filename, sha256, notes, created_at, evidence_ref_id")
        .in(
          "evidence_ref_id",
          (refs.data ?? []).map((r) => r.id),
        )
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
  });

  // Hash recorded at linking, per file, from the first case that linked the record.
  const baseline = new Map<string, string | null>();
  for (const ref of refs.data ?? []) {
    for (const f of refFiles(ref.files))
      if (!baseline.has(f.file_id)) baseline.set(f.file_id, f.sha256);
  }

  const view = useMutation({
    mutationFn: async ({ file, download }: { file: DarkNightFile; download?: boolean }) => {
      const fetched = await fetchDarkNightFile(dn.base!, recordId, file.file_id, { download });
      const expected = baseline.get(file.file_id) ?? null;
      const verdict: Viewed["verdict"] = !expected
        ? "NO_BASELINE"
        : expected === fetched.sha256
          ? "MATCH"
          : "MISMATCH";
      for (const ref of refs.data ?? []) {
        await logHomeVaultEvent({
          evidenceRefId: ref.id,
          action: "accessed",
          filename: file.filename,
          sha256: fetched.sha256,
          notes: `${download ? "Downloaded" : "Viewed"} from the home vault on this device · received bytes ${verdict}`,
        }).catch(() => undefined);
      }
      return { file, fetched, verdict, download };
    },
    onSuccess: ({ file, fetched, verdict, download }) => {
      const url = URL.createObjectURL(fetched.blob);
      if (download) {
        const a = document.createElement("a");
        a.href = url;
        a.download = file.filename ?? `${recordId}-${file.file_id}`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 10_000);
      } else {
        setViewed({
          fileId: file.file_id,
          url,
          type: fetched.blob.type,
          sha256: fetched.sha256,
          verdict,
        });
      }
      if (verdict === "MISMATCH")
        toast.error("This file's hash no longer matches the one recorded in the case.");
      void queryClient.invalidateQueries({ queryKey: ["custody-refs"] });
      void queryClient.invalidateQueries({ queryKey: ["darknight-custody"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't open the file"),
  });

  const rehash = useMutation({
    mutationFn: async () => {
      const result = await rehashDarkNightRecord(dn.base!, recordId);
      const rows = result.results.map((r) => {
        const expected = baseline.get(r.file_id) ?? null;
        const status = !r.sha256
          ? "MISSING"
          : !expected
            ? "NO_BASELINE"
            : expected === r.sha256
              ? "MATCH"
              : "MISMATCH";
        return { ...r, expected, status };
      });
      for (const ref of refs.data ?? []) {
        for (const row of rows) {
          await logHomeVaultEvent({
            evidenceRefId: ref.id,
            action: "re-hashed",
            filename: row.filename,
            sha256: row.sha256,
            notes: `Re-hashed by the gateway at home · ${row.status} against the hash recorded at linking`,
          }).catch(() => undefined);
        }
      }
      return rows;
    },
    onSuccess: (rows) => {
      const bad = rows.filter((r) => r.status === "MISMATCH" || r.status === "MISSING").length;
      if (bad) toast.error(`${bad} file(s) failed the check`);
      else toast.success("Every file matches");
      void queryClient.invalidateQueries({ queryKey: ["custody-refs"] });
      void queryClient.invalidateQueries({ queryKey: ["darknight-custody"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Re-hash failed"),
  });

  const r = record.data;
  const firstRef = refs.data?.[0];
  const code = r?.record_code ?? firstRef?.record_code ?? `Record ${recordId}`;
  const rehashByFile = new Map((rehash.data ?? []).map((x) => [x.file_id, x]));

  return (
    <div className="space-y-6">
      <nav aria-label="Breadcrumb" className="text-muted-foreground text-sm">
        {firstRef ? (
          <>
            <Link
              to="/cases/$caseId"
              params={{ caseId: firstRef.case_id }}
              className="font-mono hover:underline"
            >
              CASE-{firstRef.case_id}
            </Link>{" "}
            /{" "}
          </>
        ) : (
          <>
            <Link to="/search" className="hover:underline">
              Search
            </Link>{" "}
            /{" "}
          </>
        )}
        <span className="font-mono">{code}</span>
      </nav>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-mono text-2xl font-semibold">{code}</h1>
            <SourceBadge
              vault="home"
              label={sourceId === "darknight" ? "Home vault · DarkNight" : "Home vault"}
            />
            <span
              className={cn(
                "rounded-full px-2.5 py-0.5 text-xs font-semibold",
                dn.online ? "bg-done text-done-foreground" : "bg-queued text-queued-foreground",
              )}
            >
              {dn.online ? "Live" : dn.state === "not_configured" ? "Not connected" : "Offline"}
            </span>
          </div>
          <p className="text-muted-foreground text-sm">
            {r?.collection_label ?? r?.item_type ?? firstRef?.item_type ?? "Record"} ·{" "}
            {platformLabel(r?.platform ?? firstRef?.platform)}
            {r?.author_handle ? ` · @${r.author_handle}` : ""} · published{" "}
            {formatDateTime(r?.published_at ?? firstRef?.published_at)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            className="min-h-11"
            disabled={!dn.online}
            onClick={() => setLinkOpen(true)}
          >
            Add to case
          </Button>
          <Button
            className="min-h-11"
            disabled={!dn.online || rehash.isPending}
            onClick={() => rehash.mutate()}
          >
            {rehash.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <RefreshCw className="size-4" />
            )}{" "}
            Re-hash
          </Button>
        </div>
      </header>

      {dn.online ? (
        <div
          role="status"
          className="bg-done/40 border-done-foreground/30 flex items-center gap-3 rounded-xl border px-4 py-3 text-sm"
        >
          <ShieldCheck className="text-done-foreground size-5 shrink-0" aria-hidden />
          <span>
            <strong>Streaming from the home vault.</strong> Nothing on this page is stored in the
            cloud; closing it leaves no copy.
          </span>
        </div>
      ) : (
        <div
          role="status"
          className="bg-home/50 border-home-foreground/30 flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3 text-sm"
        >
          <House className="text-home-foreground size-5 shrink-0" aria-hidden />
          <span className="min-w-0 flex-1">
            <strong>
              {dn.state === "not_configured"
                ? "DarkNight isn't connected."
                : "DarkNight is offline."}
            </strong>{" "}
            The reference and hashes below are kept in the case; content shows again when the home
            vault is reachable.
          </span>
          <Link to="/sources" className="font-semibold hover:underline">
            Sources
          </Link>
        </div>
      )}

      {r?.element_crop ? (
        <div
          role="note"
          className="bg-queued/60 border-queued-foreground/30 flex items-center gap-3 rounded-xl border px-4 py-3 text-sm"
        >
          <Crop className="text-queued-foreground size-5 shrink-0" aria-hidden />
          <span>
            <strong>{r.crop_label ?? "Element crop"}.</strong> Pair it with the full-page capture
            before relying on it.
          </span>
        </div>
      ) : null}

      {record.error ? (
        <p className="text-failed-foreground text-sm">
          {record.error instanceof Error ? record.error.message : String(record.error)}
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <section className="panel p-4" aria-label="Viewer">
            {viewed ? (
              <div className="space-y-3">
                <div className="bg-sidebar flex min-h-80 items-center justify-center overflow-hidden rounded-lg">
                  {viewed.type.startsWith("image/") ? (
                    <img
                      src={viewed.url}
                      alt="Evidence file from the home vault"
                      className="max-h-[70vh] w-auto"
                    />
                  ) : viewed.type.startsWith("video/") ? (
                    <video src={viewed.url} controls className="max-h-[70vh] w-full" />
                  ) : viewed.type === "application/pdf" ? (
                    <iframe
                      title="PDF evidence file"
                      src={viewed.url}
                      className="h-[70vh] w-full bg-white"
                    />
                  ) : (
                    <a
                      href={viewed.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sidebar-foreground flex items-center gap-2 underline"
                    >
                      <FileText className="size-5" /> Open file
                    </a>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-3 text-xs">
                  <span
                    className={cn(
                      "rounded-full px-2.5 py-0.5 font-semibold",
                      VERDICT_STYLE[viewed.verdict],
                    )}
                  >
                    {viewed.verdict === "NO_BASELINE" ? "Not linked yet" : viewed.verdict}
                  </span>
                  <span className="text-muted-foreground">
                    Hash of the bytes this device received:
                  </span>
                  <HashChip value={viewed.sha256} />
                </div>
              </div>
            ) : (
              <div className="bg-muted text-muted-foreground flex min-h-64 flex-col items-center justify-center gap-2 rounded-lg p-6 text-center text-sm">
                <House className="size-8" aria-hidden />
                {dn.online
                  ? "Choose a file below to view it here."
                  : "Content held in the home vault."}
              </div>
            )}
          </section>

          {r ? (
            <section className="panel space-y-4 p-5" aria-labelledby="text-h">
              <h2 id="text-h" className="font-semibold">
                Text
              </h2>
              <div className="grid gap-5 md:grid-cols-2">
                <div className="space-y-1">
                  <div className="text-muted-foreground text-xs font-semibold uppercase">
                    Original{r.language ? ` · ${r.language}` : ""}
                  </div>
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">
                    {r.text_original ?? "—"}
                  </p>
                </div>
                <div className="space-y-1">
                  <div className="text-muted-foreground text-xs font-semibold uppercase">
                    English
                  </div>
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">{r.text_en ?? "—"}</p>
                </div>
              </div>
              <p className="text-muted-foreground border-t pt-3 text-xs">
                {r.translator_statement ??
                  "No translator statement recorded in DarkNight. Treat the English as unverified."}
              </p>
            </section>
          ) : null}

          <section className="panel overflow-x-auto" aria-labelledby="files-h">
            <h2 id="files-h" className="border-b px-5 py-4 font-semibold">
              Files
            </h2>
            <table className="w-full min-w-[760px] text-sm">
              <thead className="text-muted-foreground text-left text-xs uppercase">
                <tr>
                  <th className="px-4 py-3">File</th>
                  <th className="px-4 py-3">Size</th>
                  <th className="px-4 py-3">SHA-256 at linking</th>
                  <th className="px-4 py-3">DarkNight hashes</th>
                  <th className="px-4 py-3">Now</th>
                  <th className="px-4 py-3">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {(
                  r?.files ??
                  refFiles(firstRef?.files).map((f): DarkNightFile => ({
                    ...f,
                    mime_type: null,
                    created_at: null,
                    sha256_stored: null,
                    available: false,
                  }))
                ).map((f) => {
                  const expected = baseline.get(f.file_id) ?? null;
                  const re = rehashByFile.get(f.file_id);
                  const now =
                    re?.status ??
                    (r
                      ? !f.available
                        ? f.path_status === "AMBIGUOUS"
                          ? "AMBIGUOUS"
                          : "MISSING"
                        : !expected
                          ? "NO_BASELINE"
                          : f.sha256 === expected
                            ? "MATCH"
                            : "MISMATCH"
                      : null);
                  return (
                    <tr key={f.file_id} className="border-border/60 border-t">
                      <td className="px-4 py-3">
                        <div className="font-mono text-xs">{f.filename ?? f.file_id}</div>
                        <div className="text-muted-foreground flex flex-wrap items-center gap-2 text-xs">
                          <span>{f.kind ?? ""}</span>
                          {f.element_crop ? (
                            <span className="bg-queued text-queued-foreground inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold">
                              <Crop className="size-3" aria-hidden /> Element crop
                            </span>
                          ) : null}
                        </div>
                        {f.path_status && f.path_status !== "OK" ? (
                          <div className="text-failed-foreground text-xs">
                            {PATH_NOTE[f.path_status]}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-4 py-3">{formatBytes(f.size_bytes)}</td>
                      <td className="px-4 py-3">
                        <HashChip value={expected} />
                      </td>
                      <td className="px-4 py-3">
                        {f.integrity ? (
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span
                              className={cn(
                                "rounded-full px-2.5 py-0.5 text-xs font-semibold",
                                VERDICT_STYLE[f.integrity],
                              )}
                              title={[
                                f.sha256_stored ? "database" : null,
                                f.baselines?.post_manifest ? "post manifest" : null,
                                f.baselines?.case_manifest ? "case manifest" : null,
                              ]
                                .filter(Boolean)
                                .join(", ")}
                            >
                              {f.integrity === "NO_BASELINE" ? "None kept" : f.integrity}
                            </span>
                            {f.baselines?.timestamped ? (
                              <span
                                className="text-muted-foreground inline-flex items-center gap-1 text-xs"
                                title={f.baselines.case_manifest_path ?? undefined}
                              >
                                <Stamp className="size-3" aria-hidden /> Timestamped
                              </span>
                            ) : null}
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {now ? (
                          <span
                            className={cn(
                              "rounded-full px-2.5 py-0.5 text-xs font-semibold",
                              VERDICT_STYLE[now],
                            )}
                          >
                            {now === "NO_BASELINE" ? "Not linked" : now}
                          </span>
                        ) : (
                          <span className="text-muted-foreground text-xs">Not checked</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="min-h-10"
                            disabled={!dn.online || !f.available || view.isPending}
                            onClick={() => view.mutate({ file: f })}
                          >
                            View
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="min-h-10"
                            aria-label={`Download ${f.filename ?? "file"}`}
                            disabled={!dn.online || !f.available || view.isPending}
                            onClick={() => view.mutate({ file: f, download: true })}
                          >
                            <Download className="size-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        </div>

        <div className="space-y-6">
          {r ? (
            <section className="panel space-y-3 p-5" aria-labelledby="det-h">
              <h2 id="det-h" className="font-semibold">
                Details from DarkNight
              </h2>
              <dl className="grid grid-cols-[minmax(0,8rem)_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
                <dt className="text-muted-foreground">Record</dt>
                <dd className="font-mono text-xs">{r.record_id}</dd>
                {r.url ? (
                  <>
                    <dt className="text-muted-foreground">Platform URL</dt>
                    <dd className="break-all">
                      <a
                        href={r.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-primary hover:underline"
                      >
                        {r.url}
                      </a>
                    </dd>
                  </>
                ) : null}
                <dt className="text-muted-foreground">Collected</dt>
                <dd>
                  {formatDateTime(r.collected_at)}
                  {r.collected_by ? ` · ${r.collected_by}` : ""}
                </dd>
                <dt className="text-muted-foreground">Classification</dt>
                <dd>{classificationLabel(r.classification) ?? "—"}</dd>
                <dt className="text-muted-foreground">Location named</dt>
                <dd>{r.location || "—"}</dd>
                <dt className="text-muted-foreground">Outcome</dt>
                <dd>{r.outcome ?? "Not yet confirmed"}</dd>
                {Object.entries(r.extra ?? {}).map(([k, v]) =>
                  v === null || v === undefined ? null : (
                    <div key={k} className="contents">
                      <dt className="text-muted-foreground">{classificationLabel(k)}</dt>
                      <dd>{String(v)}</dd>
                    </div>
                  ),
                )}
              </dl>
            </section>
          ) : null}

          <section className="panel space-y-3 p-5" aria-labelledby="cases-h">
            <h2 id="cases-h" className="font-semibold">
              In cases
            </h2>
            {refs.data?.length ? (
              <ul className="space-y-2 text-sm">
                {refs.data.map((ref) => (
                  <li key={ref.id}>
                    <Link
                      to="/cases/$caseId"
                      params={{ caseId: ref.case_id }}
                      className="font-mono font-semibold hover:underline"
                    >
                      CASE-{ref.case_id}
                    </Link>
                    <span className="text-muted-foreground">
                      {" "}
                      · linked {formatDateTime(ref.linked_at)}
                      {ref.linked_by_name ? ` by ${ref.linked_by_name}` : ""}
                    </span>
                    {ref.note ? <p className="text-muted-foreground text-xs">{ref.note}</p> : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground text-sm">Not in any case yet.</p>
            )}
          </section>

          <section className="panel space-y-3 p-5" aria-labelledby="custody-h">
            <h2 id="custody-h" className="font-semibold">
              Custody
            </h2>
            <ol className="space-y-3 text-sm">
              {(cloudLog.data ?? []).map((e) => (
                <li key={e.id} className="flex gap-3">
                  <span className="bg-primary mt-1.5 size-2 shrink-0 rounded-full" aria-hidden />
                  <div>
                    <div className="font-medium">
                      {e.action.charAt(0).toUpperCase() + e.action.slice(1)}
                      {e.filename ? ` · ${e.filename}` : ""}
                    </div>
                    <div className="text-muted-foreground text-xs">
                      {formatDateTime(e.created_at)} · {e.handler ?? "—"} · case log
                    </div>
                  </div>
                </li>
              ))}
              {(homeLog.data ?? [])
                .slice()
                .reverse()
                .slice(0, 20)
                .map((e, i) => (
                  <li key={`home-${i}`} className="flex gap-3">
                    <span
                      className="bg-home-foreground mt-1.5 size-2 shrink-0 rounded-full"
                      aria-hidden
                    />
                    <div>
                      <div className="font-medium">
                        {e.action.charAt(0).toUpperCase() + e.action.slice(1)}
                        {e.filename ? ` · ${e.filename}` : ""}
                      </div>
                      <div className="text-muted-foreground text-xs">
                        {formatDateTime(e.at)} · {e.handler ?? "—"} · home log
                      </div>
                    </div>
                  </li>
                ))}
            </ol>
            {!cloudLog.data?.length && !homeLog.data?.length ? (
              <p className="text-muted-foreground text-sm">No custody events yet.</p>
            ) : null}
          </section>
        </div>
      </div>

      <LinkToCaseDialog
        open={linkOpen}
        onOpenChange={setLinkOpen}
        sourceId={sourceId}
        recordId={recordId}
        onLinked={() => void refs.refetch()}
      />
    </div>
  );
}
