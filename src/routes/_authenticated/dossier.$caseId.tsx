import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Printer } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/dossier/$caseId")({
  head: () => ({ meta: [{ title: "Case dossier — SpyGlass V2" }] }),
  component: DossierPage,
});

type Art = { id: string; kind: string; filename: string; sha256: string | null; storage_path: string; captured_at: string };
type PT = { display?: string; basis?: string };
type Entry = {
  id: string;
  code: string;
  kind: "Post" | "Reel" | "Comment" | "Reply";
  parentCode: string | null;
  author: string | null;
  handle: string | null;
  text: string | null;
  textEn: string | null;
  translator: string | null;
  url: string | null;
  publishedAt: string | null;
  pt: PT | undefined;
  capturedAt: string;
  incidentId: string;
  arts: Art[];
};

const anchor = (code: string) => `item-${code.replace(/[^A-Za-z0-9-]/g, "")}`;

async function textOf(a: Art | undefined) {
  if (!a) return null;
  const { data } = await supabase.storage.from("evidence").download(a.storage_path);
  if (!data) return null;
  await supabase.from("custody_events").insert({
    artefact_id: a.id,
    filename: a.filename,
    sha256: a.sha256,
    action: "accessed",
    notes: "Read into case dossier",
  });
  return data.text();
}

async function fetchDossier(caseId: string) {
  const [c, inc] = await Promise.all([
    supabase.from("cases").select("*").eq("id", caseId).maybeSingle(),
    supabase
      .from("incidents")
      .select(
        "incident_id, accounts(handle, items(id, item_code, item_type, parent_item_id, url, author_name, author_handle, text_original, text_en, translator_statement, published_at, captured_at, engagement, artefacts(id, kind, filename, sha256, storage_path, captured_at)))",
      )
      .eq("case_id", caseId),
  ]);
  if (c.error) throw c.error;
  if (inc.error) throw inc.error;

  const raw = (inc.data ?? []).flatMap((i) =>
    (i.accounts ?? []).flatMap((a) => (a.items ?? []).map((it) => ({ it, incidentId: i.incident_id }))),
  );
  const codeById = new Map(raw.map((r) => [r.it.id, r.it.item_code]));
  const entries: Entry[] = raw.map(({ it, incidentId }) => {
    const arts = (it.artefacts ?? []) as Art[];
    const reel =
      it.item_type === "post" &&
      (arts.some((a) => a.kind === "audio_original") || /\/reel|\/share\/r\/|\/share\/v\/|\/videos\//.test(it.url ?? ""));
    return {
      id: it.id,
      code: it.item_code,
      kind: it.item_type === "post" ? (reel ? "Reel" : "Post") : it.item_type === "reply" ? "Reply" : "Comment",
      parentCode: it.parent_item_id ? (codeById.get(it.parent_item_id) ?? null) : null,
      author: it.author_name,
      handle: it.author_handle,
      text: it.text_original,
      textEn: it.text_en,
      translator: it.translator_statement,
      url: it.url,
      publishedAt: it.published_at,
      pt: ((it.engagement ?? {}) as { published_time?: PT }).published_time,
      capturedAt: it.captured_at,
      incidentId,
      arts,
    };
  });
  const key = (e: Entry) => e.publishedAt ?? `9999${e.capturedAt}`;
  entries.sort((a, b) => (key(a) < key(b) ? -1 : 1));

  const reels = await Promise.all(
    entries
      .filter((e) => e.arts.some((a) => a.kind.startsWith("transcript_")))
      .map(async (e) => {
        const newest = (k: string) =>
          e.arts.filter((a) => a.kind === k).sort((x, y) => (x.captured_at < y.captured_at ? 1 : -1))[0];
        const o = newest("transcript_original");
        const en = newest("transcript_en");
        return { e, o, en, audio: newest("audio_original"), oText: await textOf(o), enText: await textOf(en) };
      }),
  );
  const comments = entries.flatMap((e) =>
    e.arts.filter((a) => a.kind === "comment_screenshot").map((a) => ({ e, a })),
  );
  return { caseRow: c.data, entries, reels, comments };
}

function DossierPage() {
  const { caseId } = Route.useParams();
  const q = useQuery({ queryKey: ["dossier", caseId], queryFn: () => fetchDossier(caseId) });
  if (q.isLoading) return <p className="text-muted-foreground p-6">Preparing dossier…</p>;
  if (q.error) return <p className="text-destructive p-6">{(q.error as Error).message}</p>;
  const { caseRow, entries, reels, comments } = q.data!;
  const n = (k: Entry["kind"]) => entries.filter((e) => e.kind === k).length;
  const dated = entries.filter((e) => e.publishedAt);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <Link
          to="/cases/$caseId"
          params={{ caseId }}
          className="border-input hover:bg-accent inline-flex min-h-12 items-center gap-2 rounded-lg border px-4 text-sm font-medium"
        >
          <ArrowLeft className="size-4" /> Back to case
        </Link>
        <Button className="h-12" onClick={() => window.print()}>
          <Printer className="size-4" /> Print / save as PDF
        </Button>
      </div>

      <header className="panel p-6">
        <p className="text-muted-foreground text-xs tracking-widest uppercase">Evidence dossier</p>
        <h1 className="mt-1 text-2xl font-bold">CASE-{caseId}</h1>
        <p className="text-muted-foreground mt-1 text-sm">Generated {formatDateTime(new Date().toISOString())} (Asia/Kuala_Lumpur)</p>
        <nav className="no-print mt-4 flex flex-wrap gap-3 text-sm">
          {["summary", "timeline", "transcripts", "comments", "declaration"].map((s) => (
            <a key={s} href={`#${s}`} className="text-primary underline capitalize">{s}</a>
          ))}
        </nav>
      </header>

      <section id="summary" className="panel p-6">
        <h2 className="mb-4 text-lg font-semibold">1. Case summary</h2>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <F l="Target of complaint" v={caseRow?.target_of_complaint} />
          <F l="Offence alleged" v={caseRow?.offence_alleged} />
          <F l="Jurisdiction / agency" v={caseRow?.jurisdiction_agency} />
          <F l="Lead handler" v={caseRow?.lead_handler} />
          <F l="Opened" v={caseRow?.opened_on} />
          <F l="Status" v={caseRow?.status} />
          <F l="Evidence items" v={`${n("Post")} posts, ${n("Reel")} reels, ${n("Comment")} comments, ${n("Reply")} replies`} />
          <F
            l="Published between"
            v={dated.length ? `${formatDateTime(dated[0]!.publishedAt!)} – ${formatDateTime(dated[dated.length - 1]!.publishedAt!)}` : "No published dates recorded"}
          />
          <F l="Transcripts / comment screenshots" v={`${reels.length} / ${comments.length}`} />
        </dl>
        {caseRow?.notes ? <p className="mt-4 text-sm whitespace-pre-wrap">{caseRow.notes}</p> : null}
      </section>

      <section id="timeline" className="panel print-break p-6">
        <h2 className="mb-1 text-lg font-semibold">2. Timeline of published content</h2>
        <p className="text-muted-foreground mb-4 text-xs">
          Ordered by original published time. Items without a recorded published time follow, ordered by capture time.
        </p>
        <ol className="space-y-4">
          {entries.map((e) => (
            <li key={e.id} id={anchor(e.code)} className="border-border break-inside-avoid border-l-2 pl-4">
              <div className="flex flex-wrap items-baseline gap-2 text-sm">
                <strong>{e.kind}</strong>
                <Link to="/items/$itemId" params={{ itemId: e.id }} className="text-primary font-mono underline">{e.code}</Link>
                {e.parentCode ? (
                  <span className="text-muted-foreground text-xs">
                    on <a href={`#${anchor(e.parentCode)}`} className="underline">{e.parentCode}</a>
                  </span>
                ) : null}
                <span className="text-muted-foreground text-xs">INC-{e.incidentId}</span>
              </div>
              <p className="text-xs">
                Published:{" "}
                {e.publishedAt
                  ? `${formatDateTime(e.publishedAt)}${e.pt?.basis === "approximate" ? " (approximate)" : ""}${e.pt?.display ? ` — shown as “${e.pt.display}”` : ""}`
                  : "not recorded"}
                {" · "}Captured: {formatDateTime(e.capturedAt)}
              </p>
              <p className="text-xs">Author: {e.author ?? "Insufficient data"}{e.handle && e.handle !== "unknown" ? ` (${e.handle})` : ""}</p>
              {e.url ? <p className="text-xs break-all">Source: {e.url}</p> : null}
              {e.text ? <p className="mt-1 text-sm whitespace-pre-wrap">{e.text}</p> : null}
              {e.textEn ? (
                <p className="mt-1 text-sm italic">
                  English: {e.textEn}
                  {e.translator ? <span className="text-muted-foreground block text-xs not-italic">{e.translator}</span> : null}
                </p>
              ) : null}
              {e.arts.length ? (
                <ul className="mt-1 space-y-0.5 text-[11px]">
                  {e.arts.map((a) => (
                    <li key={a.id} className="font-mono break-all">
                      {a.filename} — SHA-256 {a.sha256 ?? "not recorded"}
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ol>
      </section>

      <section id="transcripts" className="panel print-break p-6">
        <h2 className="mb-1 text-lg font-semibold">3. Transcript trail</h2>
        <p className="text-muted-foreground mb-4 text-xs">
          MACHINE TRANSCRIPTS – not verified by a human. Must be checked against the original audio by a qualified person before use.
        </p>
        {reels.length === 0 ? <p className="text-sm">No transcripts recorded for this case.</p> : null}
        {reels.map(({ e, o, en, audio, oText, enText }) => (
          <div key={e.id} className="mb-6 break-inside-avoid">
            <p className="text-sm">
              <a href={`#${anchor(e.code)}`} className="text-primary font-mono underline">{e.code}</a> ·{" "}
              {e.author ?? "Insufficient data"} · captured {formatDateTime(e.capturedAt)}
            </p>
            {audio ? <p className="font-mono text-[11px] break-all">Audio: {audio.filename} — SHA-256 {audio.sha256}</p> : null}
            <div className="mt-2 grid gap-4 sm:grid-cols-2">
              {[["Original", o, oText], ["English", en, enText]].map(([label, a, t]) => (
                <div key={label as string}>
                  <p className="text-xs font-semibold">{label as string}</p>
                  {a ? <p className="font-mono text-[11px] break-all">{(a as Art).filename} — SHA-256 {(a as Art).sha256}</p> : null}
                  <pre className="mt-1 font-sans text-xs whitespace-pre-wrap">{(t as string | null) ?? "Not available"}</pre>
                </div>
              ))}
            </div>
          </div>
        ))}
      </section>

      <section id="comments" className="panel print-break p-6">
        <h2 className="mb-4 text-lg font-semibold">4. Comment trail</h2>
        {comments.length === 0 ? <p className="text-sm">No comment screenshots recorded for this case.</p> : null}
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left">
              <th className="py-1 pr-2">Item</th><th className="pr-2">Author</th><th className="pr-2">Captured</th><th>File / SHA-256</th>
            </tr>
          </thead>
          <tbody>
            {comments.map(({ e, a }) => (
              <tr key={a.id} className="border-border border-t align-top">
                <td className="py-1 pr-2"><a href={`#${anchor(e.code)}`} className="text-primary font-mono underline">{e.code}</a></td>
                <td className="pr-2">{e.author ?? "Insufficient data"}</td>
                <td className="pr-2">{formatDateTime(a.captured_at)}</td>
                <td className="font-mono break-all">{a.filename}<br />{a.sha256}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section id="declaration" className="panel print-break p-6 text-sm">
        <h2 className="mb-3 text-lg font-semibold">5. Declaration</h2>
        <p>
          The material above was captured by SpyGlass V2 and preserved in append-only storage. Each file is identified by the
          SHA-256 fingerprint shown; any alteration would change the fingerprint. Translations and transcripts are machine-generated
          unless stated otherwise and are kept separate from the original text.
        </p>
        <div className="mt-10 grid gap-10 sm:grid-cols-2">
          <div><div className="border-foreground border-t pt-1">Prepared by (name, signature)</div></div>
          <div><div className="border-foreground border-t pt-1">Date</div></div>
        </div>
      </section>
    </div>
  );
}

function F({ l, v }: { l: string; v?: string | null | undefined }) {
  return (
    <div>
      <dt className="text-muted-foreground text-xs uppercase">{l}</dt>
      <dd>{v || "—"}</dd>
    </div>
  );
}
