import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Loader2, MessageSquare } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/AppShell";
import { EvidenceThumb } from "@/components/EvidenceThumb";
import { formatDateTime } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/comments/$caseId")({
  head: () => ({ meta: [{ title: "Comment trail — SpyGlass V2" }] }),
  component: CommentTrailPage,
});

type PublishedTime = { display?: string; basis?: string };

type RawItem = {
  id: string;
  item_code: string;
  item_type: string;
  parent_item_id: string | null;
  author_name: string | null;
  author_handle: string | null;
  text_original: string | null;
  text_en: string | null;
  published_at: string | null;
  captured_at: string;
  engagement: Record<string, unknown> | null;
  artefacts:
    | { id: string; kind: string; filename: string; storage_path: string; sha256: string | null }[]
    | null;
};

type Thread = {
  post: RawItem;
  incidentId: string;
  comments: { item: RawItem; replies: RawItem[] }[];
};

async function fetchThreads(caseId: string): Promise<Thread[]> {
  const { data, error } = await supabase
    .from("incidents")
    .select(
      "incident_id, accounts(items(id, item_code, item_type, parent_item_id, author_name, author_handle, text_original, text_en, published_at, captured_at, engagement, artefacts(id, kind, filename, storage_path, sha256)))",
    )
    .eq("case_id", caseId);
  if (error) throw error;

  const threads: Thread[] = [];
  for (const inc of data ?? []) {
    const items = (inc.accounts ?? []).flatMap((a) => (a.items ?? []) as unknown as RawItem[]);
    const byId = new Map(items.map((i) => [i.id, i]));
    const posts = items.filter((i) => i.item_type === "post");
    const sortKey = (i: RawItem) => i.published_at ?? i.captured_at;
    for (const post of posts) {
      const topLevel = items
        .filter((i) => i.parent_item_id === post.id)
        .sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
      if (!topLevel.length) continue;
      threads.push({
        post,
        incidentId: inc.incident_id,
        comments: topLevel.map((c) => ({
          item: c,
          replies: items
            .filter((r) => r.parent_item_id === c.id)
            .sort((a, b) => sortKey(a).localeCompare(sortKey(b))),
        })),
      });
    }
    void byId;
  }
  return threads.sort((a, b) =>
    (a.post.published_at ?? a.post.captured_at).localeCompare(
      b.post.published_at ?? b.post.captured_at,
    ),
  );
}

function publishedInfo(item: RawItem): { at: string | null; approximate: boolean } {
  const pt = ((item.engagement ?? {}) as { published_time?: PublishedTime }).published_time;
  return {
    at: item.published_at,
    approximate: pt?.basis === "approximate",
  };
}

function CommentEntry({ item, isReply }: { item: RawItem; isReply?: boolean }) {
  const shot = (item.artefacts ?? []).find((a) => a.kind === "comment_screenshot");
  const pub = publishedInfo(item);
  return (
    <div className={isReply ? "border-border ml-6 border-l-2 pl-4 md:ml-10" : ""}>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <Link
          to="/items/$itemId"
          params={{ itemId: item.id }}
          className="text-primary font-mono text-xs font-bold hover:underline"
        >
          {item.item_code}
        </Link>
        <span className="text-sm font-medium">
          {item.author_name ?? "Insufficient data"}
          {item.author_handle && item.author_handle !== "unknown" ? (
            <span className="text-muted-foreground font-mono text-xs"> @{item.author_handle}</span>
          ) : null}
        </span>
        <span className="text-muted-foreground text-xs">
          {pub.at ? (
            <>
              {formatDateTime(pub.at)}
              {pub.approximate ? " (approximate)" : ""}
            </>
          ) : (
            <>captured {formatDateTime(item.captured_at)}</>
          )}
        </span>
      </div>
      {item.text_original ? (
        <p className="mt-1 text-sm whitespace-pre-wrap">{item.text_original}</p>
      ) : null}
      {item.text_en ? (
        <p className="text-muted-foreground mt-1 text-sm italic whitespace-pre-wrap">
          EN: {item.text_en}
        </p>
      ) : null}
      {shot ? (
        <div className="mt-2 max-w-xs">
          <Link to="/items/$itemId" params={{ itemId: item.id }}>
            <EvidenceThumb path={shot.storage_path} />
          </Link>
          <div className="hash text-muted-foreground mt-1 text-xs break-all">
            SHA-256 {shot.sha256 ?? "—"}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function CommentTrailPage() {
  const { caseId } = Route.useParams();
  const q = useQuery({ queryKey: ["comment-trail", caseId], queryFn: () => fetchThreads(caseId) });

  const totalComments =
    q.data?.reduce((n, t) => n + t.comments.length + t.comments.reduce((m, c) => m + c.replies.length, 0), 0) ?? 0;

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
        subtitle="Every comment and reply, grouped under its post, in published order."
      />
      {q.isLoading ? (
        <p className="text-muted-foreground flex items-center gap-2">
          <Loader2 className="size-4 animate-spin" /> Loading comments…
        </p>
      ) : q.error ? (
        <p className="text-destructive">Could not load comments: {(q.error as Error).message}</p>
      ) : q.data?.length ? (
        <div className="space-y-6">
          <p className="text-muted-foreground text-sm">
            {q.data.length} conversation{q.data.length === 1 ? "" : "s"} · {totalComments} comments
            and replies
          </p>
          {q.data.map((t) => (
            <section key={t.post.id} className="panel p-4 md:p-5">
              <header className="border-border mb-4 border-b pb-3">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <MessageSquare className="text-muted-foreground size-4 self-center" />
                  <Link
                    to="/items/$itemId"
                    params={{ itemId: t.post.id }}
                    className="text-primary font-mono text-sm font-bold hover:underline"
                  >
                    {t.post.item_code}
                  </Link>
                  <span className="text-muted-foreground text-xs">INC-{t.incidentId}</span>
                  <span className="text-sm font-medium">
                    {t.post.author_name ?? "Insufficient data"}
                    {t.post.author_handle && t.post.author_handle !== "unknown" ? (
                      <span className="text-muted-foreground font-mono text-xs">
                        {" "}
                        @{t.post.author_handle}
                      </span>
                    ) : null}
                  </span>
                  {t.post.published_at ? (
                    <span className="text-muted-foreground text-xs">
                      {formatDateTime(t.post.published_at)}
                    </span>
                  ) : null}
                </div>
                {t.post.text_original ? (
                  <p className="text-muted-foreground mt-2 line-clamp-3 text-sm">
                    {t.post.text_original}
                  </p>
                ) : null}
              </header>
              <div className="space-y-5">
                {t.comments.map((c) => (
                  <div key={c.item.id} className="space-y-4">
                    <CommentEntry item={c.item} />
                    {c.replies.map((r) => (
                      <CommentEntry key={r.id} item={r} isReply />
                    ))}
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="panel text-muted-foreground p-8 text-center text-sm">
          No comments captured in this case yet. They're saved automatically on new captures.
        </div>
      )}
    </>
  );
}
