import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, FileText, ImageOff, Loader2, X } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { EvidenceThumb, useSignedUrl } from "@/components/EvidenceThumb";
import { HashChip } from "@/components/HashChip";
import { Button } from "@/components/ui/button";
import { formatBytes, LIVE_KINDS, RENDER_KINDS } from "@/lib/format";

type Artefact = {
  id: string;
  filename: string;
  kind: string;
  storage_path: string;
  sha256: string | null;
  size_bytes: number | null;
  mime_type: string | null;
  captured_at: string;
};

const IMAGE_RE = /\.(png|jpe?g|webp|gif)$/i;
const VIDEO_RE = /\.(mp4|mov|webm|m4v)$/i;
const TEXT_RE = /\.(txt|md|json|log)$/i;

function isImage(a: Artefact) {
  return (
    LIVE_KINDS.has(a.kind) ||
    RENDER_KINDS.has(a.kind) ||
    a.kind === "media" ||
    a.mime_type?.startsWith("image/") === true ||
    IMAGE_RE.test(a.filename)
  );
}
function isVideo(a: Artefact) {
  return (
    a.kind === "live_video_segment" ||
    a.mime_type?.startsWith("video/") === true ||
    VIDEO_RE.test(a.filename)
  );
}
function isText(a: Artefact) {
  return a.mime_type?.startsWith("text/") === true || TEXT_RE.test(a.filename);
}

async function logAccess(artefact: Artefact, itemId: string, note: string) {
  const handler = localStorage.getItem("fbem.handler") ?? "unknown";
  const payload = {
    artefact_id: artefact.id,
    item_id: itemId,
    filename: artefact.filename,
    sha256: artefact.sha256,
    action: "accessed",
    handler,
    notes: note,
  };
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    const { queueCustodyEvent } = await import("@/lib/offline");
    await queueCustodyEvent(payload);
    return;
  }
  const { error } = await supabase.from("custody_events").insert(payload);
  if (error) {
    const { queueCustodyEvent } = await import("@/lib/offline");
    await queueCustodyEvent(payload);
  }
}

async function download(artefact: Artefact, itemId: string) {
  await logAccess(artefact, itemId, "Downloaded from the capture viewer");
  const { data, error } = await supabase.storage
    .from("evidence")
    .createSignedUrl(artefact.storage_path, 300, { download: artefact.filename });
  if (error || !data) {
    toast.error("File not available in the evidence store");
    return;
  }
  window.open(data.signedUrl, "_blank");
}

function VideoCard({ artefact, itemId }: { artefact: Artefact; itemId: string }) {
  const url = useSignedUrl(artefact.storage_path, 600);
  return (
    <div className="space-y-2">
      <div className="bg-sidebar overflow-hidden rounded-lg border">
        {url.data ? (
          <video
            src={url.data}
            controls
            preload="metadata"
            className="w-full"
            onPlay={() => void logAccess(artefact, itemId, "Played video in the capture viewer")}
          />
        ) : (
          <div className="text-sidebar-foreground/60 flex aspect-video items-center justify-center">
            {url.isError ? "Not available offline" : <Loader2 className="size-5 animate-spin" />}
          </div>
        )}
      </div>
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="hash text-muted-foreground truncate">{artefact.filename}</div>
          <div className="text-muted-foreground text-xs">{formatBytes(artefact.size_bytes)}</div>
        </div>
        <Button variant="ghost" size="sm" onClick={() => void download(artefact, itemId)}>
          <Download className="size-4" />
        </Button>
      </div>
    </div>
  );
}

function NoteCard({ artefact, itemId }: { artefact: Artefact; itemId: string }) {
  const [open, setOpen] = useState(false);
  const text = useQuery({
    queryKey: ["artefact-text", artefact.id],
    enabled: open,
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase.storage
        .from("evidence")
        .createSignedUrl(artefact.storage_path, 300);
      if (error || !data) throw error ?? new Error("no url");
      const res = await fetch(data.signedUrl);
      if (!res.ok) throw new Error("fetch failed");
      const body = await res.text();
      await logAccess(artefact, itemId, "Read note in the capture viewer");
      return body;
    },
  });

  return (
    <div className="rounded-lg border">
      <button
        type="button"
        className="hover:bg-muted flex min-h-12 w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="flex min-w-0 items-center gap-2">
          <FileText className="text-muted-foreground size-4 shrink-0" />
          <span className="hash truncate text-sm">{artefact.filename}</span>
        </span>
        <span className="text-muted-foreground shrink-0 text-xs">
          {formatBytes(artefact.size_bytes)} · {open ? "Hide" : "Read"}
        </span>
      </button>
      {open ? (
        <div className="border-t px-4 py-3">
          {text.isLoading ? (
            <Loader2 className="size-4 animate-spin" />
          ) : text.isError ? (
            <p className="text-muted-foreground text-sm">
              Not available — connect to the internet to read this file.
            </p>
          ) : (
            <pre className="hash max-h-96 overflow-auto whitespace-pre-wrap text-xs">
              {text.data}
            </pre>
          )}
          <div className="mt-3 flex items-center justify-between gap-2">
            <HashChip value={artefact.sha256} label="SHA-256" />
            <Button variant="ghost" size="sm" onClick={() => void download(artefact, itemId)}>
              <Download className="size-4" />
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function useArtefactText(artefact: Artefact | null, itemId: string, note: string) {
  return useQuery({
    queryKey: ["artefact-text", artefact?.id],
    enabled: !!artefact,
    retry: false,
    staleTime: Infinity,
    queryFn: async () => {
      const a = artefact!;
      const { data, error } = await supabase.storage
        .from("evidence")
        .createSignedUrl(a.storage_path, 300);
      if (error || !data) throw error ?? new Error("no url");
      const res = await fetch(data.signedUrl);
      if (!res.ok) throw new Error("fetch failed");
      const body = await res.text();
      await logAccess(a, itemId, note);
      return body;
    },
  });
}

function TranscriptColumn({
  title,
  artefact,
  itemId,
}: {
  title: string;
  artefact: Artefact | null;
  itemId: string;
}) {
  const text = useArtefactText(artefact, itemId, "Read transcript on the capture page");
  const lines = (text.data ?? "").split("\n").map((l) => l.trimEnd()).filter(Boolean);
  return (
    <div className="min-w-0 rounded-lg border">
      <div className="border-b px-4 py-2 text-sm font-semibold">{title}</div>
      <div className="max-h-96 space-y-1 overflow-auto px-4 py-3">
        {!artefact ? (
          <p className="text-muted-foreground text-sm">Not captured.</p>
        ) : text.isLoading ? (
          <Loader2 className="size-4 animate-spin" />
        ) : text.isError ? (
          <p className="text-muted-foreground text-sm">
            Not available — connect to the internet to read this transcript.
          </p>
        ) : (
          lines.map((l, i) => {
            const m = l.match(/^\[(\d{1,2}:\d{2}(?::\d{2})?)\]\s*(.*)$/);
            return (
              <div key={i} className="flex gap-3 text-sm">
                {m ? (
                  <>
                    <span className="hash text-muted-foreground shrink-0">{m[1]}</span>
                    <span>{m[2]}</span>
                  </>
                ) : (
                  <span className="text-muted-foreground whitespace-pre-wrap">{l}</span>
                )}
              </div>
            );
          })
        )}
      </div>
      {artefact ? (
        <div className="flex items-center justify-between gap-2 border-t px-4 py-2">
          <HashChip value={artefact.sha256} label="SHA-256" />
          <Button variant="ghost" size="sm" onClick={() => void download(artefact, itemId)}>
            <Download className="size-4" />
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/** Photos, videos and notes captured for one evidence item. */
export function CaptureViewer({ itemId }: { itemId: string }) {
  const [zoomed, setZoomed] = useState<Artefact | null>(null);
  const zoomUrl = useSignedUrl(zoomed?.storage_path ?? null, 300);

  const artefacts = useQuery({
    queryKey: ["capture-viewer", itemId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("artefacts")
        .select("*")
        .eq("item_id", itemId)
        .order("captured_at");
      if (error) throw error;
      return data as Artefact[];
    },
  });

  if (artefacts.isLoading) {
    return (
      <section className="panel text-muted-foreground p-5 text-sm">
        <Loader2 className="mr-2 inline size-4 animate-spin" /> Loading captured files…
      </section>
    );
  }

  const all = artefacts.data ?? [];
  const TRANSCRIPT_KINDS = new Set(["transcript_original", "transcript_en"]);
  const tOriginal = [...all].reverse().find((a) => a.kind === "transcript_original") ?? null;
  const tEnglish = [...all].reverse().find((a) => a.kind === "transcript_en") ?? null;
  const photos = all.filter((a) => isImage(a) && !isVideo(a));
  const videos = all.filter(isVideo);
  const notes = all.filter(
    (a) => !isImage(a) && !isVideo(a) && isText(a) && !TRANSCRIPT_KINDS.has(a.kind),
  );
  const others = all.filter((a) => !isImage(a) && !isVideo(a) && !isText(a));

  return (
    <section className="panel space-y-6 p-5">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Capture viewer</h2>
        <span className="text-muted-foreground text-xs">
          {photos.length} photos · {videos.length} videos · {notes.length + others.length} files
        </span>
      </div>

      {all.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No files stored for this capture yet — they appear here as the Mac mini uploads them.
        </p>
      ) : null}

      {tOriginal || tEnglish ? (
        <div>
          <h3 className="text-muted-foreground mb-2 text-xs font-semibold tracking-wide uppercase">
            Reel transcript
          </h3>
          <p className="bg-warn text-warn-foreground mb-3 rounded px-3 py-2 text-xs font-semibold">
            MACHINE TRANSCRIPT – not verified by a human. Check against the original audio before
            use in any report.
          </p>
          <div className="grid gap-4 md:grid-cols-2">
            <TranscriptColumn title="Original language" artefact={tOriginal} itemId={itemId} />
            <TranscriptColumn title="English translation" artefact={tEnglish} itemId={itemId} />
          </div>
        </div>
      ) : null}

      {photos.length ? (
        <div>
          <h3 className="text-muted-foreground mb-2 text-xs font-semibold tracking-wide uppercase">
            Photos
          </h3>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
            {photos.map((a) => (
              <button
                key={a.id}
                type="button"
                className="group text-left"
                onClick={() => {
                  setZoomed(a);
                  void logAccess(a, itemId, "Viewed full-size in the capture viewer");
                }}
              >
                <EvidenceThumb path={a.storage_path} />
                <div
                  className={`mt-2 inline-block rounded px-2 py-0.5 text-[10px] font-bold tracking-wide uppercase ${
                    LIVE_KINDS.has(a.kind)
                      ? "bg-done text-done-foreground"
                      : RENDER_KINDS.has(a.kind)
                        ? "bg-warn text-warn-foreground"
                        : "bg-secondary text-secondary-foreground"
                  }`}
                >
                  {LIVE_KINDS.has(a.kind)
                    ? "Live screenshot"
                    : RENDER_KINDS.has(a.kind)
                      ? "Render – from API data, not a platform screenshot"
                      : "Image"}
                </div>
                <div className="hash text-muted-foreground mt-1 truncate">{a.filename}</div>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {videos.length ? (
        <div>
          <h3 className="text-muted-foreground mb-2 text-xs font-semibold tracking-wide uppercase">
            Videos
          </h3>
          <div className="grid gap-4 md:grid-cols-2">
            {videos.map((a) => (
              <VideoCard key={a.id} artefact={a} itemId={itemId} />
            ))}
          </div>
          <p className="text-muted-foreground mt-2 text-xs">
            Recorded exactly as received from Facebook, in one-minute pieces. Each piece has its
            own SHA-256 in the artefacts list.
          </p>
        </div>
      ) : null}

      {notes.length ? (
        <div>
          <h3 className="text-muted-foreground mb-2 text-xs font-semibold tracking-wide uppercase">
            Notes & captured text
          </h3>
          <div className="space-y-2">
            {notes.map((a) => (
              <NoteCard key={a.id} artefact={a} itemId={itemId} />
            ))}
          </div>
        </div>
      ) : null}

      {others.length ? (
        <div>
          <h3 className="text-muted-foreground mb-2 text-xs font-semibold tracking-wide uppercase">
            Other files
          </h3>
          <div className="space-y-2">
            {others.map((a) => (
              <div
                key={a.id}
                className="flex min-h-12 items-center justify-between gap-3 rounded-lg border px-4 py-2"
              >
                <div className="min-w-0">
                  <div className="hash truncate text-sm">{a.filename}</div>
                  <div className="text-muted-foreground text-xs">
                    {a.kind} · {formatBytes(a.size_bytes)}
                  </div>
                </div>
                <Button variant="ghost" size="sm" onClick={() => void download(a, itemId)}>
                  <Download className="size-4" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {zoomed ? (
        <div
          className="fixed inset-0 z-50 flex flex-col bg-black/90"
          onClick={() => setZoomed(null)}
        >
          <div className="flex items-center justify-between gap-4 p-4 text-white">
            <div className="hash truncate">{zoomed.filename}</div>
            <button onClick={() => setZoomed(null)} className="p-2" aria-label="Close">
              <X className="size-6" />
            </button>
          </div>
          <div className="flex-1 touch-pinch-zoom overflow-auto p-4">
            {zoomUrl.data ? (
              <img src={zoomUrl.data} alt={zoomed.filename} className="mx-auto max-w-none" />
            ) : (
              <p className="flex h-full items-center justify-center gap-2 text-center text-white/70">
                {zoomUrl.isError ? (
                  <>
                    <ImageOff className="size-5" /> Not available offline
                  </>
                ) : (
                  <Loader2 className="size-5 animate-spin" />
                )}
              </p>
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}
