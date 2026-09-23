import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Loader2, RefreshCw, Radio, UploadCloud } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { PageHeader, useWorkerStatus } from "@/components/AppShell";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { formatDateTime, timeAgo } from "@/lib/format";
import { flushOutbox, pendingOutboxCount, useOnline } from "@/lib/offline";

export const Route = createFileRoute("/_authenticated/worker")({
  head: () => ({
    meta: [
      { title: "Worker dashboard — FB Evidence Monitor" },
      {
        name: "description",
        content:
          "Track the Mac mini capture worker: incoming capture requests, job status, run times and queued syncs.",
      },
      { property: "og:title", content: "Worker dashboard — FB Evidence Monitor" },
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
    const channel = supabase
      .channel(`worker-dash-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "capture_jobs" }, () => {
        void qc.invalidateQueries({ queryKey: ["worker-jobs"] });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [qc]);

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
          {[...active, ...waiting].map((job) => (
            <Link
              key={job.id}
              to="/jobs/$jobId"
              params={{ jobId: job.id }}
              className="hover:bg-muted flex min-h-16 items-center justify-between gap-4 px-5 py-3"
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{job.url}</div>
                <div className="text-muted-foreground mt-0.5 text-xs">
                  <span className="font-mono">
                    CASE-{job.case_id} · INC-{job.incident_id}
                  </span>{" "}
                  · queued {timeAgo(job.created_at)}
                  {job.claimed_at ? ` · picked up ${timeAgo(job.claimed_at)}` : ""}
                </div>
              </div>
              <StatusBadge status={job.status} />
            </Link>
          ))}
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
