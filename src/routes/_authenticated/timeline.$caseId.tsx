import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft, Clapperboard, FileText, MessageSquare, CornerDownRight, X } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/AppShell";
import { formatDateTime } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/timeline/$caseId")({
  head: () => ({ meta: [{ title: "Published timeline — SpyGlass V2" }] }),
  component: TimelinePage,
});

type PublishedTime = { display?: string; tooltip?: string; basis?: string; note?: string };

type Entry = {
  id: string;
  code: string;
  kind: "post" | "reel" | "comment" | "reply";
  author: string | null;
  handle: string | null;
  text: string | null;
  textEn: string | null;
  url: string | null;
  publishedAt: string | null;
  basis: string | null;
  display: string | null;
  capturedAt: string;
  incidentId: string;
};

const isReel = (url: string | null, kinds: string[]) =>
  !!url && (/\/reel|\/share\/r\/|\/share\/v\/|\/videos\/|\/watch/.test(url) || kinds.includes("audio_original"));

async function fetchTimeline(caseId: string) {
  const [caseRes, incRes] = await Promise.all([
    supabase.from("cases").select("*").eq("id", caseId).maybeSingle(),
    supabase
      .from("incidents")
      .select(
        "incident_id, accounts(handle, display_name, items(id, item_code, item_type, url, author_name, author_handle, text_original, text_en, published_at, captured_at, engagement, artefacts(kind)))",
      )
      .eq("case_id", caseId),
  ]);
  if (caseRes.error) throw caseRes.error;
  if (incRes.error) throw incRes.error;

  const entries: Entry[] = [];
  for (const inc of incRes.data ?? []) {
    for (const acc of inc.accounts ?? []) {
      for (const it of acc.items ?? []) {
        const pt = ((it.engagement ?? {}) as { published_time?: PublishedTime }).published_time;
        const kinds = (it.artefacts ?? []).map((a) => a.kind);
        const kind: Entry["kind"] =
          it.item_type === "post"
            ? isReel(it.url, kinds)
              ? "reel"
              : "post"
            : it.item_type === "reply"
              ? "reply"
              : "comment";
        entries.push({
          id: it.id,
          code: it.item_code,
          kind,
          author: it.author_name,
          handle: it.author_handle,
          text: it.text_original,
          textEn: it.text_en,
          url: it.url,
          publishedAt: it.published_at,
          basis: pt?.basis ?? (it.published_at ? "exact" : null),
          display: pt?.display ?? null,
          capturedAt: it.captured_at,
          incidentId: inc.incident_id,
        });
      }
    }
  }
  const dated = entries
    .filter((e) => e.publishedAt)
    .sort((a, b) => (a.publishedAt! < b.publishedAt! ? -1 : 1));
  const undated = entries
    .filter((e) => !e.publishedAt)
    .sort((a, b) => (a.capturedAt < b.capturedAt ? -1 : 1));
  return { caseRow: caseRes.data, dated, undated, all: entries };
}

const ICON = { post: FileText, reel: Clapperboard, comment: MessageSquare, reply: CornerDownRight };
const LABEL = { post: "Post", reel: "Reel", comment: "Comment", reply: "Reply" };

function TimelinePage() {
  const { caseId } = Route.useParams();
  const q = useQuery({ queryKey: ["timeline", caseId], queryFn: () => fetchTimeline(caseId) });
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  if (q.isLoading) return <p className="text-muted-foreground p-6">Loading timeline…</p>;
  if (q.error) return <p className="text-destructive p-6">{(q.error as Error).message}</p>;
  const { caseRow, dated, undated, all } = q.data!;

  const count = (k: Entry["kind"]) => all.filter((e) => e.kind === k).length;
  const authors = new Set(all.map((e) => e.handle ?? e.author).filter(Boolean)).size;

  const filtering = !!from || !!to;
  // Inclusive range in Kuala Lumpur calendar days: from 00:00 to 23:59:59.999.
  const fromMs = from ? new Date(`${from}T00:00:00+08:00`).getTime() : null;
  const toMs = to ? new Date(`${to}T23:59:59.999+08:00`).getTime() : null;
  const visible = dated.filter((e) => {
    const t = new Date(e.publishedAt!).getTime();
    if (fromMs !== null && t < fromMs) return false;
    if (toMs !== null && t > toMs) return false;
    return true;
  });

  const approx = visible.filter((e) => e.basis === "approximate").length;
  const first = dated[0]?.publishedAt;
  const last = dated[dated.length - 1]?.publishedAt;

  // Group dated entries by day (Kuala Lumpur).
  const dayFmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kuala_Lumpur",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const days = new Map<string, Entry[]>();
  for (const e of visible) {
    const d = dayFmt.format(new Date(e.publishedAt!));
    days.set(d, [...(days.get(d) ?? []), e]);
  }

  return (
    <div>
      <PageHeader
        title={`Published timeline — CASE-${caseId}`}
        subtitle="Posts, reels, comments and replies in the order they were published"
        actions={
          <Link
            to="/cases/$caseId"
            params={{ caseId }}
            className="border-input hover:bg-accent inline-flex min-h-12 items-center gap-2 rounded-lg border px-4 text-sm font-medium"
          >
            <ArrowLeft className="size-4" /> Back to case
          </Link>
        }
      />

      <section className="panel mb-6 p-5">
        <h2 className="mb-3 font-semibold">Case summary</h2>
        <dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <Fact label="Target of complaint" value={caseRow?.target_of_complaint} />
          <Fact label="Offence alleged" value={caseRow?.offence_alleged} />
          <Fact label="Agency" value={caseRow?.jurisdiction_agency} />
          <Fact label="Status / lead" value={[caseRow?.status, caseRow?.lead_handler].filter(Boolean).join(" · ")} />
          <Fact
            label="Evidence items"
            value={`${count("post")} posts · ${count("reel")} reels · ${count("comment")} comments · ${count("reply")} replies`}
          />
          <Fact label="Distinct authors" value={String(authors)} />
          <Fact
            label="Published between"
            value={first ? `${formatDateTime(first)} – ${formatDateTime(last!)}` : "No published dates yet"}
          />
          <Fact
            label="Date quality"
            value={`${dated.length - approx} exact · ${approx} approximate · ${undated.length} without a date`}
          />
        </dl>
        {caseRow?.notes ? (
          <p className="text-muted-foreground mt-4 text-sm whitespace-pre-wrap">{caseRow.notes}</p>
        ) : null}
      </section>

      <section className="panel mb-6 flex flex-wrap items-end gap-4 p-4">
        <div>
          <label htmlFor="tl-from" className="text-muted-foreground mb-1 block text-xs uppercase">
            Published from
          </label>
          <input
            id="tl-from"
            type="date"
            value={from}
            max={to || undefined}
            onChange={(e) => setFrom(e.target.value)}
            className="border-input bg-background min-h-12 rounded-lg border px-3 text-sm"
          />
        </div>
        <div>
          <label htmlFor="tl-to" className="text-muted-foreground mb-1 block text-xs uppercase">
            Published until
          </label>
          <input
            id="tl-to"
            type="date"
            value={to}
            min={from || undefined}
            onChange={(e) => setTo(e.target.value)}
            className="border-input bg-background min-h-12 rounded-lg border px-3 text-sm"
          />
        </div>
        {filtering ? (
          <button
            type="button"
            onClick={() => {
              setFrom("");
              setTo("");
            }}
            className="border-input hover:bg-accent inline-flex min-h-12 items-center gap-2 rounded-lg border px-4 text-sm font-medium"
          >
            <X className="size-4" /> Clear dates
          </button>
        ) : null}
        <p className="text-muted-foreground text-sm">
          {filtering
            ? `Showing ${visible.length} of ${dated.length} dated items${
                undated.length ? ` · ${undated.length} without a date are always listed below` : ""
              }`
            : "Pick a start or end date to show only that period."}
        </p>
      </section>

      {dated.length === 0 ? (
        <p className="text-muted-foreground panel p-5 text-sm">
          No items in this case have a published date yet. Dates are saved on captures made after the
          Mac mini update.
        </p>
      ) : (
        [...days.entries()].map(([day, list]) => (
          <section key={day} className="mb-6">
            <h3 className="text-muted-foreground mb-2 text-xs font-semibold tracking-wide uppercase">{day}</h3>
            <ol className="border-border ml-3 space-y-3 border-l pl-5">
              {list.map((e) => (
                <Row key={e.id} e={e} />
              ))}
            </ol>
          </section>
        ))
      )}

      {undated.length ? (
        <section className="mt-8">
          <h3 className="text-muted-foreground mb-2 text-xs font-semibold tracking-wide uppercase">
            No published date ({undated.length}) — listed by capture time
          </h3>
          <ol className="border-border ml-3 space-y-3 border-l border-dashed pl-5">
            {undated.map((e) => (
              <Row key={e.id} e={e} />
            ))}
          </ol>
        </section>
      ) : null}
    </div>
  );
}

function Fact({ label, value }: { label: string; value?: string | null | undefined }) {
  return (
    <div>
      <dt className="text-muted-foreground text-xs uppercase">{label}</dt>
      <dd className="mt-0.5">{value || "—"}</dd>
    </div>
  );
}

function Row({ e }: { e: Entry }) {
  const Icon = ICON[e.kind];
  return (
    <li className="panel relative p-4">
      <span className="bg-primary absolute top-5 -left-[27px] size-3 rounded-full" />
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Icon className="text-primary size-4" />
        <span className="font-semibold">{LABEL[e.kind]}</span>
        <Link to="/items/$itemId" params={{ itemId: e.id }} className="text-primary font-mono underline">
          {e.code}
        </Link>
        <span className="text-muted-foreground">INC-{e.incidentId}</span>
        <span className="ml-auto text-xs">
          {e.publishedAt ? (
            <>
              {formatDateTime(e.publishedAt)}
              {e.basis === "approximate" ? (
                <span className="border-primary/40 text-primary ml-2 rounded border px-1.5 py-0.5">approximate</span>
              ) : null}
              {e.display ? <span className="text-muted-foreground ml-2">shown as “{e.display}”</span> : null}
            </>
          ) : (
            <span className="text-muted-foreground">captured {formatDateTime(e.capturedAt)}</span>
          )}
        </span>
      </div>
      <div className="text-muted-foreground mt-1 text-xs">
        {e.author ?? "Insufficient data"}
        {e.handle && e.handle !== "unknown" ? ` · ${e.handle}` : ""}
      </div>
      {e.text ? <p className="mt-2 line-clamp-4 text-sm whitespace-pre-wrap">{e.text}</p> : null}
      {e.textEn && e.textEn !== e.text ? (
        <p className="text-muted-foreground mt-1 line-clamp-3 text-xs italic">EN (machine): {e.textEn}</p>
      ) : null}
    </li>
  );
}
