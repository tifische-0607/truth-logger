import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Printer } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { formatBytes, formatDateTime } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/report/$caseId")({
  head: () => ({
    meta: [
      { title: "Case report — SpyGlass V2" },
      {
        name: "description",
        content:
          "Printable case report: timeline of events, chain-of-custody log and the full artefact register with SHA-256 hashes.",
      },
      { property: "og:title", content: "Case report — SpyGlass V2" },
      {
        property: "og:description",
        content: "A court-ready summary of a case: timeline, custody log and artefacts.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CaseReport,
});

type Row = Record<string, unknown>;

async function loadReport(caseId: string) {
  const { data: caseRow, error: caseErr } = await supabase
    .from("cases")
    .select("*")
    .eq("id", caseId)
    .maybeSingle();
  if (caseErr) throw caseErr;

  const { data: incidents, error: incErr } = await supabase
    .from("incidents")
    .select(
      "id, incident_id, start_date, end_date, summary, escalation_stage, narrative_themes, created_at, accounts(id, handle, platform, display_name, profile_url, account_snapshots(id, captured_at, followers, following, verified, display_name), items(id, item_code, item_type, author_name, author_handle, url, published_at, captured_at, text_original, text_en, translator_statement))",
    )
    .eq("case_id", caseId)
    .order("incident_id");
  if (incErr) throw incErr;

  const items = (incidents ?? []).flatMap((inc) =>
    (inc.accounts ?? []).flatMap((a) =>
      (a.items ?? []).map((i) => ({
        ...i,
        account: `${a.platform}_@${a.handle}`,
        incident: inc.incident_id,
      })),
    ),
  );
  const itemIds = items.map((i) => i.id);

  let artefacts: Row[] = [];
  let custody: Row[] = [];
  if (itemIds.length) {
    const [{ data: arts, error: aErr }, { data: evs, error: cErr }] = await Promise.all([
      supabase
        .from("artefacts")
        .select("id, item_id, filename, kind, sha256, size_bytes, mime_type, captured_at")
        .in("item_id", itemIds)
        .order("captured_at"),
      supabase
        .from("custody_events")
        .select("id, item_id, filename, action, handler, tool_version, notes, sha256, created_at")
        .in("item_id", itemIds)
        .order("created_at", { ascending: false })
        .limit(1000),
    ]);
    if (aErr) throw aErr;
    if (cErr) throw cErr;
    artefacts = (arts ?? []) as unknown as Row[];
    custody = (evs ?? []) as unknown as Row[];
  }

  return { caseRow, incidents: incidents ?? [], items, artefacts, custody };
}

function CaseReport() {
  const { caseId } = Route.useParams();
  const report = useQuery({
    queryKey: ["case-report", caseId],
    queryFn: () => loadReport(caseId),
  });

  if (report.isLoading) return <p className="text-muted-foreground">Building report…</p>;
  if (report.error) return <p className="text-muted-foreground">Could not load this case.</p>;
  const data = report.data!;
  if (!data.caseRow) return <p className="text-muted-foreground">Case not found.</p>;

  const c = data.caseRow;
  const itemById = new Map(data.items.map((i) => [i.id, i]));

  const timeline = [
    ...data.incidents.map((inc) => ({
      at: inc.start_date ? `${inc.start_date}T00:00:00Z` : inc.created_at,
      label: `INC-${inc.incident_id} opened`,
      detail: inc.summary ?? "Incident wave recorded",
    })),
    ...data.items.map((i) => ({
      at: i.captured_at,
      label: `${i.item_code} captured`,
      detail: `${i.item_type} by ${i.author_name ?? "unknown"} on ${i.account}`,
    })),
    ...data.custody.map((e) => ({
      at: String(e["created_at"]),
      label: `${String(e["action"])} · ${String(e["filename"] ?? "artefact")}`,
      detail: [e["handler"], e["notes"]].filter(Boolean).join(" · ") || "Custody event",
    })),
  ].sort((a, b) => String(a.at).localeCompare(String(b.at)));

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Case report</h1>
          <p className="text-muted-foreground text-sm">
            Printable summary for investigators, police reports and court bundles.
          </p>
        </div>
        <Button className="h-12" onClick={() => window.print()}>
          <Printer className="size-4" /> Print / save as PDF
        </Button>
      </div>

      <section className="panel space-y-3 p-6">
        <h2 className="text-xl font-bold">CASE-{caseId}</h2>
        <p className="text-muted-foreground text-xs">
          Report generated {formatDateTime(new Date().toISOString())}
        </p>
        <dl className="mt-3 grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
          {(
            [
              ["Opened", formatDateTime(c.opened_on)],
              ["Status", c.status],
              ["Target of complaint", c.target_of_complaint ?? "—"],
              ["Offence alleged", c.offence_alleged ?? "—"],
              ["Jurisdiction / agency", c.jurisdiction_agency ?? "—"],
              ["Lead handler", c.lead_handler ?? "—"],
              ["Incidents", String(data.incidents.length)],
              ["Evidence items", String(data.items.length)],
              ["Artefacts", String(data.artefacts.length)],
              ["Custody entries", String(data.custody.length)],
            ] as const
          ).map(([label, value]) => (
            <div key={label} className="flex justify-between gap-4 border-b py-1">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="text-right font-medium">{value}</dd>
            </div>
          ))}
        </dl>
        {c.notes ? <p className="mt-3 text-sm whitespace-pre-wrap">{c.notes}</p> : null}
      </section>

      <section className="panel p-6">
        <h2 className="text-lg font-semibold">1. Timeline of events</h2>
        <p className="text-muted-foreground text-xs">{timeline.length} events, oldest first</p>
        <ol className="mt-4 space-y-3">
          {timeline.map((e, idx) => (
            <li key={`${e.at}-${idx}`} className="border-b pb-2 text-sm last:border-0">
              <div className="hash text-muted-foreground">{formatDateTime(e.at)}</div>
              <div className="font-medium">{e.label}</div>
              <div className="text-muted-foreground text-xs">{e.detail}</div>
            </li>
          ))}
          {timeline.length === 0 ? (
            <li className="text-muted-foreground text-sm">Nothing recorded for this case yet.</li>
          ) : null}
        </ol>
      </section>

      <section className="panel print-break p-6">
        <h2 className="text-lg font-semibold">2. Evidence items</h2>
        <div className="mt-4 space-y-5">
          {data.items.map((i) => (
            <article key={i.id} className="border-b pb-4 last:border-0">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="font-mono text-sm font-bold">{i.item_code}</h3>
                <span className="text-muted-foreground text-xs">
                  INC-{i.incident} · {i.account} · captured {formatDateTime(i.captured_at)}
                </span>
              </div>
              <div className="text-muted-foreground mt-1 text-xs">
                {i.item_type} by {i.author_name ?? "unknown"}
                {i.author_handle ? ` (@${i.author_handle})` : ""}
                {i.published_at ? ` · published ${formatDateTime(i.published_at)}` : ""}
              </div>
              {i.url ? <div className="hash mt-1 break-all">{i.url}</div> : null}
              {i.text_original ? (
                <p className="mt-2 text-sm whitespace-pre-wrap">{i.text_original}</p>
              ) : null}
              {i.text_en ? (
                <div className="bg-muted/50 mt-2 rounded-lg p-3 text-sm">
                  <div className="text-muted-foreground text-xs font-semibold uppercase">
                    English translation
                  </div>
                  <p className="mt-1 whitespace-pre-wrap">{i.text_en}</p>
                  {i.translator_statement ? (
                    <p className="text-muted-foreground mt-2 text-xs italic">
                      {i.translator_statement}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </article>
          ))}
          {data.items.length === 0 ? (
            <p className="text-muted-foreground text-sm">No evidence items captured yet.</p>
          ) : null}
        </div>
      </section>

      <section className="panel print-break p-6">
        <h2 className="text-lg font-semibold">3. Artefact register</h2>
        <p className="text-muted-foreground text-xs">
          Every stored file with its SHA-256 hash at capture time.
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-muted-foreground uppercase">
              <tr className="border-b">
                <th className="py-2 pr-3">Item</th>
                <th className="py-2 pr-3">Filename</th>
                <th className="py-2 pr-3">Kind</th>
                <th className="py-2 pr-3">Size</th>
                <th className="py-2">SHA-256</th>
              </tr>
            </thead>
            <tbody>
              {data.artefacts.map((a) => (
                <tr key={String(a["id"])} className="border-b align-top">
                  <td className="py-2 pr-3 font-mono">
                    {itemById.get(String(a["item_id"]))?.item_code ?? "—"}
                  </td>
                  <td className="py-2 pr-3 break-all">{String(a["filename"])}</td>
                  <td className="py-2 pr-3">{String(a["kind"])}</td>
                  <td className="py-2 pr-3">{formatBytes(a["size_bytes"] as number | null)}</td>
                  <td className="hash py-2">{String(a["sha256"] ?? "—")}</td>
                </tr>
              ))}
              {data.artefacts.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-muted-foreground py-3">
                    No artefacts stored yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel print-break p-6">
        <h2 className="text-lg font-semibold">4. Chain-of-custody log</h2>
        <p className="text-muted-foreground text-xs">
          Append-only record, newest first. Entries are never edited or deleted.
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-muted-foreground uppercase">
              <tr className="border-b">
                <th className="py-2 pr-3">When</th>
                <th className="py-2 pr-3">Action</th>
                <th className="py-2 pr-3">Item</th>
                <th className="py-2 pr-3">File</th>
                <th className="py-2 pr-3">Handler</th>
                <th className="py-2">SHA-256</th>
              </tr>
            </thead>
            <tbody>
              {data.custody.map((e) => (
                <tr key={String(e["id"])} className="border-b align-top">
                  <td className="py-2 pr-3 whitespace-nowrap">
                    {formatDateTime(String(e["created_at"]))}
                  </td>
                  <td className="py-2 pr-3 font-medium">{String(e["action"])}</td>
                  <td className="py-2 pr-3 font-mono">
                    {itemById.get(String(e["item_id"]))?.item_code ?? "—"}
                  </td>
                  <td className="py-2 pr-3 break-all">{String(e["filename"] ?? "—")}</td>
                  <td className="py-2 pr-3">{String(e["handler"] ?? "—")}</td>
                  <td className="hash py-2">{String(e["sha256"] ?? "—")}</td>
                </tr>
              ))}
              {data.custody.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-muted-foreground py-3">
                    No custody entries recorded yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <p className="text-muted-foreground text-xs">
        Images built from platform API data are labelled “RENDER – from API data, not a platform
        screenshot”. Translations are separate from the original text and carry a translator
        statement.
      </p>
    </div>
  );
}
