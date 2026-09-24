import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, BadgeCheck, Loader2, UserRound } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/AppShell";
import { EvidenceThumb } from "@/components/EvidenceThumb";
import { formatDateTime } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/profiles/$caseId")({
  head: () => ({ meta: [{ title: "Profile trail — SpyGlass V2" }] }),
  component: ProfileTrailPage,
});

type Stated = {
  display_name?: string;
  handle?: string;
  profile_url?: string;
  verified?: boolean;
  followers?: number;
  following?: number;
  likes?: number;
  bio_verbatim?: string;
};

type ProfileCapture = {
  itemId: string;
  itemCode: string;
  incidentId: string;
  capturedAt: string;
  screenshotPath: string | null;
  sha256: string | null;
  stated: Stated;
};

type Author = { handle: string; name: string | null; captures: ProfileCapture[] };

async function fetchProfiles(caseId: string): Promise<Author[]> {
  const { data, error } = await supabase
    .from("incidents")
    .select(
      "incident_id, accounts(handle, display_name, items(id, item_code, item_type, captured_at, artefacts(kind, storage_path, sha256), subject_profiles(subject_type, stated)))",
    )
    .eq("case_id", caseId);
  if (error) throw error;

  const byHandle = new Map<string, Author>();
  for (const inc of data ?? []) {
    for (const acc of inc.accounts ?? []) {
      for (const item of acc.items ?? []) {
        if (item.item_type !== "post") continue;
        const shot = (item.artefacts ?? []).find((a) => a.kind === "profile_screenshot");
        const poster = (item.subject_profiles ?? []).find((s) => s.subject_type === "poster");
        const stated = (poster?.stated ?? {}) as Stated;
        const hasCounts = stated.followers != null || stated.following != null || stated.likes != null;
        if (!shot && !hasCounts) continue;
        const author = byHandle.get(acc.handle) ?? {
          handle: acc.handle,
          name: acc.display_name,
          captures: [],
        };
        author.captures.push({
          itemId: item.id,
          itemCode: item.item_code,
          incidentId: inc.incident_id,
          capturedAt: item.captured_at,
          screenshotPath: shot?.storage_path ?? null,
          sha256: shot?.sha256 ?? null,
          stated,
        });
        byHandle.set(acc.handle, author);
      }
    }
  }
  const authors = [...byHandle.values()];
  for (const a of authors) a.captures.sort((x, y) => x.capturedAt.localeCompare(y.capturedAt));
  authors.sort((a, b) => a.captures[0].capturedAt.localeCompare(b.captures[0].capturedAt));
  return authors;
}

function fmt(n?: number) {
  return n == null ? "—" : n.toLocaleString();
}

function Delta({ now, prev }: { now?: number; prev?: number }) {
  if (now == null || prev == null || now === prev) return null;
  const d = now - prev;
  return (
    <span className={d > 0 ? "text-success ml-1 text-xs" : "text-destructive ml-1 text-xs"}>
      {d > 0 ? "+" : ""}
      {d.toLocaleString()}
    </span>
  );
}

function ProfileTrailPage() {
  const { caseId } = Route.useParams();
  const q = useQuery({ queryKey: ["profile-trail", caseId], queryFn: () => fetchProfiles(caseId) });
  const authors = q.data ?? [];

  return (
    <>
      <PageHeader
        title={`Profile trail — CASE-${caseId}`}
        subtitle={
          q.isLoading
            ? "Loading profiles…"
            : `${authors.length} author${authors.length === 1 ? "" : "s"} · profile captures in time order`
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

      {q.isLoading ? (
        <p className="text-muted-foreground flex items-center gap-2">
          <Loader2 className="size-4 animate-spin" /> Loading profiles…
        </p>
      ) : q.isError ? (
        <section className="panel text-destructive p-6 text-sm">Couldn't load profiles.</section>
      ) : authors.length === 0 ? (
        <section className="panel text-muted-foreground p-6 text-sm">
          No author profiles captured in this case yet. Profiles are saved automatically on new
          captures from the updated Mac mini worker.
        </section>
      ) : (
        <div className="space-y-8">
          {authors.map((author) => (
            <section key={author.handle} className="space-y-3">
              <div className="flex items-center gap-3">
                <UserRound className="text-primary size-5" />
                <h2 className="text-lg font-semibold">{author.name ?? "Name not stated"}</h2>
                <span className="hash text-muted-foreground text-sm">@{author.handle}</span>
                <div className="bg-border h-px flex-1" />
              </div>
              <div className="flex snap-x gap-4 overflow-x-auto pb-2">
                {author.captures.map((c, i) => {
                  const prev = author.captures[i - 1]?.stated;
                  return (
                    <article key={c.itemId} className="panel w-72 shrink-0 snap-start overflow-hidden">
                      <div className="p-3">
                        <EvidenceThumb path={c.screenshotPath} />
                      </div>
                      <div className="space-y-2 px-4 pb-4 text-sm">
                        <div className="flex items-center gap-1 font-medium">
                          {c.stated.display_name ?? author.name ?? "—"}
                          {c.stated.verified ? <BadgeCheck className="text-primary size-4" /> : null}
                        </div>
                        <p className="text-muted-foreground text-xs">
                          {formatDateTime(c.capturedAt)} · INC-{c.incidentId}
                        </p>
                        <dl className="grid grid-cols-3 gap-2 text-center">
                          {(
                            [
                              ["Followers", "followers"],
                              ["Following", "following"],
                              ["Likes", "likes"],
                            ] as const
                          ).map(([label, key]) => (
                            <div key={key} className="bg-muted rounded-md py-2">
                              <dt className="text-muted-foreground text-[11px] uppercase">{label}</dt>
                              <dd className="font-semibold">
                                {fmt(c.stated[key])}
                                <Delta now={c.stated[key]} prev={prev?.[key]} />
                              </dd>
                            </div>
                          ))}
                        </dl>
                        {c.stated.bio_verbatim ? (
                          <p className="text-muted-foreground line-clamp-3 text-xs">
                            “{c.stated.bio_verbatim}”
                          </p>
                        ) : null}
                        {c.sha256 ? (
                          <p className="hash text-muted-foreground truncate text-[11px]" title={c.sha256}>
                            SHA-256 {c.sha256}
                          </p>
                        ) : null}
                        <Link
                          to="/items/$itemId"
                          params={{ itemId: c.itemId }}
                          className="text-primary text-sm font-medium hover:underline"
                        >
                          {c.itemCode}
                        </Link>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
