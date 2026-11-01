import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent } from "react";
import { House, Loader2, Search as SearchIcon } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/AppShell";
import { SourceBadge } from "@/components/SourceBadge";
import { LinkToCaseDialog } from "@/components/LinkToCaseDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  classificationLabel,
  platformLabel,
  searchDarkNight,
  useDarkNight,
  type DarkNightSummary,
} from "@/lib/darknight";
import { DARKNIGHT_SOURCE_ID } from "@/lib/sources";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

type Scope = "all" | "cloud" | "home";
type SearchParams = {
  q?: string | undefined;
  scope?: Scope | undefined;
  type?: string | undefined;
};

export const Route = createFileRoute("/_authenticated/search")({
  head: () => ({ meta: [{ title: "Search all evidence — Evidence Hub" }] }),
  validateSearch: (search: Record<string, unknown>): SearchParams => ({
    q: typeof search["q"] === "string" ? search["q"] : undefined,
    scope: search["scope"] === "cloud" || search["scope"] === "home" ? search["scope"] : undefined,
    type: typeof search["type"] === "string" && search["type"] ? search["type"] : undefined,
  }),
  component: SearchPage,
});

const ITEM_TYPES = [
  ["", "All types"],
  ["post", "Posts"],
  ["comment", "Comments"],
  ["reply", "Replies"],
  ["video", "Videos and reels"],
] as const;

/** PostgREST `or` filters are comma separated; strip characters that would break them. */
function cleanTerm(q: string) {
  return q.replace(/[,()*%\\]/g, " ").trim();
}

function SearchPage() {
  const { q = "", scope = "all", type } = Route.useSearch();
  const navigate = useNavigate({ from: "/search" });
  const [draft, setDraft] = useState(q);
  const dn = useDarkNight();
  useEffect(() => setDraft(q), [q]);

  const term = cleanTerm(q);

  const cloud = useQuery({
    queryKey: ["search-cloud", term, type],
    enabled: term.length >= 2 && scope !== "home",
    queryFn: async () => {
      // Cloud captures are posts, comments and replies; reels are captured as posts.
      if (type === "video") return [];
      const pattern = `%${term}%`;
      let query = supabase
        .from("items")
        .select(
          "id, item_code, item_type, author_handle, author_name, published_at, text_original, text_en, accounts(platform, handle, incidents(case_id, incident_id))",
        )
        .or(
          `text_original.ilike.${pattern},text_en.ilike.${pattern},author_handle.ilike.${pattern},item_code.ilike.${pattern}`,
        )
        .order("published_at", { ascending: false, nullsFirst: false })
        .limit(50);
      if (type) query = query.eq("item_type", type);
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });

  const refs = useQuery({
    queryKey: ["search-refs", term],
    enabled: term.length >= 2 && scope !== "cloud",
    queryFn: async () => {
      const pattern = `%${term}%`;
      const { data, error } = await supabase
        .from("evidence_refs")
        .select(
          "id, case_id, source_id, record_id, record_code, platform, item_type, published_at, note",
        )
        .or(`record_code.ilike.${pattern},note.ilike.${pattern}`)
        .order("published_at", { ascending: false, nullsFirst: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
  });

  const home = useQuery({
    queryKey: ["search-home", dn.base, term, type],
    enabled: term.length >= 2 && scope !== "cloud" && dn.online && !!dn.base,
    queryFn: async () =>
      searchDarkNight(dn.base!, { q: term, item_type: type || undefined, limit: 50 }),
  });

  const [linking, setLinking] = useState<DarkNightSummary | null>(null);

  function submit(e: FormEvent) {
    e.preventDefault();
    void navigate({ search: (prev) => ({ ...prev, q: draft.trim() || undefined }) });
  }

  const homeLinked = new Set((refs.data ?? []).map((r) => r.record_id));
  const homeResults = (home.data?.results ?? []).filter((r) => !homeLinked.has(r.record_id));
  const total =
    (scope !== "home" ? (cloud.data?.length ?? 0) : 0) +
    (scope !== "cloud" ? (refs.data?.length ?? 0) + homeResults.length : 0);
  const loading = cloud.isFetching || refs.isFetching || home.isFetching;

  return (
    <>
      <PageHeader
        title="Search all evidence"
        subtitle="Original text, English translations, handles and item codes, across every source."
      />

      <form role="search" onSubmit={submit} className="flex flex-wrap gap-3">
        <label htmlFor="q" className="sr-only">
          Search
        </label>
        <div className="border-primary bg-card flex min-h-13 min-w-0 flex-1 basis-80 items-center gap-3 rounded-xl border-2 px-4">
          <SearchIcon className="text-primary size-5 shrink-0" aria-hidden />
          <Input
            id="q"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="A phrase, @handle or item code"
            className="h-12 border-0 bg-transparent px-0 text-base shadow-none focus-visible:ring-0"
            autoFocus
          />
        </div>
        <Button type="submit" className="h-13 px-6 text-base">
          Search
        </Button>
      </form>

      <div
        className="mt-4 flex flex-wrap items-center gap-2"
        role="group"
        aria-label="Sources to search"
      >
        {(
          [
            ["all", "All sources"],
            ["cloud", "Cloud vault"],
            ["home", "Home vault"],
          ] as const
        ).map(([value, label]) => (
          <Link
            key={value}
            to="/search"
            search={(prev) => ({ ...prev, scope: value === "all" ? undefined : value })}
            aria-pressed={scope === value}
            className={cn(
              "inline-flex min-h-10 items-center rounded-full border px-4 text-sm font-medium",
              scope === value
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-card hover:bg-accent",
            )}
          >
            {label}
          </Link>
        ))}
        <label htmlFor="type" className="sr-only">
          Item type
        </label>
        <select
          id="type"
          value={type ?? ""}
          onChange={(e) =>
            void navigate({ search: (prev) => ({ ...prev, type: e.target.value || undefined }) })
          }
          className="border-input bg-card min-h-10 rounded-full border px-4 text-sm"
        >
          {ITEM_TYPES.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {scope !== "cloud" && !dn.online ? (
        <div
          role="status"
          className="bg-home/50 border-home-foreground/30 mt-5 flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3 text-sm"
        >
          <House className="text-home-foreground size-5 shrink-0" aria-hidden />
          <p className="min-w-0 flex-1">
            <strong>
              {dn.state === "not_configured" ? "DarkNight isn't connected" : "DarkNight is offline"}
              , so the home vault isn't searched.
            </strong>{" "}
            Items already linked to a case still appear, matched on their reference.
          </p>
          <Link to="/sources" className="font-semibold underline-offset-2 hover:underline">
            Sources
          </Link>
        </div>
      ) : null}

      <section aria-label="Results" className="mt-6 space-y-3">
        {term.length < 2 ? (
          <p className="text-muted-foreground text-sm">Type at least two characters.</p>
        ) : (
          <p className="text-sm">
            {loading ? (
              <span className="text-muted-foreground inline-flex items-center gap-2">
                <Loader2 className="size-4 animate-spin" /> Searching…
              </span>
            ) : (
              <>
                <strong>{total} results</strong>{" "}
                <span className="text-muted-foreground">for “{q}”</span>
              </>
            )}
          </p>
        )}

        {cloud.error || refs.error || home.error ? (
          <p className="text-failed-foreground text-sm">
            {[cloud.error, refs.error, home.error]
              .filter(Boolean)
              .map((e) => (e instanceof Error ? e.message : String(e)))
              .join(" · ")}
          </p>
        ) : null}

        {scope !== "home"
          ? (cloud.data ?? []).map((item) => {
              const incident = item.accounts?.incidents;
              return (
                <article key={item.id} className="panel space-y-2 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <SourceBadge vault="cloud" />
                    <Link
                      to="/items/$itemId"
                      params={{ itemId: item.id }}
                      className="font-mono text-sm font-semibold hover:underline"
                    >
                      {item.item_code}
                    </Link>
                    <span className="text-muted-foreground text-xs">
                      {item.item_type} · {platformLabel(item.accounts?.platform)} · @
                      {item.author_handle ?? item.accounts?.handle ?? "—"} ·{" "}
                      {formatDateTime(item.published_at)}
                    </span>
                  </div>
                  {item.text_original ? (
                    <p className="line-clamp-3 text-sm">{item.text_original}</p>
                  ) : null}
                  {item.text_en ? (
                    <p className="text-muted-foreground line-clamp-2 text-sm">EN: {item.text_en}</p>
                  ) : null}
                  {incident ? (
                    <p className="text-xs">
                      In{" "}
                      <Link
                        to="/cases/$caseId"
                        params={{ caseId: incident.case_id }}
                        className="font-mono font-semibold hover:underline"
                      >
                        CASE-{incident.case_id}
                      </Link>{" "}
                      · INC-{incident.incident_id}
                    </p>
                  ) : null}
                </article>
              );
            })
          : null}

        {scope !== "cloud"
          ? (refs.data ?? []).map((ref) => (
              <article key={ref.id} className="panel space-y-2 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <SourceBadge vault="home" state={dn.online ? undefined : dn.state} />
                  <Link
                    to="/vault/$sourceId/$recordId"
                    params={{ sourceId: ref.source_id, recordId: ref.record_id }}
                    className="font-mono text-sm font-semibold hover:underline"
                  >
                    {ref.record_code}
                  </Link>
                  <span className="text-muted-foreground text-xs">
                    {ref.item_type ?? "record"} · {platformLabel(ref.platform)} ·{" "}
                    {formatDateTime(ref.published_at)}
                  </span>
                </div>
                {ref.note ? <p className="text-sm">Case note: {ref.note}</p> : null}
                <p className="text-xs">
                  In{" "}
                  <Link
                    to="/cases/$caseId"
                    params={{ caseId: ref.case_id }}
                    className="font-mono font-semibold hover:underline"
                  >
                    CASE-{ref.case_id}
                  </Link>
                </p>
              </article>
            ))
          : null}

        {scope !== "cloud"
          ? homeResults.map((r) => (
              <article key={r.record_id} className="panel space-y-2 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <SourceBadge vault="home" />
                  <Link
                    to="/vault/$sourceId/$recordId"
                    params={{ sourceId: DARKNIGHT_SOURCE_ID, recordId: r.record_id }}
                    className="font-mono text-sm font-semibold hover:underline"
                  >
                    {r.record_code}
                  </Link>
                  <span className="text-muted-foreground text-xs">
                    {r.item_type ?? "record"} · {platformLabel(r.platform)} · @
                    {r.author_handle ?? "—"} · {formatDateTime(r.published_at)}
                  </span>
                  {classificationLabel(r.classification) ? (
                    <span className="bg-secondary text-secondary-foreground rounded-full px-2.5 py-0.5 text-xs font-medium">
                      {classificationLabel(r.classification)}
                    </span>
                  ) : null}
                </div>
                {r.snippet ? <p className="line-clamp-3 text-sm">{r.snippet}</p> : null}
                <div className="flex flex-wrap items-center gap-3">
                  <span className="bg-warn text-warn-foreground rounded-full px-2.5 py-0.5 text-xs font-semibold">
                    Not in a case
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="min-h-10"
                    onClick={() => setLinking(r)}
                  >
                    Add to case
                  </Button>
                </div>
              </article>
            ))
          : null}
      </section>

      <LinkToCaseDialog
        open={!!linking}
        onOpenChange={(open) => !open && setLinking(null)}
        sourceId={DARKNIGHT_SOURCE_ID}
        recordId={linking?.record_id ?? null}
      />
    </>
  );
}
