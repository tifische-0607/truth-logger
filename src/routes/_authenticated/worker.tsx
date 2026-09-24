import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Activity, Clock3, Loader2, RefreshCw, Radio, Terminal, TriangleAlert, UploadCloud } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { PageHeader, useWorkerStatus } from "@/components/AppShell";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { getCaptureProgress, visibleWorkerLogs } from "@/lib/capture-progress";
import { formatDateTime, timeAgo } from "@/lib/format";
import { flushOutbox, pendingOutboxCount, useOnline } from "@/lib/offline";

export const Route = createFileRoute("/_authenticated/worker")({
  head: () => ({
    meta: [
      { title: "Worker dashboard — SpyGlass V2" },
      {
        name: "description",
        content:
          "Track the Mac mini capture worker: incoming capture requests, job status, run times and queued syncs.",
      },
      { property: "og:title", content: "Worker dashboard — SpyGlass V2" },
      {
        property: "og:description",
        content: "Live view of capture requests handled by the Mac mini worker.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: WorkerDashboard,
});

const STATUSES = ["queued", "running", "done", "failed"] as const;

function duration(from: string | null, to: string | null) {
  if (!from || !to) return null;
  const ms = new Date(to).getTime() - new Date(from).getTime();
  if (ms < 0) return null;
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}

function formatUptime(bootIso: string, nowMs: number) {
  const s = Math.max(0, Math.floor((nowMs - new Date(bootIso).getTime()) / 1000));
  const days = Math.floor(s / 86400);
  const hours = Math.floor((s % 86400) / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = s % 60;
  if (days > 0) return `${days}d ${hours}h ${mins}m`;
  if (hours > 0) return `${hours}h ${mins}m ${secs}s`;
  return `${mins}m ${secs}s`;
}

function WorkerDashboard() {
  const qc = useQueryClient();
  const worker = useWorkerStatus();
  const online = useOnline();
  const [pending, setPending] = useState(0);
  const [sending, setSending] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [feed, setFeed] = useState<{ at: string; text: string }[]>([]);
  const [live, setLive] = useState(false);
  const [newUrl, setNewUrl] = useState("");
  const [queueing, setQueueing] = useState(false);

  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const info = (worker.data?.info ?? {}) as Record<string, unknown>;
  const bootTime = typeof info["boot_time"] === "string" ? info["boot_time"] : null;

  useEffect(() => {
    void pendingOutboxCount().then(setPending);
  }, []);

  useEffect(() => {
    const push = (text: string) =>
      setFeed((f) => [{ at: new Date().toISOString(), text }, ...f].slice(0, 40));

    const channel = supabase
      .channel(`worker-dash-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "capture_jobs" },
        (payload) => {
          void qc.invalidateQueries({ queryKey: ["worker-jobs"] });
          const row = (payload.new ?? {}) as Record<string, unknown>;
          const url = typeof row["url"] === "string" ? row["url"] : "";
          const status = typeof row["status"] === "string" ? row["status"] : "";
          if (payload.eventType === "INSERT") push(`Capture requested · ${url}`);
          else if (status === "running") push(`Mac mini started · ${url}`);
          else if (status === "done") push(`Capture finished · ${url}`);
          else if (status === "failed") push(`Capture failed · ${url}`);
        },
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "worker_status" }, () => {
        void qc.invalidateQueries({ queryKey: ["worker-status"] });
        push("Mac mini checked in");
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "artefacts" }, (p) => {
        const row = (p.new ?? {}) as Record<string, unknown>;
        push(`File received · ${String(row["filename"] ?? "artefact")}`);
      })
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "custody_events" },
        (p) => {
          const row = (p.new ?? {}) as Record<string, unknown>;
          push(`Custody record · ${String(row["action"] ?? "")} ${String(row["filename"] ?? "")}`);
        },
      )
      .subscribe((status) => setLive(status === "SUBSCRIBED"));
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [qc]);

  const queueCapture = async () => {
    const value = newUrl.trim();
    if (!value) {
      toast.error("Paste a Facebook link first.");
      return;
    }
    setQueueing(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const handler =
        typeof window !== "undefined" ? localStorage.getItem("fbem.handler") : null;
      const { error } = await supabase.from("capture_jobs").insert({
        url: value,
        handler: handler || null,
        created_by: userData.user?.id ?? null,
      });
      if (error) throw error;
      setNewUrl("");
      await qc.invalidateQueries({ queryKey: ["worker-jobs"] });
      toast.success(
        worker.online
          ? "Sent — the Mac mini will start it within a minute."
          : "Saved — it will run as soon as the Mac mini is online.",
      );
    } catch {
      toast.error("Could not send this capture. Try again.");
    } finally {
      setQueueing(false);
    }
  };

  const jobs = useQuery({
    queryKey: ["worker-jobs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("capture_jobs")
        .select(
          "id, url, status, case_id, incident_id, handler, created_at, claimed_at, finished_at, log, warnings",
        )
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
    refetchInterval: 15_000,
  });

  const rows = jobs.data ?? [];
  const counts = Object.fromEntries(
    STATUSES.map((s) => [s, rows.filter((j) => j.status === s).length]),
  ) as Record<(typeof STATUSES)[number], number>;
  const waiting = rows.filter((j) => j.status === "queued");
  const active = rows.filter((j) => j.status === "running");
  const current = active[0] ?? null;

  const [restarting, setRestarting] = useState(false);
  const restartWorker = async () => {
    const msg = current
      ? "Restart the Mac mini worker? The current capture will be stopped and put back in the queue to run again."
      : "Restart the Mac mini worker?";
    if (!window.confirm(msg)) return;
    setRestarting(true);
    try {
      const now = new Date().toISOString();
      const { error } = await supabase
        .from("worker_status")
        .update({ restart_requested_at: now })
        .eq("id", "worker");
      if (error) throw error;
      const running = rows.filter((j) => j.status === "running");
      for (const j of running) {
        await supabase
          .from("capture_jobs")
          .update({
            status: "queued",
            claimed_at: null,
            warnings: [...(j.warnings ?? []), `Worker restarted from the app at ${now}; re-queued`],
          })
          .eq("id", j.id);
      }
      await qc.invalidateQueries({ queryKey: ["worker-jobs"] });
      toast.success("Restart sent. The Mac mini restarts at its next check-in (within about 20 seconds).");
    } catch {
      toast.error("Could not send the restart. Only the workspace owner can restart the worker.");
    } finally {
      setRestarting(false);
    }
  };
  const currentProgress = current ? getCaptureProgress(current.status, current.log) : null;
  const logJob = current ?? rows.find((j) => (j.log?.length ?? 0) > 0) ?? null;
  const workerLogs = logJob ? visibleWorkerLogs(logJob.log) : [];
  const failedJobs = rows.filter((j) => j.status === "failed");
  const latestFailure = failedJobs[0] ?? null;

  // Keep the live output pinned to the newest line while a capture runs.
  const logBoxRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const box = logBoxRef.current;
    if (box) box.scrollTop = box.scrollHeight;
  }, [workerLogs.length, logJob?.id]);

  const sendQueued = async () => {
    setSending(true);
    try {
      const { sent } = await flushOutbox();
      setPending(await pendingOutboxCount());
      toast.success(sent ? `${sent} queued record(s) sent.` : "Nothing waiting to send.");
    } catch {
      toast.error("Could not send the queued records. Try again when you have a connection.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Worker dashboard"
        subtitle="Incoming capture requests, what the Mac mini is doing, and anything waiting to sync."
        actions={
          <Button
            variant="outline"
            className="h-12"
            onClick={() => void qc.invalidateQueries({ queryKey: ["worker-jobs"] })}
          >
            <RefreshCw className="size-4" /> Refresh
          </Button>
        }
      />

      <div className="grid gap-4 md:grid-cols-3">
        <section className="panel p-5">
          <h2 className="flex items-center gap-2 font-semibold">
            <Radio className="size-4" /> Mac mini
          </h2>
          <div className="mt-3 flex items-center gap-2 text-sm">
            <span
              className={`size-2.5 rounded-full ${
                worker.online ? "bg-done-foreground animate-pulse" : "bg-failed-foreground"
              }`}
            />
            {worker.online ? "Online" : "Offline"}
          </div>
          <dl className="text-muted-foreground mt-3 space-y-1 text-xs">
            <div>Last check-in: {worker.lastSeen ? timeAgo(worker.lastSeen) : "never"}</div>
            <div>Machine: {worker.data?.hostname ?? "—"}</div>
            <div>Version: {worker.data?.version ?? "—"}</div>
            <div>
              Running for:{" "}
              {bootTime && worker.online ? (
                <span className="font-mono">{formatUptime(bootTime, nowMs)}</span>
              ) : (
                "—"
              )}
            </div>
            <div>Last reboot: {bootTime ? formatDateTime(bootTime) : "—"}</div>
          </dl>
        </section>

        <section className="panel p-5">
          <h2 className="font-semibold">Capture requests</h2>
          <div className="mt-3 grid grid-cols-2 gap-3">
            {STATUSES.map((s) => (
              <div key={s} className="bg-muted/50 rounded-lg px-3 py-2">
                <div className="text-2xl font-semibold">{counts[s]}</div>
                <div className="text-muted-foreground text-xs capitalize">{s}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="panel p-5">
          <h2 className="flex items-center gap-2 font-semibold">
            <UploadCloud className="size-4" /> Queued syncs
          </h2>
          <p className="mt-3 text-2xl font-semibold">{pending}</p>
          <p className="text-muted-foreground text-xs">
            Records logged on this device while offline.
          </p>
          <Button
            className="mt-3 h-12 w-full"
            disabled={pending === 0 || !online || sending}
            onClick={() => void sendQueued()}
          >
            {sending ? <Loader2 className="size-4 animate-spin" /> : null}
            {online ? "Send now" : "Waiting for a connection"}
          </Button>
        </section>
      </div>

      <section className="panel p-5">
        <h2 className="font-semibold">Send a capture to the Mac mini</h2>
        <p className="text-muted-foreground mt-1 text-xs">
          Paste a Facebook link — the Mac mini picks it up on its own, no need to start it there.
        </p>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row">
          <Input
            value={newUrl}
            onChange={(e) => setNewUrl(e.target.value)}
            placeholder="https://www.facebook.com/..."
            inputMode="url"
            className="h-12"
          />
          <Button className="h-12 sm:w-48" disabled={queueing} onClick={() => void queueCapture()}>
            {queueing ? <Loader2 className="size-4 animate-spin" /> : null} Send to Mac mini
          </Button>
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(20rem,0.65fr)]">
        <section className="panel p-5">
          <div className="flex items-center justify-between gap-4">
            <h2 className="flex items-center gap-2 font-semibold">
              <Activity className="size-4" /> Current capture
            </h2>
            <div className="flex items-center gap-2">
              {current ? <StatusBadge status={current.status} /> : null}
              <Button
                variant="outline"
                className="h-11"
                disabled={restarting || !worker.online}
                onClick={() => void restartWorker()}
                title={worker.online ? "Restart the Mac mini worker" : "Worker is offline — restart it on the Mac mini"}
              >
                {restarting ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
                Restart worker
              </Button>
            </div>
          </div>
          {current && currentProgress ? (
            <div className="mt-5">
              <Link
                to="/jobs/$jobId"
                params={{ jobId: current.id }}
                className="block truncate text-sm font-medium hover:underline"
              >
                {current.url}
              </Link>
              <div className="text-muted-foreground mt-1 font-mono text-xs">
                CASE-{current.case_id ?? "—"} · INC-{current.incident_id ?? "—"}
              </div>
              <div className="mt-6 flex items-end justify-between gap-4">
                <div>
                  <div className="text-muted-foreground text-xs uppercase">Current step</div>
                  <div className="mt-1 font-medium">{currentProgress.stage}</div>
                </div>
                <div className="font-mono text-3xl font-semibold tabular-nums">
                  {currentProgress.percent === null ? "…" : `${currentProgress.percent}%`}
                </div>
              </div>
              <Progress
                value={currentProgress.percent ?? 8}
                className={`mt-3 h-3 ${currentProgress.percent === null ? "animate-pulse" : ""}`}
                aria-valuetext={currentProgress.stage}
              />
              <div className="text-muted-foreground mt-3 flex items-center gap-2 text-xs">
                <Clock3 className="size-3.5" />
                {current.claimed_at ? `Started ${timeAgo(current.claimed_at)}` : "Starting now"}
              </div>
              {workerLogs.length > 0 ? (
                <div className="bg-sidebar text-sidebar-foreground/80 mt-4 flex items-center gap-2 rounded-lg px-3 py-2 font-mono text-xs">
                  <Terminal className="size-3.5 shrink-0 opacity-60" />
                  <span className="truncate">{workerLogs[workerLogs.length - 1]}</span>
                </div>
              ) : null}
            </div>
          ) : (
            <p className="text-muted-foreground mt-5 text-sm">
              No capture is running. The next queued request will appear here automatically.
            </p>
          )}
        </section>

        <section className="panel overflow-hidden">
          <div className="flex items-center justify-between px-5 pt-5 pb-3">
            <h2 className="flex items-center gap-2 font-semibold">
              <Terminal className="size-4" />
              {current ? "Live capture output" : "Worker logs"}
            </h2>
            <span className="text-muted-foreground flex items-center gap-2 text-xs">
              {current ? (
                <span className="text-done-foreground flex items-center gap-1.5">
                  <span className="bg-done-foreground size-2 animate-pulse rounded-full" />
                  streaming
                </span>
              ) : null}
              {workerLogs.length} lines
            </span>
          </div>
          {logJob && !current ? (
            <div className="border-border text-muted-foreground mx-4 mb-2 rounded-lg border px-3 py-1.5 text-xs">
              Last run's log —{" "}
              <Link to="/jobs/$jobId" params={{ jobId: logJob.id }} className="underline">
                open job
              </Link>
            </div>
          ) : null}
          <div ref={logBoxRef} className="bg-sidebar text-sidebar-foreground h-80 overflow-y-auto p-4">
            {workerLogs.length ? (
              <pre className="hash whitespace-pre-wrap">
                {workerLogs
                  .map((line, index) => `${String(index + 1).padStart(3, "0")}  ${line}`)
                  .join("\n")}
              </pre>
            ) : (
              <p className="text-sidebar-foreground/60 text-sm">
                {current
                  ? "Waiting for the next worker message…"
                  : "Logs appear when a capture starts."}
              </p>
            )}
          </div>
        </section>
      </div>

      {latestFailure ? (
        <section className="panel border-failed-foreground/40 p-5">
          <div className="flex items-center justify-between gap-4">
            <h2 className="flex items-center gap-2 font-semibold">
              <TriangleAlert className="text-failed-foreground size-4" /> Latest failure
            </h2>
            <span className="text-muted-foreground text-xs">
              {latestFailure.finished_at ? formatDateTime(latestFailure.finished_at) : ""}
            </span>
          </div>
          <Link
            to="/jobs/$jobId"
            params={{ jobId: latestFailure.id }}
            className="mt-2 block truncate text-sm font-medium hover:underline"
          >
            {latestFailure.url}
          </Link>
          <div className="text-muted-foreground mt-1 font-mono text-xs">
            CASE-{latestFailure.case_id ?? "—"} · INC-{latestFailure.incident_id ?? "—"}
          </div>
          <div className="bg-sidebar text-sidebar-foreground mt-3 max-h-48 overflow-y-auto rounded-lg p-3">
            <pre className="hash whitespace-pre-wrap">
              {visibleWorkerLogs(latestFailure.log).slice(-10).join("\n") || "No log lines recorded."}
            </pre>
          </div>
          {(latestFailure.warnings ?? []).length > 0 ? (
            <ul className="text-failed-foreground mt-2 space-y-1 text-xs">
              {(latestFailure.warnings ?? []).map((w, i) => (
                <li key={i}>⚠ {w}</li>
              ))}
            </ul>
          ) : null}
          <div className="mt-3 flex gap-2">
            <Button asChild variant="outline" className="h-11">
              <Link to="/jobs/$jobId" params={{ jobId: latestFailure.id }}>
                Open full capture
              </Link>
            </Button>
          </div>
        </section>
      ) : null}

      <section className="panel">
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <h2 className="font-semibold">Live activity</h2>
          <span className="text-muted-foreground flex items-center gap-1.5 text-xs">
            <span
              className={`size-2 rounded-full ${live ? "bg-done-foreground animate-pulse" : "bg-muted-foreground"}`}
            />
            {live ? "connected" : "connecting…"}
          </span>
        </div>
        <div className="divide-border max-h-72 divide-y overflow-y-auto">
          {feed.length === 0 && (
            <p className="text-muted-foreground px-5 py-6 text-sm">
              Waiting for the Mac mini — each check-in, run and file appears here as it happens.
            </p>
          )}
          {feed.map((e, i) => (
            <div key={`${e.at}-${i}`} className="flex gap-3 px-5 py-2 text-sm">
              <span className="text-muted-foreground shrink-0 font-mono text-xs">
                {new Date(e.at).toLocaleTimeString()}
              </span>
              <span className="truncate">{e.text}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <h2 className="font-semibold">In progress &amp; waiting</h2>
          <span className="text-muted-foreground text-xs">live</span>
        </div>
        <div className="divide-border divide-y">
          {[...active, ...waiting].length === 0 && (
            <p className="text-muted-foreground px-5 py-6 text-sm">
              Nothing waiting — every capture request has been handled.
            </p>
          )}
          {[...active, ...waiting].map((job, index) => {
            const progress = getCaptureProgress(job.status, job.log);
            return (
              <Link
                key={job.id}
                to="/jobs/$jobId"
                params={{ jobId: job.id }}
                className="hover:bg-muted block min-h-16 px-5 py-3"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{job.url}</div>
                    <div className="text-muted-foreground mt-0.5 text-xs">
                      <span className="font-mono">
                        CASE-{job.case_id ?? "—"} · INC-{job.incident_id ?? "—"}
                      </span>{" "}
                      · requested {timeAgo(job.created_at)}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    {job.status === "queued" ? (
                      <span className="text-muted-foreground text-xs">#{index - active.length + 1}</span>
                    ) : null}
                    <StatusBadge status={job.status} />
                  </div>
                </div>
                <div className="mt-3">
                  <div className="text-muted-foreground mb-1.5 flex justify-between gap-3 text-xs">
                    <span>{progress.stage}</span>
                    <span className="font-mono tabular-nums">
                      {progress.percent === null ? "…" : `${progress.percent}%`}
                    </span>
                  </div>
                  <Progress
                    value={progress.percent ?? 8}
                    className={progress.percent === null ? "animate-pulse" : undefined}
                  />
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="panel overflow-x-auto">
        <div className="px-5 pt-5 pb-3">
          <h2 className="font-semibold">Recent runs</h2>
        </div>
        <table className="w-full min-w-[720px] text-sm">
          <thead className="text-muted-foreground text-left text-xs uppercase">
            <tr>
              <th className="px-5 py-3">Request</th>
              <th className="px-5 py-3">Handler</th>
              <th className="px-5 py-3">Finished</th>
              <th className="px-5 py-3">Took</th>
              <th className="px-5 py-3">Warnings</th>
              <th className="px-5 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows
              .filter((j) => j.status === "done" || j.status === "failed")
              .slice(0, 15)
              .map((job) => (
                <tr key={job.id} className="border-border/60 border-t">
                  <td className="max-w-80 truncate px-5 py-3">
                    <Link to="/jobs/$jobId" params={{ jobId: job.id }} className="underline">
                      {job.url}
                    </Link>
                  </td>
                  <td className="px-5 py-3">{job.handler ?? "—"}</td>
                  <td className="px-5 py-3">
                    {job.finished_at ? formatDateTime(job.finished_at) : "—"}
                  </td>
                  <td className="px-5 py-3">{duration(job.claimed_at, job.finished_at) ?? "—"}</td>
                  <td className="px-5 py-3">{job.warnings?.length ?? 0}</td>
                  <td className="px-5 py-3">
                    <StatusBadge status={job.status} />
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
        {jobs.isLoading && <Loader2 className="m-5 size-5 animate-spin" />}
      </section>
    </div>
  );
}
