import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/AppShell";
import { StatusBadge } from "@/components/StatusBadge";
import { formatDateTime } from "@/lib/format";
import { listCachedCases, offlineFirst } from "@/lib/offline";

export const Route = createFileRoute("/_authenticated/cases/")({
  component: CasesList,
});

type CaseRow = {
  id: string;
  status: string;
  opened_on: string;
  target_of_complaint: string | null;
  offence_alleged: string | null;
  jurisdiction_agency: string | null;
  incidents?: { id: string }[] | null;
};

function CasesList() {
  const cases = useQuery({
    queryKey: ["cases", "all"],
    queryFn: async (): Promise<CaseRow[]> =>
      offlineFirst<CaseRow[]>(
        async () => {
          const { data, error } = await supabase
            .from("cases")
            .select("*, incidents(id)")
            .order("opened_on", { ascending: false });
          if (error) throw error;
          return (data ?? []) as unknown as CaseRow[];
        },
        async () => {
          const cached = await listCachedCases();
          if (!cached.length) return null;
          return cached.map((c) => ({
            ...(c.case as unknown as CaseRow),
            incidents: c.incidents.map((i) => ({ id: String(i["id"] ?? "") })),
          }));
        },
      ),
  });


  return (
    <>
      <PageHeader title="Cases" subtitle="Every matter under investigation." />
      <div className="panel divide-border divide-y">
        {cases.data?.length ? (
          cases.data.map((c) => (
            <Link
              key={c.id}
              to="/cases/$caseId"
              params={{ caseId: c.id }}
              className="hover:bg-muted flex min-h-20 flex-wrap items-center justify-between gap-3 px-5 py-4 transition-colors"
            >
              <div className="min-w-0">
                <div className="font-mono text-sm font-bold">CASE-{c.id}</div>
                <div className="truncate text-sm">{c.target_of_complaint ?? "No target"}</div>
                <div className="text-muted-foreground text-xs">
                  {c.offence_alleged ?? "—"} · {c.jurisdiction_agency ?? "—"} · opened{" "}
                  {formatDateTime(c.opened_on)} · {c.incidents?.length ?? 0} incidents
                </div>
              </div>
              <StatusBadge status={c.status} />
            </Link>
          ))
        ) : (
          <p className="text-muted-foreground px-5 py-10 text-sm">
            No cases yet. Create one when you queue your first capture.
          </p>
        )}
      </div>
    </>
  );
}
