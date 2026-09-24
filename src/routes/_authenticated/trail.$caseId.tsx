import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Camera, Loader2, MessageSquare, Video } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/AppShell";
import { CaptureViewer } from "@/components/CaptureViewer";
import { formatDateTime } from "@/lib/format";

function formatDay(day: string) {
  return new Date(`${day}T00:00:00`).toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}
import { getCachedCase, offlineFirst } from "@/lib/offline";

export const Route = createFileRoute("/_authenticated/trail/$caseId")({
  component: CaseTrailPage,
});

type TrailItem = {
  id: string;
  item_code: string;
  item_type: string;
  author_name: string | null;
  author_handle: string | null;
  url: string | null;
  captured_at: string;
  text_original: string | null;
  incident_id: string;
  handle: string;
};

async function fetchTrail(caseId: string): Promise<TrailItem[]> {
  const { data, error } = await supabase
    .from("incidents")
    .select(
      "incident_id, accounts(handle, items(id, item_code, item_type, author_name, author_handle, url, captured_at, text_original))",
    )
    .eq("case_id", caseId)
    .order("incident_id");
  if (error) throw error;

  const items: TrailItem[] = [];
  for (const inc of data ?? []) {
    for (const acc of inc.accounts ?? []) {
      for (const item of acc.items ?? []) {
        items.push({
          ...item,
          incident_id: inc.incident_id,
          handle: acc.handle,
        });
      }
    }
  }
  items.sort((a, b) => a.captured_at.localeCompare(b.captured_at));
  return items;
}

function groupByDate(items: TrailItem[]) {
  const groups = new Map<string, TrailItem[]>();
  for (const item of items) {
    const day = item.captured_at.slice(0, 10);
    const list = groups.get(day) ?? [];
    list.push(item);
    groups.set(day, list);
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
}

function CaseTrailPage() {
  const { caseId } = Route.useParams();

  const caseQuery = useQuery({
    queryKey: ["case", caseId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cases")
        .select("*")
        .eq("id", caseId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const trail = useQuery({
    queryKey: ["case-trail", caseId],
    queryFn: async () =>
      offlineFirst<TrailItem[]>(
        () => fetchTrail(caseId),
        async () => {
          const cached = await getCachedCase(caseId);
          if (!cached) return [];
          const items: TrailItem[] = [];
          for (const inc of (cached.incidents ?? []) as {
            incident_id: string;
            accounts?: { handle: string; items?: Omit<TrailItem, "incident_id" | "handle">[] }[];
          }[]) {
            for (const acc of inc.accounts ?? []) {
              for (const item of acc.items ?? []) {
                items.push({ ...item, incident_id: inc.incident_id, handle: acc.handle });
              }
            }
          }
          items.sort((a, b) => a.captured_at.localeCompare(b.captured_at));
          return items;
        },
      ),
  });

  if (caseQuery.isLoading) return <p className="text-muted-foreground">Loading case…</p>;
  if (!caseQuery.data) return <p className="text-muted-foreground">Case not found.</p>;

  const days = groupByDate(trail.data ?? []);
  const total = trail.data?.length ?? 0;

  return (
    <>
      <PageHeader
        title={`Evidence trail — CASE-${caseId}`}
        subtitle={
          trail.isLoading
            ? "Loading captures…"
            : `${total} capture${total === 1 ? "" : "s"} · ${days.length} day${days.length === 1 ? "" : "s"}`
        }
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

      {trail.isLoading ? (
        <p className="text-muted-foreground flex items-center gap-2">
          <Loader2 className="size-4 animate-spin" /> Loading captures…
        </p>
      ) : days.length === 0 ? (
        <section className="panel text-muted-foreground p-6 text-sm">
          No captured evidence in this case yet. Send a capture to the Mac mini and it will
          appear here.
        </section>
      ) : (
        <div className="space-y-8">
          {days.map(([day, items]) => (
            <section key={day} className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="bg-primary h-2.5 w-2.5 shrink-0 rounded-full" />
                <h2 className="text-lg font-semibold">{formatDay(day)}</h2>
                <div className="bg-border h-px flex-1" />
              </div>
              <div className="space-y-5">
                {items.map((item) => (
                  <article key={item.id} className="panel overflow-hidden">
                    <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b px-5 py-4">
                      <span className="flex items-center gap-2 font-semibold">
                        {item.item_type === "POST" ? (
                          <Camera className="text-muted-foreground size-4" />
                        ) : item.item_type === "COMMENT" ? (
                          <MessageSquare className="text-muted-foreground size-4" />
                        ) : (
                          <Video className="text-muted-foreground size-4" />
                        )}
                        <span className="hash">{item.item_code}</span>
                      </span>
                      <span className="text-muted-foreground text-sm">
                        INC-{item.incident_id} · @{item.handle}
                      </span>
                      <span className="text-muted-foreground text-sm">
                        {formatDateTime(item.captured_at)}
                      </span>
                      <Link
                        to="/items/$itemId"
                        params={{ itemId: item.id }}
                        className="text-primary ml-auto text-sm font-medium hover:underline"
                      >
                        Open evidence
                      </Link>
                    </header>
                    {item.text_original ? (
                      <p className="text-muted-foreground line-clamp-3 border-b px-5 py-3 text-sm whitespace-pre-wrap">
                        {item.text_original}
                      </p>
                    ) : null}
                    <div className="p-5">
                      <CaptureViewer itemId={item.id} />
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
