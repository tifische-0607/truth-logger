import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, BadgeCheck, LayoutList } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/AppShell";
import { formatDateTime } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/summary/$caseId")({
  head: () => ({ meta: [{ title: "Case summary — SpyGlass V2" }] }),
  component: CaseSummaryPage,
});

type Stated = {
  display_name?: string;
  verified?: boolean;
  followers?: number;
  following?: number;
  likes?: number;
};

type AuthorRow = {
  handle: string;
  name: string | null;
  verified: boolean;
  followers?: number;
  following?: number;
  likes?: number;
  posts: number;
  comments: number;
};

type IncidentRow = {
  incidentId: string;
  startDate: string | null;
  endDate: string | null;
  summary: string | null;
  escalationStage: string | null;
  firstCapture: string | null;
  lastCapture: string | null;
  authors: AuthorRow[];
};

async function fetchSummary(caseId: string): Promise<IncidentRow[]> {
  const { data, error } = await supabase
    .from("incidents")
    .select(
      "incident_id, start_date, end_date, summary, escalation_stage, accounts(handle, display_name, items(item_type, captured_at, subject_profiles(subject_type, stated)))",
    )
    .eq("case_id", caseId)
    .order("incident_id");
  if (error) throw error;

  const rows: IncidentRow[] = [];
  for (const inc of data ?? []) {
    const byHandle = new Map<string, AuthorRow>();
    let firstCapture: string | null = null;
    let lastCapture: string | null = null;
    for (const acc of inc.accounts ?? []) {
      const author: AuthorRow = byHandle.get(acc.handle) ?? {
        handle: acc.handle,
        name: acc.display_name,
        verified: false,
        posts: 0,
        comments: 0,
      };
      // Latest poster profile with counts wins, so the table shows the most recent numbers.
      for (const item of acc.items ?? []) {
        if (!firstCapture || item.captured_at < firstCapture) firstCapture = item.captured_at;
        if (!lastCapture || item.captured_at > lastCapture) lastCapture = item.captured_at;
        if (item.item_type === "post") author.posts += 1;
        else author.comments += 1;
        const poster = (item.subject_profiles ?? []).find((s) => s.subject_type === "poster");
        const stated = (poster?.stated ?? {}) as Stated;
        if (stated.followers != null || stated.following != null || stated.likes != null) {
          author.followers = stated.followers ?? author.followers;
          author.following = stated.following ?? author.following;
          author.likes = stated.likes ?? author.likes;
        }
        if (stated.verified != null) author.verified = stated.verified;
        if (stated.display_name) author.name = stated.display_name;
      }
      byHandle.set(acc.handle, author);
    }
    rows.push({
      incidentId: inc.incident_id,
      startDate: inc.start_date,
      endDate: inc.end_date,
      summary: inc.summary,
      escalationStage: inc.escalation_stage,
      firstCapture,
      lastCapture,
      authors: [...byHandle.values()].sort((a, b) => a.handle.localeCompare(b.handle)),
    });
  }
  return rows;
}

function fmt(n?: number) {
  return n == null ? "—" : n.toLocaleString();
}

function CaseSummaryPage() {
  const { caseId } = Route.useParams();
  const query = useQuery({
    queryKey: ["case-summary", caseId],
    queryFn: () => fetchSummary(caseId),
  });

  if (query.isLoading) return <p className="text-muted-foreground">Loading summary…</p>;
  const rows = query.data ?? [];
  const totalAuthors = new Set(rows.flatMap((r) => r.authors.map((a) => a.handle))).size;

  return (
    <>
      <PageHeader
        title={`Case summary — CASE-${caseId}`}
        subtitle={`${rows.length} incident${rows.length === 1 ? "" : "s"} · ${totalAuthors} author${totalAuthors === 1 ? "" : "s"}`}
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

      {rows.length === 0 ? (
        <div className="border-border bg-card rounded-xl border p-8 text-center">
          <LayoutList className="text-muted-foreground mx-auto mb-3 size-8" />
          <p className="text-muted-foreground text-sm">No incidents recorded for this case yet.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {rows.map((inc) => (
            <section key={inc.incidentId} className="border-border bg-card rounded-xl border p-5">
              <div className="mb-4 flex flex-wrap items-baseline gap-x-4 gap-y-1">
                <h2 className="text-lg font-semibold">{inc.incidentId}</h2>
                <span className="text-muted-foreground text-sm">
                  {inc.startDate ?? "?"} → {inc.endDate ?? "ongoing"}
                </span>
                {inc.escalationStage && (
                  <span className="border-input rounded-full border px-3 py-0.5 text-xs">
                    {inc.escalationStage}
                  </span>
                )}
              </div>
              {inc.summary && <p className="text-muted-foreground mb-4 text-sm">{inc.summary}</p>}
              <p className="text-muted-foreground mb-4 text-xs">
                {inc.firstCapture
                  ? `Evidence captured ${formatDateTime(inc.firstCapture)}${
                      inc.lastCapture && inc.lastCapture !== inc.firstCapture
                        ? ` – ${formatDateTime(inc.lastCapture)}`
                        : ""
                    }`
                  : "No evidence captured yet."}
              </p>

              {inc.authors.length === 0 ? (
                <p className="text-muted-foreground text-sm">No accounts recorded in this incident.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-sm">
                    <thead>
                      <tr className="text-muted-foreground border-border border-b text-left text-xs uppercase tracking-wide">
                        <th className="py-2 pr-4 font-medium">Author</th>
                        <th className="py-2 pr-4 font-medium">Handle</th>
                        <th className="py-2 pr-4 text-right font-medium">Followers</th>
                        <th className="py-2 pr-4 text-right font-medium">Following</th>
                        <th className="py-2 pr-4 text-right font-medium">Likes</th>
                        <th className="py-2 pr-4 text-right font-medium">Posts</th>
                        <th className="py-2 text-right font-medium">Comments</th>
                      </tr>
                    </thead>
                    <tbody>
                      {inc.authors.map((a) => (
                        <tr key={a.handle} className="border-border/60 border-b last:border-0">
                          <td className="py-2.5 pr-4">
                            <span className="inline-flex items-center gap-1.5 font-medium">
                              {a.name ?? "—"}
                              {a.verified && <BadgeCheck className="text-primary size-4" />}
                            </span>
                          </td>
                          <td className="py-2.5 pr-4 font-mono text-xs">{a.handle}</td>
                          <td className="py-2.5 pr-4 text-right tabular-nums">{fmt(a.followers)}</td>
                          <td className="py-2.5 pr-4 text-right tabular-nums">{fmt(a.following)}</td>
                          <td className="py-2.5 pr-4 text-right tabular-nums">{fmt(a.likes)}</td>
                          <td className="py-2.5 pr-4 text-right tabular-nums">{a.posts}</td>
                          <td className="py-2.5 text-right tabular-nums">{a.comments}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          ))}
        </div>
      )}
    </>
  );
}
