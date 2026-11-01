import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { supabase } from "@/integrations/supabase/client";
import { useWorkerStatus } from "@/components/AppShell";
import { StatusBadge } from "@/components/StatusBadge";
import { EvidenceThumb } from "@/components/EvidenceThumb";
import { Progress } from "@/components/ui/progress";
import { getCaptureProgress, visibleWorkerLogs } from "@/lib/capture-progress";
import { formatDateTime, timeAgo } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/collect")({
  head: () => ({ meta: [{ title: "Collect — Evidence Hub" }] }),
  component: CollectNow,
});

function CollectNow() {
  const queryClient = useQueryClient();
  const worker = useWorkerStatus();

  useEffect(() => {
    const channel = supabase
      .channel(`collect-feed-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "capture_jobs" }, () => {
        void queryClient.invalidateQueries({ queryKey: ["collect"] });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const jobs = useQuery({
    queryKey: ["collect", "jobs"],
    queryFn: async () => {
      const since = new Date(Date.now() - 7 * 864e5).toISOString();
      const { data, error } = await supabase
        .from("capture_jobs")
        .select(
          "id, url, status, case_id, incident_id, handler, created_at, claimed_at, finished_at, log, warnings, options",
        )
        .or(`status.in.(queued,running),created_at.gte.${since}`)
        .order("created_at", { ascending: false })
        .limit(60);
      if (error) throw error;
      return data;
    },
    refetchInterval: 15_000,
  });

  const finished = useQuery({
    queryKey: ["collect", "finished"],
    queryFn: async () => {
      const since = new Date();
      since.setHours(0, 0, 0, 0);
      const { data, error } = await supabase
        .from("items")
        .select("id, item_code, captured_at, artefacts(id, kind, storage_path)")
        .eq("item_type", "post")
        .gte("captured_at", since.toISOString())
        .order("captured_at", { ascending: false })
        .limit(12);
      if (error) throw error;
      return data;
    },
  });

  const all = jobs.data ?? [];
  const running = all.filter((j) => j.status === "running");
  const queued = all.filter((j) => j.status === "queued").reverse();
  const failed = all.filter((j) => j.status === "failed").slice(0, 5);
  const hostname = (worker.data as { hostname?: string } | null)?.hostname;

  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-3">
        <section className="panel min-w-0 space-y-4 p-5 xl:col-span-2" aria-labelledby="now-h">
          <div className="flex items-center justify-between gap-3">
            <h2 id="now-h" className="font-semibold">
              Capturing now
            </h2>
            {running.length ? <StatusBadge status="running" /> : null}
          </div>
          {running.length ? (
            running.map((job) => {
              const progress = getCaptureProgress(job.status, job.log);
              const lines = visibleWorkerLogs(job.log).slice(-3);
              return (
                <Link
                  key={job.id}
                  to="/jobs/$jobId"
                  params={{ jobId: job.id }}
                  className="hover:bg-muted -mx-2 block space-y-3 rounded-lg p-2"
                >
                  <div className="min-w-0">
                    <div className="truncate font-mono text-sm font-semibold">{job.url}</div>
                    <div className="text-muted-foreground text-xs">
                      CASE-{job.case_id} · INC-{job.incident_id} · {job.handler ?? "—"} · started{" "}
                      {timeAgo(job.claimed_at ?? job.created_at)}
                    </div>
                  </div>
                  <div aria-label={`Capture progress: ${progress.stage}`}>
                    <div className="text-muted-foreground mb-1.5 flex justify-between gap-3 text-xs">
                      <span className="truncate">{progress.stage}</span>
                      <span className="font-mono tabular-nums">
                        {progress.percent === null ? "…" : `${progress.percent}%`}
                      </span>
                    </div>
                    <Progress
                      value={progress.percent ?? 8}
                      className={progress.percent === null ? "animate-pulse" : undefined}
                    />
                  </div>
                  {lines.length ? (
                    <pre className="bg-sidebar text-sidebar-foreground overflow-x-auto rounded-lg p-3 font-mono text-xs leading-relaxed">
                      {lines.join("\n")}
                    </pre>
                  ) : null}
                </Link>
              );
            })
          ) : (
            <p className="text-muted-foreground text-sm">Nothing is being captured right now.</p>
          )}
        </section>

        <section className="panel min-w-0 space-y-3 p-5" aria-labelledby="worker-h">
          <div className="flex items-center gap-2.5">
            <span
              aria-hidden
              className={`size-2.5 rounded-full ${worker.online ? "bg-done-foreground animate-pulse" : "bg-failed-foreground"}`}
            />
            <h2 id="worker-h" className="font-semibold">
              Capture worker {worker.online ? "online" : "offline"}
            </h2>
          </div>
          <dl className="grid grid-cols-[minmax(0,7rem)_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-sm">
            <dt className="text-muted-foreground">Machine</dt>
            <dd>Mac mini{hostname ? ` · ${hostname}` : ""}</dd>
            <dt className="text-muted-foreground">Last check-in</dt>
            <dd>{timeAgo(worker.lastSeen)}</dd>
          </dl>
          <Link
            to="/worker"
            className="border-input hover:bg-accent inline-flex min-h-11 items-center rounded-lg border px-4 text-sm font-medium"
          >
            Worker and diagnostics
          </Link>
        </section>
      </div>

      <section className="panel" aria-labelledby="next-h">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <h2 id="next-h" className="font-semibold">
            Up next and needs action
          </h2>
          <Link to="/queue" className="text-primary text-sm font-semibold hover:underline">
            All jobs
          </Link>
        </div>
        {failed.length || queued.length ? (
          <ul className="divide-border divide-y">
            {[...failed, ...queued].map((job) => (
              <li key={job.id}>
                <Link
                  to="/jobs/$jobId"
                  params={{ jobId: job.id }}
                  className="hover:bg-muted flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5"
                >
                  <StatusBadge status={job.status} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-mono text-sm">{job.url}</div>
                    <div className="text-muted-foreground text-xs">
                      CASE-{job.case_id} · INC-{job.incident_id} ·{" "}
                      {job.status === "failed"
                        ? `stopped ${formatDateTime(job.finished_at ?? job.created_at)}${job.warnings?.length ? ` · ${job.warnings.at(-1)}` : ""}`
                        : `queued ${timeAgo(job.created_at)}`}
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground px-5 py-6 text-sm">
            Nothing queued and no recent failures.
          </p>
        )}
      </section>

      <section aria-labelledby="done-h" className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 id="done-h" className="font-semibold">
            Finished today
          </h2>
          <Link to="/results" className="text-primary text-sm font-semibold hover:underline">
            All results
          </Link>
        </div>
        {finished.data?.length ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-6">
            {finished.data.map((item) => {
              const shot = item.artefacts?.find((a) => a.kind === "screenshot");
              return (
                <Link
                  key={item.id}
                  to="/items/$itemId"
                  params={{ itemId: item.id }}
                  className="block"
                >
                  <EvidenceThumb path={shot?.storage_path ?? null} />
                  <div className="mt-2 font-mono text-xs font-semibold">{item.item_code}</div>
                  <div className="text-muted-foreground text-xs">
                    {item.artefacts?.length ?? 0} files · {timeAgo(item.captured_at)}
                  </div>
                </Link>
              );
            })}
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">No captures finished today.</p>
        )}
      </section>
    </div>
  );
}
