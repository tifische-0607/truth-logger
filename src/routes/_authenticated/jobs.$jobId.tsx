import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { AlertTriangle, ArrowRight } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/AppShell";
import { StatusBadge } from "@/components/StatusBadge";
import { formatDateTime } from "@/lib/format";
import { visibleWorkerLogs } from "@/lib/capture-progress";
import { CaptureCustodyTrail } from "@/components/CaptureCustodyTrail";
import { CaptureViewer } from "@/components/CaptureViewer";

export const Route = createFileRoute("/_authenticated/jobs/$jobId")({
  component: JobDetail,
});

function JobDetail() {
  const { jobId } = Route.useParams();
  const queryClient = useQueryClient();
  const logEnd = useRef<HTMLDivElement>(null);

  const job = useQuery({
    queryKey: ["job", jobId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("capture_jobs")
        .select("*")
        .eq("id", jobId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    const channel = supabase
      .channel(`job-${jobId}-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "capture_jobs", filter: `id=eq.${jobId}` },
        () => void queryClient.invalidateQueries({ queryKey: ["job", jobId] }),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [jobId, queryClient]);

  useEffect(() => {
    logEnd.current?.scrollIntoView({ block: "end" });
  }, [job.data?.log?.length]);

  const data = job.data;
  const resultItemId =
    data?.result && typeof data.result === "object" && !Array.isArray(data.result)
      ? ((data.result as Record<string, unknown>)["item_id"] as string | undefined)
      : undefined;

  const total = data?.options && typeof data.options === "object" ? data.options : null;
  void total;

  if (job.isLoading) return <p className="text-muted-foreground">Loading job…</p>;
  if (!data) return <p className="text-muted-foreground">Job not found.</p>;

  return (
    <>
      <PageHeader
        title="Capture job"
        subtitle={data.url}
        actions={<StatusBadge status={data.status} className="text-sm" />}
      />

      <div className="grid gap-5 lg:grid-cols-3">
        <section className="panel space-y-4 p-5">
          <Detail label="Case" value={`CASE-${data.case_id ?? "—"}`} mono />
          <Detail label="Incident" value={`INC-${data.incident_id ?? "—"}`} mono />
          <Detail label="Handler" value={data.handler ?? "—"} />
          <Detail label="Queued" value={formatDateTime(data.created_at)} />
          <Detail label="Claimed" value={formatDateTime(data.claimed_at)} />
          <Detail label="Finished" value={formatDateTime(data.finished_at)} />
          {resultItemId ? (
            <Link
              to="/items/$itemId"
              params={{ itemId: resultItemId }}
              className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-lg px-4 text-sm font-medium transition-colors"
            >
              Open evidence item <ArrowRight className="size-4" />
            </Link>
          ) : null}
        </section>

        <section className="lg:col-span-2 space-y-5">
          {data.warnings?.length ? (
            <div className="bg-warn text-warn-foreground rounded-xl border p-4">
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
                <AlertTriangle className="size-4" /> {data.warnings.length} warning
                {data.warnings.length === 1 ? "" : "s"}
              </div>
              <ul className="space-y-1 text-sm">
                {data.warnings.map((w, i) => (
                  <li key={i}>• {w}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="panel overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3">
              <h2 className="font-semibold">Live log</h2>
              <span className="text-muted-foreground text-xs">
                {data.log?.length ?? 0} lines
              </span>
            </div>
            <div className="bg-sidebar text-sidebar-foreground max-h-[26rem] overflow-y-auto p-4">
              {data.log?.length ? (
                <pre className="hash whitespace-pre-wrap">
                  {visibleWorkerLogs(data.log)
                    .map((line, i) => `${String(i + 1).padStart(3, "0")}  ${line}`)
                    .join("\n")}
                </pre>
              ) : (
                <p className="text-sidebar-foreground/60 text-sm">
                  Waiting for the worker to pick up this job…
                </p>
              )}
              <div ref={logEnd} />
            </div>
          </div>

          {resultItemId ? <CaptureCustodyTrail itemId={resultItemId} /> : null}
        </section>
      </div>
    </>
  );
}

function Detail({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="text-muted-foreground text-xs tracking-wide uppercase">{label}</div>
      <div className={`text-sm ${mono ? "font-mono font-semibold" : ""}`}>{value}</div>
    </div>
  );
}
