import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/AppShell";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/capture-log")({
  head: () => ({
    meta: [
      { title: "Capture log — SpyGlass V2" },
      {
        name: "description",
        content:
          "Every Facebook capture run with its date, how long it took, whether it succeeded, and the case it belongs to.",
      },
      { property: "og:title", content: "Capture log — SpyGlass V2" },
      {
        property: "og:description",
        content: "Full history of Facebook capture runs with dates, durations and outcomes.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CaptureLogPage,
});

function duration(from: string | null, to: string | null) {
  if (!from || !to) return "—";
  const s = Math.round((new Date(to).getTime() - new Date(from).getTime()) / 1000);
  if (s < 0) return "—";
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}

const FILTERS = ["all", "done", "failed"] as const;

function CaptureLogPage() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("all");
  const [live, setLive] = useState(false);
  const [, tick] = useState(0);

  // Live updates: every change to a capture run refreshes this table immediately.
  useEffect(() => {
    const channel = supabase
      .channel(`capture-log-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "capture_jobs" },
        () => void qc.invalidateQueries({ queryKey: ["capture-log"] }),
      )
      .subscribe((status) => setLive(status === "SUBSCRIBED"));
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [qc]);

  // Keep the elapsed time of in-flight runs ticking.
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);


  const runs = useQuery({
    queryKey: ["capture-log"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("capture_jobs")
        .select(
          "id, url, status, case_id, incident_id, handler, created_at, claimed_at, finished_at, warnings",
        )
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data;
    },
    refetchInterval: 30_000,
  });

  const rows = (runs.data ?? []).filter((r) => (filter === "all" ? true : r.status === filter));

  return (
    <div className="space-y-5">
      <PageHeader
        title="Capture log"
        subtitle="Every capture run, how long it took and where the evidence landed."
        actions={
          <div className="flex items-center gap-3">
            <span className="text-muted-foreground flex items-center gap-2 text-xs">
              <span
                className={`size-2.5 rounded-full ${live ? "bg-done-foreground animate-pulse" : "bg-muted-foreground/50"}`}
              />
              {live ? "Live" : "Connecting…"}
            </span>
            <Button
              variant="outline"
              className="h-12"
              onClick={() => void qc.invalidateQueries({ queryKey: ["capture-log"] })}
            >
              <RefreshCw className="size-4" /> Refresh
            </Button>
          </div>
        }
      />

      <div className="flex gap-2">
        {FILTERS.map((f) => (
          <Button
            key={f}
            variant={filter === f ? "default" : "outline"}
            className="h-11 capitalize"
            onClick={() => setFilter(f)}
          >
            {f === "all" ? "All runs" : f === "done" ? "Succeeded" : "Failed"}
          </Button>
        ))}
      </div>

      <section className="panel overflow-x-auto">
        <table className="w-full min-w-[820px] text-sm">
          <thead className="text-muted-foreground text-left text-xs uppercase">
            <tr>
              <th className="px-5 py-3">Started</th>
              <th className="px-5 py-3">Link</th>
              <th className="px-5 py-3">Case</th>
              <th className="px-5 py-3">Handler</th>
              <th className="px-5 py-3">Took</th>
              <th className="px-5 py-3">Warnings</th>
              <th className="px-5 py-3">Outcome</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-border/60 border-t">
                <td className="px-5 py-3 whitespace-nowrap">
                  {formatDateTime(r.claimed_at ?? r.created_at)}
                </td>
                <td className="max-w-72 truncate px-5 py-3">
                  <Link to="/jobs/$jobId" params={{ jobId: r.id }} className="underline">
                    {r.url}
                  </Link>
                </td>
                <td className="px-5 py-3 font-mono text-xs">
                  {r.case_id ? (
                    <Link to="/cases/$caseId" params={{ caseId: r.case_id }} className="underline">
                      {r.case_id}
                      {r.incident_id ? ` · ${r.incident_id}` : ""}
                    </Link>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-5 py-3">{r.handler ?? "—"}</td>
                <td className="px-5 py-3">
                  {r.status === "running" && r.claimed_at
                    ? `${duration(r.claimed_at, new Date().toISOString())}…`
                    : duration(r.claimed_at, r.finished_at)}
                </td>
                <td className="px-5 py-3">{r.warnings?.length ?? 0}</td>
                <td className="px-5 py-3">
                  <StatusBadge status={r.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {runs.isLoading && <Loader2 className="m-5 size-5 animate-spin" />}
        {!runs.isLoading && rows.length === 0 && (
          <p className="text-muted-foreground px-5 py-6 text-sm">No capture runs to show yet.</p>
        )}
      </section>
    </div>
  );
}
