import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Minus, Plus, WifiOff, X } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useSignedUrl } from "@/components/EvidenceThumb";
import { HashChip } from "@/components/HashChip";
import { formatDateTime, LIVE_KINDS, RENDER_KINDS } from "@/lib/format";
import { getCachedCase, offlineFirst, queueCustodyEvent, useOnline } from "@/lib/offline";

export const Route = createFileRoute("/_authenticated/review/$caseId")({
  head: ({ params }) => {
    const title = `Review CASE-${params.caseId} — SpyGlass V2`;
    const description =
      "iPad review deck: swipe through captured screenshots and renders for a case, with pinch-to-zoom and chain-of-custody details.";
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary" },
      ],
    };
  },
  component: ReviewDeck,
});

type ItemRow = Record<string, unknown>;
type ArtefactRow = Record<string, unknown>;

async function fetchReviewItems(caseId: string) {
  const { data, error } = await supabase
    .from("items")
    .select(
      "*, artefacts(*), accounts!inner(id, handle, display_name, platform, incidents!inner(incident_id, case_id))",
    )
    .eq("accounts.incidents.case_id", caseId)
    .order("item_code");
  if (error) throw error;
  return data as unknown as ItemRow[];
}

function imageArtefacts(item: ItemRow): ArtefactRow[] {
  const list = (item["artefacts"] ?? []) as ArtefactRow[];
  return list.filter((a) => {
    const kind = a["kind"] as string;
    return LIVE_KINDS.has(kind) || RENDER_KINDS.has(kind) || kind === "media";
  });
}

function kindLabel(kind: string) {
  if (LIVE_KINDS.has(kind)) return "Live screenshot";
  if (RENDER_KINDS.has(kind)) return "Render – from API data, not a platform screenshot";
  return "Media";
}

function ReviewDeck() {
  const { caseId } = Route.useParams();
  const online = useOnline();
  const [itemIndex, setItemIndex] = useState(0);
  const [zoomed, setZoomed] = useState<ArtefactRow | null>(null);
  const deckRef = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState(0);

  const items = useQuery({
    queryKey: ["review-items", caseId],
    queryFn: () =>
      offlineFirst<ItemRow[]>(
        () => fetchReviewItems(caseId),
        async () => {
          const cached = await getCachedCase(caseId);
          if (!cached) return null;
          return [...cached.items].sort((a, b) =>
            String(a["item_code"]).localeCompare(String(b["item_code"])),
          );
        },
      ),
  });

  const list = useMemo(() => items.data ?? [], [items.data]);
  const item = list[itemIndex];
  const artefacts = useMemo(() => (item ? imageArtefacts(item) : []), [item]);

  const scrollToPage = useCallback((index: number) => {
    const deck = deckRef.current;
    if (!deck) return;
    deck.scrollTo({ left: index * deck.clientWidth, behavior: "smooth" });
  }, []);

  useEffect(() => {
    setPage(0);
    deckRef.current?.scrollTo({ left: 0 });
  }, [itemIndex]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setZoomed(null);
      if (zoomed) return;
      if (e.key === "ArrowRight") scrollToPage(Math.min(page + 1, artefacts.length - 1));
      if (e.key === "ArrowLeft") scrollToPage(Math.max(page - 1, 0));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [page, artefacts.length, scrollToPage, zoomed]);

  async function logAccess(a: ArtefactRow) {
    const payload = {
      artefact_id: a["id"] as string,
      item_id: item?.["id"] as string,
      filename: a["filename"] as string,
      sha256: a["sha256"] as string,
      action: "accessed",
      handler: localStorage.getItem("fbem.handler") ?? "unknown",
      notes: "Viewed in iPad review mode",
    };
    if (!navigator.onLine) {
      await queueCustodyEvent(payload);
      return;
    }
    const { error } = await supabase.from("custody_events").insert(payload);
    if (error) await queueCustodyEvent(payload);
  }

  if (items.isLoading) return <p className="text-muted-foreground">Opening review deck…</p>;

  return (
    <div className="-m-4 flex h-[calc(100dvh-4rem)] flex-col md:-m-8 md:h-[calc(100dvh-4rem)]">
      {/* Phones: review mode is built for the iPad canvas */}
      <div className="text-muted-foreground p-6 text-sm md:hidden">
        <p className="text-foreground mb-2 text-base font-semibold">Review mode is for iPad</p>
        <p>
          This screen is laid out for a tablet in landscape. On a phone, open the case and tap an
          item to read it.
        </p>
        <Link to="/cases/$caseId" params={{ caseId }} className="text-primary mt-4 inline-block">
          ← Back to CASE-{caseId}
        </Link>
      </div>

      <div className="hidden min-h-0 flex-1 flex-col md:flex">
        <header className="flex items-center gap-4 border-b px-5 py-3">
          <div className="min-w-0">
            <div className="hash text-muted-foreground text-xs">Review mode</div>
            <div className="truncate text-lg font-semibold">CASE-{caseId}</div>
          </div>
          {!online ? (
            <span className="bg-warn/20 text-warn-foreground inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs">
              <WifiOff className="size-3.5" /> Offline copy
            </span>
          ) : null}
          <Link
            to="/cases/$caseId"
            params={{ caseId }}
            className="border-input hover:bg-accent ml-auto inline-flex min-h-12 items-center gap-2 rounded-lg border px-4 text-sm font-medium"
          >
            <X className="size-4" /> Close
          </Link>
        </header>

        <div className="flex min-h-0 flex-1">
          {/* Item rail */}
          <nav className="w-64 shrink-0 overflow-y-auto border-r p-3">
            {list.length ? (
              list.map((it, i) => (
                <button
                  key={it["id"] as string}
                  type="button"
                  onClick={() => setItemIndex(i)}
                  className={`mb-2 block min-h-14 w-full rounded-xl px-4 py-3 text-left ${
                    i === itemIndex ? "bg-primary text-primary-foreground" : "hover:bg-accent"
                  }`}
                >
                  <div className="hash text-sm">{it["item_code"] as string}</div>
                  <div className="truncate text-xs opacity-80">
                    {(it["author_name"] as string) ?? "—"} · {imageArtefacts(it).length} file
                    {imageArtefacts(it).length === 1 ? "" : "s"}
                  </div>
                </button>
              ))
            ) : (
              <p className="text-muted-foreground p-3 text-sm">No captured items in this case.</p>
            )}
          </nav>

          {/* Swipeable artefact deck */}
          <section className="flex min-w-0 flex-1 flex-col">
            {item ? (
              <>
                <div className="flex items-start gap-4 px-6 py-4">
                  <div className="min-w-0">
                    <h1 className="text-xl font-semibold">{item["item_code"] as string}</h1>
                    <p className="text-muted-foreground truncate text-sm">
                      {(item["author_name"] as string) ?? "Unknown author"} ·{" "}
                      {formatDateTime(item["published_at"] as string | null)}
                    </p>
                  </div>
                  <Link
                    to="/items/$itemId"
                    params={{ itemId: item["id"] as string }}
                    className="border-input hover:bg-accent ml-auto inline-flex min-h-12 items-center rounded-lg border px-4 text-sm font-medium"
                  >
                    Full record
                  </Link>
                </div>

                {artefacts.length ? (
                  <>
                    <div
                      ref={deckRef}
                      onScroll={(e) => {
                        const el = e.currentTarget;
                        setPage(Math.round(el.scrollLeft / Math.max(el.clientWidth, 1)));
                      }}
                      className="flex min-h-0 flex-1 snap-x snap-mandatory overflow-x-auto overflow-y-hidden scroll-smooth"
                    >
                      {artefacts.map((a) => (
                        <ArtefactSlide
                          key={a["id"] as string}
                          artefact={a}
                          onOpen={() => {
                            setZoomed(a);
                            void logAccess(a);
                          }}
                        />
                      ))}
                    </div>

                    <div className="flex items-center justify-center gap-4 border-t px-6 py-3">
                      <button
                        type="button"
                        aria-label="Previous artefact"
                        onClick={() => scrollToPage(Math.max(page - 1, 0))}
                        disabled={page === 0}
                        className="border-input hover:bg-accent flex size-12 items-center justify-center rounded-full border disabled:opacity-40"
                      >
                        <ChevronLeft className="size-5" />
                      </button>
                      <div className="flex items-center gap-2">
                        {artefacts.map((a, i) => (
                          <button
                            key={a["id"] as string}
                            type="button"
                            aria-label={`Go to artefact ${i + 1}`}
                            onClick={() => scrollToPage(i)}
                            className={`size-2.5 rounded-full ${
                              i === page ? "bg-primary" : "bg-muted-foreground/40"
                            }`}
                          />
                        ))}
                      </div>
                      <button
                        type="button"
                        aria-label="Next artefact"
                        onClick={() => scrollToPage(Math.min(page + 1, artefacts.length - 1))}
                        disabled={page >= artefacts.length - 1}
                        className="border-input hover:bg-accent flex size-12 items-center justify-center rounded-full border disabled:opacity-40"
                      >
                        <ChevronRight className="size-5" />
                      </button>
                      <span className="text-muted-foreground ml-2 text-sm">
                        {page + 1} / {artefacts.length} · swipe to browse, tap to zoom
                      </span>
                    </div>
                  </>
                ) : (
                  <p className="text-muted-foreground p-6 text-sm">
                    No screenshots or renders on this item.
                  </p>
                )}
              </>
            ) : (
              <p className="text-muted-foreground p-6 text-sm">Select an item on the left.</p>
            )}
          </section>
        </div>
      </div>

      {zoomed ? <ZoomViewer artefact={zoomed} onClose={() => setZoomed(null)} /> : null}
    </div>
  );
}

function ArtefactSlide({ artefact, onOpen }: { artefact: ArtefactRow; onOpen: () => void }) {
  const path = artefact["storage_path"] as string;
  const signed = useSignedUrl(path, 300);
  const kind = artefact["kind"] as string;

  return (
    <div className="flex w-full shrink-0 snap-center flex-col items-center justify-center gap-3 p-6">
      <button
        type="button"
        onClick={onOpen}
        className="flex min-h-0 flex-1 items-center justify-center"
      >
        {signed.data ? (
          <img
            src={signed.data}
            alt={artefact["filename"] as string}
            className="max-h-full max-w-full rounded-xl border object-contain shadow-sm"
          />
        ) : (
          <span className="text-muted-foreground text-sm">
            {signed.isError ? "File not available on this device" : "Loading…"}
          </span>
        )}
      </button>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <span
          className={`rounded px-2 py-0.5 text-[10px] font-bold tracking-wide uppercase ${
            LIVE_KINDS.has(kind) ? "bg-done text-done-foreground" : "bg-warn text-warn-foreground"
          }`}
        >
          {kindLabel(kind)}
        </span>
        <span className="hash text-muted-foreground text-xs">
          {artefact["filename"] as string}
        </span>
        {artefact["sha256"] ? <HashChip value={artefact["sha256"] as string} /> : null}
      </div>
    </div>
  );
}

function ZoomViewer({ artefact, onClose }: { artefact: ArtefactRow; onClose: () => void }) {
  const signed = useSignedUrl(artefact["storage_path"] as string, 300);
  const [scale, setScale] = useState(1);

  return (
    <div className="bg-background fixed inset-0 z-50 flex flex-col">
      <div className="flex items-center gap-3 border-b px-4 py-3">
        <span className="hash truncate text-sm">{artefact["filename"] as string}</span>
        <span
          className={`shrink-0 rounded px-2 py-0.5 text-[10px] font-bold tracking-wide uppercase ${
            LIVE_KINDS.has(artefact["kind"] as string)
              ? "bg-done text-done-foreground"
              : "bg-warn text-warn-foreground"
          }`}
        >
          {kindLabel(artefact["kind"] as string)}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            aria-label="Zoom out"
            onClick={() => setScale((s) => Math.max(1, +(s - 0.5).toFixed(1)))}
            className="border-input hover:bg-accent flex size-12 items-center justify-center rounded-full border"
          >
            <Minus className="size-5" />
          </button>
          <span className="w-14 text-center text-sm tabular-nums">{scale.toFixed(1)}×</span>
          <button
            type="button"
            aria-label="Zoom in"
            onClick={() => setScale((s) => Math.min(6, +(s + 0.5).toFixed(1)))}
            className="border-input hover:bg-accent flex size-12 items-center justify-center rounded-full border"
          >
            <Plus className="size-5" />
          </button>
          <button
            type="button"
            aria-label="Close viewer"
            onClick={onClose}
            className="border-input hover:bg-accent flex size-12 items-center justify-center rounded-full border"
          >
            <X className="size-5" />
          </button>
        </div>
      </div>
      <div className="flex-1 touch-pinch-zoom overflow-auto p-4">
        {signed.data ? (
          <img
            src={signed.data}
            alt={artefact["filename"] as string}
            onDoubleClick={() => setScale((s) => (s > 1 ? 1 : 2.5))}
            style={{ width: `${scale * 100}%` }}
            className="mx-auto max-w-none origin-top"
          />
        ) : (
          <p className="text-muted-foreground p-6 text-sm">Loading…</p>
        )}
      </div>
    </div>
  );
}
