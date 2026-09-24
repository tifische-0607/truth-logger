import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  FileJson,
  FileText,
  FileType,
  Image as ImageIcon,
  Video,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/AppShell";
import { EvidenceThumb, useSignedUrl } from "@/components/EvidenceThumb";
import { CaptureCustodyTrail } from "@/components/CaptureCustodyTrail";
import { formatBytes, formatDateTime } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/results")({
  component: ResultsPage,
});

type Artefact = {
  id: string;
  filename: string;
  kind: string;
  storage_path: string;
  size_bytes: number | null;
  mime_type: string | null;
};

type ResultRow = {
  jobId: string;
  url: string;
  finishedAt: string | null;
  itemId: string;
  itemCode: string;
  author: string | null;
  textOriginal: string | null;
  caseId: string | null;
  incidentId: string | null;
  handle: string | null;
  artefacts: Artefact[];
};

async function fetchResults(): Promise<ResultRow[]> {
  const { data: jobs, error } = await supabase
    .from("capture_jobs")
    .select("id, url, result, finished_at")
    .eq("status", "done")
    .order("finished_at", { ascending: false })
    .limit(50);
  if (error) throw error;

  const itemIds = (jobs ?? [])
    .map((j) =>
      j.result && typeof j.result === "object" && !Array.isArray(j.result)
        ? ((j.result as Record<string, unknown>)["item_id"] as string | undefined)
        : undefined,
    )
    .filter((v): v is string => Boolean(v));

  if (!itemIds.length) return [];

  const { data: items, error: itemError } = await supabase
    .from("items")
    .select(
      "id, item_code, author_name, author_handle, text_original, artefacts(id, filename, kind, storage_path, size_bytes, mime_type), accounts(handle, incidents(incident_id, case_id))",
    )
    .in("id", itemIds);
  if (itemError) throw itemError;

  const byId = new Map((items ?? []).map((it) => [it.id, it]));

  const rows: ResultRow[] = [];
  for (const job of jobs ?? []) {
    const itemId =
      job.result && typeof job.result === "object" && !Array.isArray(job.result)
        ? ((job.result as Record<string, unknown>)["item_id"] as string | undefined)
        : undefined;
    if (!itemId) continue;
    const item = byId.get(itemId);
    if (!item) continue;
    const account = Array.isArray(item.accounts) ? item.accounts[0] : item.accounts;
    const incident = account?.incidents
      ? Array.isArray(account.incidents)
        ? account.incidents[0]
        : account.incidents
      : null;
    rows.push({
      jobId: job.id,
      url: job.url,
      finishedAt: job.finished_at,
      itemId: item.id,
      itemCode: item.item_code,
      author: item.author_name ?? item.author_handle,
      textOriginal: item.text_original,
      caseId: incident?.case_id ?? null,
      incidentId: incident?.incident_id ?? null,
      handle: account?.handle ?? null,
      artefacts: (item.artefacts ?? []) as Artefact[],
    });
  }
  return rows;
}

function pickArtefact(artefacts: Artefact[], kinds: string[]): Artefact | undefined {
  return kinds.map((k) => artefacts.find((a) => a.kind === k)).find(Boolean);
}

function ResultsPage() {
  const queryClient = useQueryClient();
  const [viewer, setViewer] = useState<Artefact | null>(null);
  const viewerUrl = useSignedUrl(viewer?.storage_path ?? null, 300);

  const results = useQuery({ queryKey: ["capture-results"], queryFn: fetchResults });

  useEffect(() => {
    const channel = supabase
      .channel(`results-feed-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "capture_jobs" }, () =>
        void queryClient.invalidateQueries({ queryKey: ["capture-results"] }),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return (
    <>
      <PageHeader
        title="Results"
        subtitle="Every completed capture with its files — screenshot, PDF, saved page and text."
      />

      {results.isLoading ? (
        <p className="text-muted-foreground">Loading results…</p>
      ) : results.data?.length ? (
        <div className="space-y-5">
          {results.data.map((row) => {
            const screenshot = pickArtefact(row.artefacts, ["screenshot", "render", "media"]);
            const pdf = pickArtefact(row.artefacts, ["screenshot_pdf", "render_pdf"]);
            const page = pickArtefact(row.artefacts, ["comments_page_raw"]);
            const text = pickArtefact(row.artefacts, ["text_original"]);
            const video = pickArtefact(row.artefacts, ["live_video_segment"]);

            return (
              <section key={row.jobId} className="panel overflow-hidden">
                <div className="grid gap-5 p-5 md:grid-cols-[16rem_1fr]">
                  <button
                    type="button"
                    className="group text-left"
                    onClick={() => screenshot && setViewer(screenshot)}
                    disabled={!screenshot}
                  >
                    <EvidenceThumb path={screenshot?.storage_path ?? null} />
                    {screenshot ? (
                      <div className="hash text-muted-foreground mt-2">{screenshot.filename}</div>
                    ) : null}
                  </button>

                  <div className="min-w-0">
                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      <span className="font-mono text-sm font-bold">{row.itemCode}</span>
                      {row.caseId ? (
                        <Link
                          to="/cases/$caseId"
                          params={{ caseId: row.caseId }}
                          className="text-primary font-mono text-xs hover:underline"
                        >
                          CASE-{row.caseId} · INC-{row.incidentId ?? "—"}
                        </Link>
                      ) : null}
                      <span className="text-muted-foreground text-xs">
                        {formatDateTime(row.finishedAt)}
                      </span>
                    </div>
                    <div className="mt-1 text-sm font-medium">
                      {row.author ?? "Unknown author"}
                      {row.handle ? (
                        <span className="text-muted-foreground font-mono text-xs">
                          {" "}
                          @{row.handle}
                        </span>
                      ) : null}
                    </div>
                    {row.textOriginal ? (
                      <p className="text-muted-foreground mt-2 line-clamp-2 text-sm">
                        {row.textOriginal}
                      </p>
                    ) : null}

                    <div className="mt-4 flex flex-wrap gap-2">
                      <ArtefactButton
                        artefact={screenshot}
                        icon={<ImageIcon className="size-4" />}
                        label="Screenshot"
                        onView={setViewer}
                      />
                      <ArtefactButton
                        artefact={pdf}
                        icon={<FileType className="size-4" />}
                        label="PDF"
                      />
                      <ArtefactButton
                        artefact={page}
                        icon={<FileJson className="size-4" />}
                        label="Saved page"
                      />
                      <ArtefactButton
                        artefact={text}
                        icon={<FileText className="size-4" />}
                        label="Text"
                      />
                      <ArtefactButton
                        artefact={video}
                        icon={<Video className="size-4" />}
                        label="Video"
                      />
                      <Link
                        to="/items/$itemId"
                        params={{ itemId: row.itemId }}
                        className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex min-h-11 items-center gap-2 rounded-lg px-4 text-sm font-medium transition-colors"
                      >
                        Review evidence <ArrowRight className="size-4" />
                      </Link>
                    </div>
                  </div>
                </div>
                <details className="mt-4">
                  <summary className="text-primary min-h-11 cursor-pointer py-2 text-sm font-medium">
                    Show custody trail
                  </summary>
                  <div className="mt-2">
                    <CaptureCustodyTrail itemId={row.itemId} />
                  </div>
                </details>
              </section>
            );
          })}
        </div>
      ) : (
        <div className="panel text-muted-foreground p-8 text-center text-sm">
          No completed captures yet. Send a capture from the{" "}
          <Link to="/queue" className="text-primary underline">
            Queue
          </Link>{" "}
          and it will appear here when the Mac mini finishes it.
        </div>
      )}

      {viewer ? (
        <div
          className="fixed inset-0 z-50 flex flex-col bg-black/90"
          onClick={() => setViewer(null)}
        >
          <div className="flex items-center justify-between p-4 text-white">
            <div className="hash">{viewer.filename}</div>
            <button onClick={() => setViewer(null)} className="p-2" aria-label="Close">
              <X className="size-6" />
            </button>
          </div>
          <div className="flex-1 touch-pinch-zoom overflow-auto p-4">
            {viewerUrl.data ? (
              <img src={viewerUrl.data} alt={viewer.filename} className="mx-auto max-w-none" />
            ) : (
              <p className="text-center text-white/70">Loading…</p>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}

function ArtefactButton({
  artefact,
  icon,
  label,
  onView,
}: {
  artefact: Artefact | undefined;
  icon: React.ReactNode;
  label: string;
  onView?: ((a: Artefact) => void) | undefined;
}) {
  if (!artefact) return null;

  const open = async () => {
    if (onView && artefact.mime_type?.startsWith("image/")) {
      onView(artefact);
      return;
    }
    const { data: signed, error } = await supabase.storage
      .from("evidence")
      .createSignedUrl(artefact.storage_path, 300);
    if (error || !signed) {
      toast.error("File not available in the evidence store");
      return;
    }
    window.open(signed.signedUrl, "_blank");
  };

  return (
    <button
      type="button"
      onClick={() => void open()}
      className="border-input hover:bg-accent inline-flex min-h-11 items-center gap-2 rounded-lg border px-4 text-sm font-medium transition-colors"
    >
      {icon}
      {label}
      <span className="text-muted-foreground text-xs">{formatBytes(artefact.size_bytes)}</span>
    </button>
  );
}
