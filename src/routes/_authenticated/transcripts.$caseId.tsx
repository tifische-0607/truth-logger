import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, FileAudio, Loader2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/AppShell";
import { formatDateTime } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/transcripts/$caseId")({
  head: () => ({ meta: [{ title: "Transcript trail — SpyGlass V2" }] }),
  component: TranscriptTrailPage,
});

type Art = { id: string; kind: string; filename: string; storage_path: string; sha256: string | null };

type Entry = {
  itemId: string;
  itemCode: string;
  incidentId: string;
  handle: string;
  author: string | null;
  url: string | null;
  capturedAt: string;
  original: Art | null;
  english: Art | null;
  audio: Art | null;
};

async function fetchEntries(caseId: string): Promise<Entry[]> {
  const { data, error } = await supabase
    .from("incidents")
    .select(
      "incident_id, accounts(handle, items(id, item_code, url, author_name, captured_at, artefacts(id, kind, filename, storage_path, sha256)))",
    )
    .eq("case_id", caseId);
  if (error) throw error;
  const out: Entry[] = [];
  for (const inc of data ?? []) {
    for (const acc of inc.accounts ?? []) {
      for (const item of acc.items ?? []) {
        const arts = (item.artefacts ?? []) as Art[];
        const original = arts.find((a) => a.kind === "transcript_original") ?? null;
        const english = arts.find((a) => a.kind === "transcript_en") ?? null;
        if (!original && !english) continue;
        out.push({
          itemId: item.id,
          itemCode: item.item_code,
          incidentId: inc.incident_id,
          handle: acc.handle,
          author: item.author_name,
          url: item.url,
          capturedAt: item.captured_at,
          original,
          english,
          audio: arts.find((a) => a.kind === "audio_original") ?? null,
        });
      }
    }
  }
  return out.sort((a, b) => a.capturedAt.localeCompare(b.capturedAt));
}

/** Download a transcript file and log the access in the custody trail. */
async function readTranscript(art: Art, itemId: string): Promise<string> {
  const { data, error } = await supabase.storage.from("evidence").download(art.storage_path);
  if (error || !data) throw error ?? new Error("File not available");
  const { data: user } = await supabase.auth.getUser();
  await supabase.from("custody_events").insert({
    artefact_id: art.id,
    item_id: itemId,
    filename: art.filename,
    sha256: art.sha256,
    action: "accessed",
    handler: user.user?.email ?? null,
    notes: "Viewed on transcript trail",
  });
  return data.text();
}

function TranscriptTrailPage() {
  const { caseId } = Route.useParams();
  const q = useQuery({ queryKey: ["transcript-trail", caseId], queryFn: () => fetchEntries(caseId) });

  return (
    <>
      <Link
        to="/cases/$caseId"
        params={{ caseId }}
        className="text-muted-foreground hover:text-foreground mb-3 inline-flex min-h-11 items-center gap-2 text-sm"
      >
        <ArrowLeft className="size-4" /> Back to case
      </Link>
      <PageHeader
        title={`Transcript trail — CASE-${caseId}`}
        subtitle="Every reel transcript in this case, oldest first. Machine transcripts — check against the original audio before use in any report."
      />
      {q.isLoading ? (
        <p className="text-muted-foreground flex items-center gap-2">
          <Loader2 className="size-4 animate-spin" /> Loading transcripts…
        </p>
      ) : q.error ? (
        <p className="text-destructive">Could not load transcripts: {(q.error as Error).message}</p>
      ) : q.data?.length ? (
        <ol className="space-y-5">
          {q.data.map((e) => (
            <TranscriptCard key={e.itemId} entry={e} />
          ))}
        </ol>
      ) : (
        <div className="panel text-muted-foreground p-8 text-center text-sm">
          No transcripts in this case yet. They're saved automatically when the Mac mini captures a reel or video.
        </div>
      )}
    </>
  );
}

function TranscriptCard({ entry }: { entry: Entry }) {
  const original = useQuery({
    queryKey: ["transcript-file", entry.original?.id],
    queryFn: () => readTranscript(entry.original!, entry.itemId),
    enabled: Boolean(entry.original),
    staleTime: Infinity,
  });
  const english = useQuery({
    queryKey: ["transcript-file", entry.english?.id],
    queryFn: () => readTranscript(entry.english!, entry.itemId),
    enabled: Boolean(entry.english),
    staleTime: Infinity,
  });

  return (
    <li className="panel p-5">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <Link
          to="/items/$itemId"
          params={{ itemId: entry.itemId }}
          className="text-primary font-mono text-sm font-bold hover:underline"
        >
          {entry.itemCode}
        </Link>
        <span className="font-mono text-xs">INC-{entry.incidentId}</span>
        <span className="text-muted-foreground text-xs">Captured {formatDateTime(entry.capturedAt)}</span>
      </div>
      <div className="mt-1 text-sm font-medium">
        {entry.author ?? "Unknown author"}{" "}
        <span className="text-muted-foreground font-mono text-xs">@{entry.handle}</span>
      </div>
      {entry.url ? (
        <div className="text-muted-foreground mt-1 truncate font-mono text-xs">{entry.url}</div>
      ) : null}
      {entry.audio ? (
        <div className="text-muted-foreground mt-2 flex items-center gap-2 text-xs">
          <FileAudio className="size-4" /> Original audio saved ·{" "}
          <span className="hash">{entry.audio.sha256?.slice(0, 16)}…</span>
        </div>
      ) : null}

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <TranscriptBlock title="Original language" art={entry.original} q={original} />
        <TranscriptBlock title="English (machine translation)" art={entry.english} q={english} />
      </div>

      <Link
        to="/items/$itemId"
        params={{ itemId: entry.itemId }}
        className="border-input hover:bg-accent mt-4 inline-flex min-h-11 items-center rounded-lg border px-4 text-sm font-medium"
      >
        Open evidence item
      </Link>
    </li>
  );
}

function TranscriptBlock({
  title,
  art,
  q,
}: {
  title: string;
  art: Art | null;
  q: { data?: string | undefined; isLoading: boolean; error: unknown };
}) {
  if (!art) return <div className="text-muted-foreground text-sm">{title}: not saved</div>;
  const lines = (q.data ?? "").split("\n");
  return (
    <div className="bg-muted/40 rounded-lg border p-3">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide">{title}</div>
      {q.isLoading ? (
        <p className="text-muted-foreground text-sm">Loading…</p>
      ) : q.error ? (
        <p className="text-destructive text-sm">File not available</p>
      ) : (
        <div className="max-h-96 space-y-1 overflow-auto text-sm">
          {lines.map((line, i) => {
            const m = /^\s*\[(\d{1,2}:\d{2}(?::\d{2})?)\]\s*(.*)$/.exec(line);
            if (m)
              return (
                <div key={i} className="flex gap-3">
                  <span className="text-primary shrink-0 font-mono text-xs leading-5">{m[1]}</span>
                  <span>{m[2]}</span>
                </div>
              );
            return line.trim() ? (
              <p key={i} className="text-muted-foreground text-xs italic">
                {line}
              </p>
            ) : null;
          })}
        </div>
      )}
      <div className="hash text-muted-foreground mt-2 break-all">SHA-256 {art.sha256 ?? "—"}</div>
    </div>
  );
}
