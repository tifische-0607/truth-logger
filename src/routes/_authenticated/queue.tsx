import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Loader2, Play, RefreshCw, RotateCcw, Sliders, X } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { PageHeader, useWorkerStatus } from "@/components/AppShell";
import { NewCaptureSheet } from "@/components/NewCaptureSheet";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDateTime, timeAgo } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/queue")({
  head: () => ({
    meta: [
      { title: "Capture queue — FB Evidence Monitor" },
      {
        name: "description",
        content:
          "Queue Facebook captures by hand from an iPad and watch each request move from queued to captured.",
      },
      { property: "og:title", content: "Capture queue — FB Evidence Monitor" },
      {
        property: "og:description",
        content: "Manually queue Facebook captures and track their status.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: QueuePage,
});

const HANDLER_KEY = "fbem.handler";

function QueuePage() {
  const qc = useQueryClient();
  const worker = useWorkerStatus();
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetUrl, setSheetUrl] = useState("");

  useEffect(() => {
    const channel = supabase
      .channel(`queue-page-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "capture_jobs" }, () => {
        void qc.invalidateQueries({ queryKey: ["queue-jobs"] });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [qc]);

  const jobs = useQuery({
    queryKey: ["queue-jobs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("capture_jobs")
        .select(
          "id, url, status, case_id, incident_id, handler, created_at, claimed_at, finished_at",
        )
        .order("created_at", { ascending: false })
        .limit(60);
      if (error) throw error;
      return data;
    },
    refetchInterval: 15_000,
  });

  const rows = jobs.data ?? [];
  const waiting = rows.filter((j) => j.status === "queued" || j.status === "running");
  const history = rows.filter((j) => j.status === "done" || j.status === "failed");

  const start = async () => {
    const value = url.trim();
    if (!value) {
      toast.error("Paste a Facebook link first.");
      return;
    }
    setBusy(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const handler =
        typeof window !== "undefined" ? localStorage.getItem(HANDLER_KEY) : null;
      const { error } = await supabase.from("capture_jobs").insert({
        url: value,
        handler: handler || null,
        created_by: userData.user?.id ?? null,
      });
      if (error) throw error;
      setUrl("");
      await qc.invalidateQueries({ queryKey: ["queue-jobs"] });
      toast.success(
        worker.online
          ? "Queued — the Mac mini will pick it up shortly."
          : "Queued — it will run once the Mac mini is online.",
      );
    } catch {
      toast.error("Could not add this capture. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const setStatus = async (id: string, status: "queued" | "failed", message: string) => {
    const { error } = await supabase
      .from("capture_jobs")
      .update({ status, finished_at: status === "queued" ? null : new Date().toISOString() })
      .eq("id", id);
    if (error) {
      toast.error("Could not update this capture request.");
      return;
    }
    await qc.invalidateQueries({ queryKey: ["queue-jobs"] });
    toast.success(message);
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Capture queue"
        subtitle="Add a Facebook link by hand and follow it from queued to captured."
        actions={
          <Button
            variant="outline"
            className="h-12"
            onClick={() => void qc.invalidateQueries({ queryKey: ["queue-jobs"] })}
          >
            <RefreshCw className="size-4" /> Refresh
          </Button>
        }
      />

      <section className="panel space-y-4 p-5">
        <div className="flex items-center gap-2 text-sm">
          <span
            className={`size-2.5 rounded-full ${
              worker.online ? "bg-done-foreground animate-pulse" : "bg-failed-foreground"
            }`}
          />
          {worker.online
            ? `Mac mini online · seen ${worker.lastSeen ? timeAgo(worker.lastSeen) : "just now"}`
            : "Mac mini offline — captures wait in the queue until it is back"}
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://www.facebook.com/…"
            inputMode="url"
            className="h-14 flex-1 text-base"
          />
          <Button className="h-14 px-8 text-base" disabled={busy} onClick={() => void start()}>
            {busy ? <Loader2 className="size-5 animate-spin" /> : <Play className="size-5" />}
            Start capture
          </Button>
        </div>

        <Button
          variant="ghost"
          className="h-12"
          onClick={() => {
            setSheetUrl(url.trim());
            setSheetOpen(true);
          }}
        >
          <Sliders className="size-4" /> Add with case, incident and options
        </Button>
      </section>

      <section className="panel">
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <h2 className="font-semibold">Waiting &amp; running</h2>
          <span className="text-muted-foreground text-xs">live</span>
        </div>
        <div className="divide-border divide-y">
          {waiting.length === 0 ? (
            <p className="text-muted-foreground px-5 py-6 text-sm">
              Nothing in the queue right now.
            </p>
          ) : (
            waiting.map((job) => (
              <div key={job.id} className="flex flex-wrap items-center gap-3 px-5 py-4">
                <StatusBadge status={job.status} />
                <Link
                  to="/jobs/$jobId"
                  params={{ jobId: job.id }}
                  className="min-w-0 flex-1 truncate text-sm hover:underline"
                >
                  {job.url}
                </Link>
                <span className="text-muted-foreground font-mono text-xs">
                  {job.case_id ? `${job.case_id}${job.incident_id ? ` · ${job.incident_id}` : ""}` : "no case yet"}
                </span>
                <span className="text-muted-foreground text-xs">{timeAgo(job.created_at)}</span>
                {job.status === "queued" ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-11"
                    onClick={() => void setStatus(job.id, "failed", "Capture cancelled.")}
                  >
                    <X className="size-4" /> Cancel
                  </Button>
                ) : null}
              </div>
            ))
          )}
        </div>
      </section>

      <section className="panel">
        <h2 className="px-5 pt-5 pb-3 font-semibold">Recent captures</h2>
        <div className="divide-border divide-y">
          {history.length === 0 ? (
            <p className="text-muted-foreground px-5 py-6 text-sm">No captures finished yet.</p>
          ) : (
            history.map((job) => (
              <div key={job.id} className="flex flex-wrap items-center gap-3 px-5 py-4">
                <StatusBadge status={job.status} />
                <Link
                  to="/jobs/$jobId"
                  params={{ jobId: job.id }}
                  className="min-w-0 flex-1 truncate text-sm hover:underline"
                >
                  {job.url}
                </Link>
                <span className="text-muted-foreground text-xs">
                  {job.finished_at ? formatDateTime(job.finished_at) : "—"}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-11"
                  onClick={() => void setStatus(job.id, "queued", "Queued again.")}
                >
                  <RotateCcw className="size-4" /> Run again
                </Button>
              </div>
            ))
          )}
        </div>
      </section>

      <NewCaptureSheet open={sheetOpen} onOpenChange={setSheetOpen} initialUrl={sheetUrl} />
    </div>
  );
}
