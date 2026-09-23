import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Camera, FolderClosed, Radio } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { PageHeader, useWorkerStatus } from "@/components/AppShell";
import { NewCaptureSheet } from "@/components/NewCaptureSheet";
import { StatusBadge } from "@/components/StatusBadge";
import { formatDateTime, timeAgo } from "@/lib/format";
import { EvidenceThumb } from "@/components/EvidenceThumb";

export const Route = createFileRoute("/_authenticated/dashboard")({
  validateSearch: (search: Record<string, unknown>): { url?: string } =>
    typeof search["url"] === "string" && search["url"].length > 0
      ? { url: search["url"] }
      : {},
  component: Dashboard,
});

function Dashboard() {
  const { url } = Route.useSearch();
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const worker = useWorkerStatus();

  useEffect(() => {
    if (url) setOpen(true);
  }, [url]);

  useEffect(() => {
    const channel = supabase
      .channel(`jobs-feed-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "capture_jobs" }, () => {
        void queryClient.invalidateQueries({ queryKey: ["jobs"] });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const openCases = useQuery({
    queryKey: ["cases", "open"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cases")
        .select("id, target_of_complaint, offence_alleged, status, opened_on")
        .eq("status", "open")
        .order("opened_on", { ascending: false })
        .limit(6);
      if (error) throw error;
      return data;
    },
  });

  const jobs = useQuery({
    queryKey: ["jobs", "active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("capture_jobs")
        .select("id, url, status, case_id, incident_id, created_at, log")
        .order("created_at", { ascending: false })
        .limit(8);
      if (error) throw error;
      return data;
    },
  });

  const recent = useQuery({
    queryKey: ["items", "recent"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("items")
        .select(
          "id, item_code, item_type, author_name, text_original, captured_at, artefacts(id, kind, storage_path)",
        )
        .order("captured_at", { ascending: false })
        .limit(8);
      if (error) throw error;
      return data;
    },
  });

  return (
    <>
      <PageHeader
        title="Evidence room"
        subtitle="Capture, verify and preserve Facebook evidence."
        actions={
          <Button className="h-14 px-7 text-base" onClick={() => setOpen(true)}>
            <Camera className="size-5" /> New capture
          </Button>
        }
      />

      <div className="grid gap-5 lg:grid-cols-3">
        <section className="panel lg:col-span-2">
          <div className="flex items-center justify-between px-5 pt-5 pb-3">
            <h2 className="font-semibold">Capture jobs</h2>
            <span className="text-muted-foreground text-xs">live</span>
          </div>
          <div className="divide-border divide-y">
            {jobs.data?.length ? (
              jobs.data.map((job) => (
                <Link
                  key={job.id}
                  to="/jobs/$jobId"
                  params={{ jobId: job.id }}
                  className="hover:bg-muted flex min-h-16 items-center justify-between gap-4 px-5 py-3 transition-colors"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{job.url}</div>
                    <div className="text-muted-foreground mt-0.5 text-xs">
                      <span className="font-mono">
                        CASE-{job.case_id} · INC-{job.incident_id}
                      </span>{" "}
                      · {timeAgo(job.created_at)}
                      {job.log?.length ? ` · ${job.log.length} log lines` : ""}
                    </div>
                  </div>
                  <StatusBadge status={job.status} />
                </Link>
              ))
            ) : (
              <p className="text-muted-foreground px-5 py-8 text-sm">
                No capture jobs yet. Tap “New capture” to queue one.
              </p>
            )}
          </div>
        </section>

        <section className="panel p-5">
          <div className="flex items-center gap-2">
            <Radio className="size-4" />
            <h2 className="font-semibold">Mac mini worker</h2>
          </div>
          <div className="mt-4 flex items-center gap-3">
            <span
              className={`size-3 rounded-full ${
                worker.online ? "bg-done-foreground animate-pulse" : "bg-failed-foreground"
              }`}
            />
            <span className="text-lg font-semibold">
              {worker.online ? "Online" : "Offline"}
            </span>
          </div>
          <p className="text-muted-foreground mt-2 text-sm">
            Last check-in {timeAgo(worker.lastSeen)}
            {worker.lastSeen ? ` (${formatDateTime(worker.lastSeen)})` : ""}
          </p>
          <p className="text-muted-foreground mt-4 text-xs">
            Green when the worker has checked in within the last 2 minutes.
          </p>
        </section>

        <section className="panel lg:col-span-1">
          <div className="flex items-center gap-2 px-5 pt-5 pb-3">
            <FolderClosed className="size-4" />
            <h2 className="font-semibold">Open cases</h2>
          </div>
          <div className="divide-border divide-y">
            {openCases.data?.length ? (
              openCases.data.map((c) => (
                <Link
                  key={c.id}
                  to="/cases/$caseId"
                  params={{ caseId: c.id }}
                  className="hover:bg-muted block px-5 py-3.5 transition-colors"
                >
                  <div className="font-mono text-sm font-semibold">CASE-{c.id}</div>
                  <div className="text-muted-foreground truncate text-xs">
                    {c.target_of_complaint ?? "No target recorded"}
                  </div>
                </Link>
              ))
            ) : (
              <p className="text-muted-foreground px-5 py-8 text-sm">No open cases.</p>
            )}
          </div>
        </section>

        <section className="panel lg:col-span-2">
          <h2 className="px-5 pt-5 pb-3 font-semibold">Recent evidence</h2>
          <div className="grid grid-cols-2 gap-4 px-5 pb-5 sm:grid-cols-3 xl:grid-cols-4">
            {recent.data?.length ? (
              recent.data.map((item) => {
                const shot = item.artefacts?.find((a) => a.kind === "screenshot");
                return (
                  <Link
                    key={item.id}
                    to="/items/$itemId"
                    params={{ itemId: item.id }}
                    className="group block"
                  >
                    <EvidenceThumb path={shot?.storage_path ?? null} />
                    <div className="mt-2 font-mono text-xs font-semibold">{item.item_code}</div>
                    <div className="text-muted-foreground line-clamp-2 text-xs">
                      {item.author_name ?? "Unknown"} · {item.text_original ?? ""}
                    </div>
                  </Link>
                );
              })
            ) : (
              <p className="text-muted-foreground col-span-full pb-6 text-sm">
                No evidence items captured yet.
              </p>
            )}
          </div>
        </section>
      </div>

      <NewCaptureSheet open={open} onOpenChange={setOpen} initialUrl={url ?? ""} />
    </>
  );
}
