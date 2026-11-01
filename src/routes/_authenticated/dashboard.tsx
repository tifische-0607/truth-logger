import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Search } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { PageHeader, useWorkerStatus } from "@/components/AppShell";
import { NewCaptureSheet } from "@/components/NewCaptureSheet";
import { StatusBadge } from "@/components/StatusBadge";
import { SourceBadge } from "@/components/SourceBadge";
import { EvidenceThumb } from "@/components/EvidenceThumb";
import { Progress } from "@/components/ui/progress";
import { getCaptureProgress } from "@/lib/capture-progress";
import { platformLabel, useDarkNight } from "@/lib/darknight";
import { formatDateTime, timeAgo } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Home | Evidence Hub" },
      {
        name: "description",
        content: "What needs attention across captures, cases and evidence sources.",
      },
    ],
  }),
  validateSearch: (search: Record<string, unknown>): { url?: string } =>
    typeof search["url"] === "string" && search["url"].length > 0 ? { url: search["url"] } : {},
  component: Home,
});

type Attention = {
  key: string;
  tone: "fail" | "warn" | "home" | "info";
  tag: string;
  title: string;
  detail: string;
  action: {
    to: "/jobs/$jobId" | "/sources" | "/collect" | "/worker";
    label: string;
    params?: { jobId: string };
  };
};

const TONE: Record<Attention["tone"], string> = {
  fail: "bg-failed text-failed-foreground",
  warn: "bg-warn text-warn-foreground",
  home: "bg-home text-home-foreground",
  info: "bg-queued text-queued-foreground",
};

function Home() {
  const { url } = Route.useSearch();
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const worker = useWorkerStatus();
  const dn = useDarkNight();

  useEffect(() => {
    if (url) setOpen(true);
  }, [url]);

  useEffect(() => {
    const channel = supabase
      .channel(`home-jobs-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "capture_jobs" }, () => {
        void queryClient.invalidateQueries({ queryKey: ["home", "jobs"] });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const jobs = useQuery({
    queryKey: ["home", "jobs"],
    queryFn: async () => {
      const since = new Date(Date.now() - 864e5).toISOString();
      const { data, error } = await supabase
        .from("capture_jobs")
        .select("id, url, status, case_id, incident_id, created_at, finished_at, log, warnings")
        .or(`status.in.(queued,running),created_at.gte.${since}`)
        .order("created_at", { ascending: false })
        .limit(40);
      if (error) throw error;
      return data;
    },
    refetchInterval: 30_000,
  });

  const cases = useQuery({
    queryKey: ["home", "cases"],
    queryFn: async () => {
      const [{ data, error }, refs] = await Promise.all([
        supabase
          .from("cases")
          .select(
            "id, target_of_complaint, offence_alleged, jurisdiction_agency, status, opened_on, updated_at",
          )
          .neq("status", "closed")
          .order("updated_at", { ascending: false })
          .limit(8),
        supabase.from("evidence_refs").select("case_id"),
      ]);
      if (error) throw error;
      const withHome = new Set((refs.data ?? []).map((r) => r.case_id));
      return { rows: data ?? [], withHome, refCount: refs.data?.length ?? 0 };
    },
  });

  const recent = useQuery({
    queryKey: ["home", "recent"],
    queryFn: async () => {
      const [items, refs] = await Promise.all([
        supabase
          .from("items")
          .select(
            "id, item_code, item_type, author_handle, captured_at, accounts(platform), artefacts(id, kind, storage_path)",
          )
          .order("captured_at", { ascending: false })
          .limit(6),
        supabase
          .from("evidence_refs")
          .select("id, source_id, record_id, record_code, platform, item_type, linked_at")
          .order("linked_at", { ascending: false })
          .limit(2),
      ]);
      if (items.error) throw items.error;
      return { items: items.data ?? [], refs: refs.data ?? [] };
    },
  });

  const all = jobs.data ?? [];
  const running = all.filter((j) => j.status === "running");
  const queued = all.filter((j) => j.status === "queued");
  const failed = all.filter((j) => j.status === "failed");
  const refCount = cases.data?.refCount ?? 0;

  const attention: Attention[] = [
    ...failed.slice(0, 3).map((j): Attention => ({
      key: j.id,
      tone: "fail",
      tag: "Capture failed",
      title: j.warnings?.at(-1) ?? "The capture stopped before it finished",
      detail: `${j.url} · ${formatDateTime(j.finished_at ?? j.created_at)}`,
      action: { to: "/jobs/$jobId", params: { jobId: j.id }, label: "Open job" },
    })),
    ...(!worker.isLoading && !worker.online
      ? [
          {
            key: "worker",
            tone: "fail",
            tag: "Worker",
            title: "The Mac mini isn't checking in",
            detail: `Last seen ${timeAgo(worker.lastSeen)}. Captures wait until it is back.`,
            action: { to: "/worker", label: "Worker" },
          } satisfies Attention,
        ]
      : []),
    ...(refCount && dn.state !== "online"
      ? [
          {
            key: "darknight",
            tone: "home",
            tag: "Home vault",
            title:
              dn.state === "not_configured" ? "DarkNight is not connected" : "DarkNight is offline",
            detail: `${refCount} linked item${refCount === 1 ? "" : "s"} show their reference and hash only until it is.`,
            action: { to: "/sources", label: "View source" },
          } satisfies Attention,
        ]
      : []),
  ];

  const now = running[0];
  const progress = now ? getCaptureProgress(now.status, now.log) : null;

  return (
    <>
      <PageHeader
        title="Home"
        subtitle={new Date().toLocaleDateString(undefined, {
          weekday: "long",
          day: "numeric",
          month: "long",
          year: "numeric",
        })}
        actions={
          <Link
            to="/search"
            className="bg-card text-muted-foreground border-input hover:border-primary flex min-h-12 w-full max-w-md items-center gap-3 rounded-xl border px-4 text-sm sm:w-96"
          >
            <Search className="size-5 shrink-0" aria-hidden /> Search handles, text and item codes
          </Link>
        }
      />

      <section aria-label="At a glance" className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Glance
          to="/collect"
          label="Capturing"
          value={`${running.length}`}
          detail={`${queued.length} queued · ${failed.length} failed today`}
        />
        <Glance
          to="/cases"
          label="Open cases"
          value={`${cases.data?.rows.length ?? "—"}`}
          detail="Not closed"
        />
        <Glance
          to="/sources"
          label="Home vault"
          value={`${refCount}`}
          detail={`linked items · DarkNight ${dn.state === "online" ? "online" : dn.state === "not_configured" ? "not connected" : "offline"}`}
        />
        <Glance
          to="/verify"
          label="Integrity"
          value="Verify"
          detail="Re-hash a case before export"
        />
      </section>

      <div className="mt-6 grid items-start gap-6 xl:grid-cols-3">
        <section className="panel min-w-0 xl:col-span-2" aria-labelledby="attn-h">
          <div className="flex items-center justify-between border-b px-5 py-4">
            <h2 id="attn-h" className="font-semibold">
              Needs your attention
            </h2>
            <span className="text-muted-foreground text-xs">
              {attention.length} {attention.length === 1 ? "item" : "items"}
            </span>
          </div>
          {attention.length ? (
            <ul className="divide-border divide-y">
              {attention.map((a) => (
                <li key={a.key} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4">
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${TONE[a.tone]}`}
                  >
                    {a.tag}
                  </span>
                  <div className="min-w-0 flex-1 basis-64">
                    <div className="text-sm font-semibold">{a.title}</div>
                    <div className="text-muted-foreground truncate text-xs">{a.detail}</div>
                  </div>
                  <Link
                    to={a.action.to}
                    params={a.action.params as never}
                    className="border-input hover:bg-accent inline-flex min-h-11 items-center rounded-lg border px-4 text-sm font-medium"
                  >
                    {a.action.label}
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground px-5 py-8 text-sm">Nothing needs attention.</p>
          )}
        </section>

        <div className="min-w-0 space-y-6">
          <section className="panel space-y-3 p-5" aria-labelledby="live-h">
            <div className="flex items-center justify-between">
              <h2 id="live-h" className="font-semibold">
                Capturing now
              </h2>
              {now ? <StatusBadge status="running" /> : null}
            </div>
            {now && progress ? (
              <Link to="/jobs/$jobId" params={{ jobId: now.id }} className="block space-y-2">
                <div className="truncate font-mono text-sm font-semibold">{now.url}</div>
                <div className="text-muted-foreground flex justify-between text-xs">
                  <span className="truncate">{progress.stage}</span>
                  <span className="font-mono">
                    {progress.percent === null ? "…" : `${progress.percent}%`}
                  </span>
                </div>
                <Progress value={progress.percent ?? 8} />
              </Link>
            ) : (
              <p className="text-muted-foreground text-sm">Nothing is being captured right now.</p>
            )}
            <Link to="/collect" className="text-primary text-sm font-semibold hover:underline">
              Open Collect
            </Link>
          </section>

          <section className="panel space-y-3 p-5" aria-labelledby="src-h">
            <h2 id="src-h" className="font-semibold">
              Sources
            </h2>
            <div className="flex items-center gap-3 text-sm">
              <SourceBadge vault="cloud" />
              <span className="flex-1">Mac mini captures</span>
              <span
                className={
                  worker.online
                    ? "text-done-foreground font-semibold"
                    : "text-failed-foreground font-semibold"
                }
              >
                {worker.online ? "Online" : "Offline"}
              </span>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <SourceBadge vault="home" />
              <span className="flex-1">DarkNight</span>
              <span
                className={
                  dn.online
                    ? "text-done-foreground font-semibold"
                    : "text-muted-foreground font-semibold"
                }
              >
                {dn.online
                  ? "Online"
                  : dn.state === "not_configured"
                    ? "Not connected"
                    : dn.state === "degraded"
                      ? "Partly reachable"
                      : "Offline"}
              </span>
            </div>
          </section>
        </div>
      </div>

      <section className="mt-6 space-y-3" aria-labelledby="recent-h">
        <div className="flex items-center justify-between">
          <h2 id="recent-h" className="font-semibold">
            Recent evidence
          </h2>
          <Link to="/search" className="text-primary text-sm font-semibold hover:underline">
            Search all
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {(recent.data?.refs ?? []).map((ref) => (
            <Link
              key={ref.id}
              to="/vault/$sourceId/$recordId"
              params={{ sourceId: ref.source_id, recordId: ref.record_id }}
              className="panel block space-y-2 p-3"
            >
              <div className="bg-home/50 text-home-foreground flex aspect-[4/3] items-center justify-center rounded-lg px-3 text-center text-xs font-semibold">
                {dn.online
                  ? "Opens live from the home vault"
                  : "Reference only while the home vault is offline"}
              </div>
              <SourceBadge vault="home" />
              <div className="font-mono text-xs font-semibold">{ref.record_code}</div>
              <div className="text-muted-foreground text-xs">
                {ref.item_type ?? "Record"} · {platformLabel(ref.platform)} · linked{" "}
                {timeAgo(ref.linked_at)}
              </div>
            </Link>
          ))}
          {(recent.data?.items ?? []).map((item) => {
            const shot = item.artefacts?.find((a) => a.kind === "screenshot");
            return (
              <Link
                key={item.id}
                to="/items/$itemId"
                params={{ itemId: item.id }}
                className="panel block space-y-2 p-3"
              >
                <EvidenceThumb path={shot?.storage_path ?? null} />
                <SourceBadge vault="cloud" />
                <div className="font-mono text-xs font-semibold">{item.item_code}</div>
                <div className="text-muted-foreground text-xs">
                  {item.item_type} · {platformLabel(item.accounts?.platform)} ·{" "}
                  {timeAgo(item.captured_at)}
                </div>
              </Link>
            );
          })}
          {!recent.isLoading && !recent.data?.items.length && !recent.data?.refs.length ? (
            <p className="text-muted-foreground col-span-full text-sm">No evidence yet.</p>
          ) : null}
        </div>
      </section>

      <section className="panel mt-6" aria-labelledby="cases-h">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <h2 id="cases-h" className="font-semibold">
            Open cases
          </h2>
          <Link to="/cases" className="text-primary text-sm font-semibold hover:underline">
            All cases
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="text-muted-foreground text-left text-xs">
              <tr>
                <th className="px-5 py-3 font-semibold">Case</th>
                <th className="px-5 py-3 font-semibold">Target of complaint</th>
                <th className="px-5 py-3 font-semibold">Agency</th>
                <th className="px-5 py-3 font-semibold">Sources</th>
                <th className="px-5 py-3 font-semibold">Status</th>
                <th className="px-5 py-3 font-semibold">Updated</th>
              </tr>
            </thead>
            <tbody>
              {(cases.data?.rows ?? []).map((c) => (
                <tr key={c.id} className="border-border/60 border-t">
                  <td className="px-5 py-3 font-mono font-semibold">
                    <Link
                      to="/cases/$caseId"
                      params={{ caseId: c.id }}
                      className="text-primary hover:underline"
                    >
                      {c.id}
                    </Link>
                  </td>
                  <td className="px-5 py-3">{c.target_of_complaint ?? "—"}</td>
                  <td className="px-5 py-3">
                    {[c.jurisdiction_agency, c.offence_alleged].filter(Boolean).join(" · ") || "—"}
                  </td>
                  <td className="px-5 py-3">
                    <span className="flex flex-wrap gap-1.5">
                      <SourceBadge vault="cloud" label="Cloud" />
                      {cases.data?.withHome.has(c.id) ? (
                        <SourceBadge vault="home" label="Home" />
                      ) : null}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <StatusBadge status={c.status} />
                  </td>
                  <td className="text-muted-foreground px-5 py-3">{timeAgo(c.updated_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {cases.data && !cases.data.rows.length ? (
            <p className="text-muted-foreground px-5 py-6 text-sm">No open cases.</p>
          ) : null}
        </div>
      </section>

      <NewCaptureSheet open={open} onOpenChange={setOpen} initialUrl={url ?? ""} />
    </>
  );
}

function Glance({
  to,
  label,
  value,
  detail,
}: {
  to: "/collect" | "/cases" | "/sources" | "/verify";
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <Link to={to} className="panel hover:border-primary/50 block space-y-1 p-4 transition-colors">
      <div className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
        {label}
      </div>
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-muted-foreground text-xs">{detail}</div>
    </Link>
  );
}
