import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Loader2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/AppShell";
import { EvidenceThumb } from "@/components/EvidenceThumb";
import { formatDateTime } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/comments/$caseId")({
  head: () => ({ meta: [{ title: "Comment trail — SpyGlass V2" }] }),
  component: CommentTrailPage,
});

type Entry = {
  artefactId: string;
  itemId: string;
  itemCode: string;
  itemType: string;
  incidentId: string;
  postCode: string | null;
  author: string | null;
  handle: string | null;
  text: string | null;
  capturedAt: string;
  filename: string;
  storagePath: string;
  sha256: string | null;
};

async function fetchEntries(caseId: string): Promise<Entry[]> {
  const { data, error } = await supabase
    .from("incidents")
    .select(
      "incident_id, accounts(items(id, item_code, item_type, parent_item_id, author_name, author_handle, text_original, captured_at, artefacts(id, kind, filename, storage_path, sha256, captured_at)))",
    )
    .eq("case_id", caseId);
  if (error) throw error;
  const out: Entry[] = [];
  for (const inc of data ?? []) {
    const items = (inc.accounts ?? []).flatMap((a) => a.items ?? []);
    const codeById = new Map(items.map((i) => [i.id, i.item_code]));
    for (const item of items) {
      for (const art of item.artefacts ?? []) {
        if (art.kind !== "comment_screenshot") continue;
        out.push({
          artefactId: art.id,
          itemId: item.id,
          itemCode: item.item_code,
          itemType: item.item_type,
          incidentId: inc.incident_id,
          postCode: item.parent_item_id ? (codeById.get(item.parent_item_id) ?? null) : null,
          author: item.author_name,
          handle: item.author_handle,
          text: item.text_original,
          capturedAt: art.captured_at ?? item.captured_at,
          filename: art.filename,
          storagePath: art.storage_path,
          sha256: art.sha256,
        });
      }
    }
  }
  return out.sort(
    (a, b) => a.capturedAt.localeCompare(b.capturedAt) || a.itemCode.localeCompare(b.itemCode),
  );
}

function CommentTrailPage() {
  const { caseId } = Route.useParams();
  const q = useQuery({ queryKey: ["comment-trail", caseId], queryFn: () => fetchEntries(caseId) });

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
        title={`Comment trail — CASE-${caseId}`}
        subtitle="Every comment and reply screenshot in this case, oldest first, with its full SHA-256 fingerprint."
      />
      {q.isLoading ? (
        <p className="text-muted-foreground flex items-center gap-2">
          <Loader2 className="size-4 animate-spin" /> Loading comments…
        </p>
      ) : q.error ? (
        <p className="text-destructive">Could not load comments: {(q.error as Error).message}</p>
      ) : q.data?.length ? (
        <ol className="space-y-4">
          {q.data.map((e) => (
            <li key={e.artefactId} className="panel grid gap-4 p-4 md:grid-cols-[14rem_1fr]">
              <Link to="/items/$itemId" params={{ itemId: e.itemId }}>
                <EvidenceThumb path={e.storagePath} />
              </Link>
              <div className="min-w-0">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <Link
                    to="/items/$itemId"
                    params={{ itemId: e.itemId }}
                    className="text-primary font-mono text-sm font-bold hover:underline"
                  >
                    {e.itemCode}
                  </Link>
                  <span className="text-muted-foreground text-xs">
                    {e.itemType === "reply" ? "Reply" : "Comment"}
                    {e.postCode ? ` on ${e.postCode}` : ""} · INC-{e.incidentId}
                  </span>
                  <span className="text-muted-foreground text-xs">
                    Captured {formatDateTime(e.capturedAt)}
                  </span>
                </div>
                <div className="mt-1 text-sm font-medium">
                  {e.author ?? "Insufficient data"}
                  {e.handle && e.handle !== "unknown" ? (
                    <span className="text-muted-foreground font-mono text-xs"> @{e.handle}</span>
                  ) : null}
                </div>
                {e.text ? <p className="text-muted-foreground mt-2 line-clamp-3 text-sm">{e.text}</p> : null}
                <div className="hash text-muted-foreground mt-3 break-all">{e.filename}</div>
                <div className="hash mt-1 break-all">SHA-256 {e.sha256 ?? "—"}</div>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <div className="panel text-muted-foreground p-8 text-center text-sm">
          No comment screenshots in this case yet. They're saved automatically on new captures once the Mac mini has the latest update.
        </div>
      )}
    </>
  );
}
