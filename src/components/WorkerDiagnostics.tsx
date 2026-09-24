import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { Activity, Copy, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { getWorkerDiagnostics, type WorkerDiagnostics } from "@/lib/diagnostics.functions";
import { formatDateTime, timeAgo } from "@/lib/format";

function report(d: WorkerDiagnostics): string {
  const lines = [
    "SpyGlass V2 — worker troubleshooting report",
    `Generated: ${d.checkedAt}`,
    `Base URL:  ${d.baseUrl}`,
    "",
    "WORKER",
    `  Status:     ${d.worker.online ? "ONLINE" : "OFFLINE"}`,
    `  Last seen:  ${d.worker.lastSeen ?? "never"}`,
    `  Host:       ${d.worker.hostname ?? "—"}`,
    `  Version:    ${d.worker.version ?? "—"}`,
    `  WORKER_TOKEN configured: ${d.tokenConfigured ? "yes" : "NO"}`,
    "",
    "ENDPOINTS (probed with an invalid token; 401 = healthy)",
    ...d.probes.map(
      (p) =>
        `  ${p.ok ? "OK  " : "FAIL"}  ${String(p.ms).padStart(5)}ms  ${String(p.status ?? "—").padStart(4)}  ${p.path}  — ${p.note}`,
    ),
    "",
    "RECENT FAILED JOBS",
    ...(d.errors.length
      ? d.errors.map((e) => `  ${e.at}  ${e.jobId}\n    ${e.url}\n    ${e.message}`)
      : ["  none"]),
  ];
  return lines.join("\n");
}

export function WorkerDiagnosticsPanel() {
  const run = useServerFn(getWorkerDiagnostics);
  const mutation = useMutation({
    mutationFn: () => run({ data: { baseUrl: window.location.origin } }),
    onError: (e: Error) => toast.error(e.message),
  });
  const d = mutation.data;

  return (
    <section className="panel p-5 md:col-span-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Activity className="size-4" />
          <h2 className="font-semibold">Worker diagnostics</h2>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="h-11"
            disabled={mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            <RefreshCw className={`size-4 ${mutation.isPending ? "animate-spin" : ""}`} />
            {mutation.isPending ? "Testing…" : d ? "Run again" : "Run diagnostics"}
          </Button>
          {d ? (
            <Button
              variant="secondary"
              className="h-11"
              onClick={async () => {
                await navigator.clipboard.writeText(report(d));
                toast.success("Troubleshooting report copied");
              }}
            >
              <Copy className="size-4" />
              Copy report
            </Button>
          ) : null}
        </div>
      </div>

      {!d ? (
        <p className="text-muted-foreground mt-3 text-sm">
          Checks the last check-in, times every worker endpoint and lists recent capture failures.
        </p>
      ) : (
        <div className="mt-5 space-y-5">
          <div className="grid gap-3 sm:grid-cols-3">
            <Stat
              label="Last heartbeat"
              value={timeAgo(d.worker.lastSeen)}
              sub={formatDateTime(d.worker.lastSeen)}
              tone={d.worker.online ? "ok" : "bad"}
            />
            <Stat
              label="Endpoints healthy"
              value={`${d.probes.filter((p) => p.ok).length} / ${d.probes.length}`}
              sub={d.tokenConfigured ? "Worker token configured" : "WORKER_TOKEN missing"}
              tone={d.probes.every((p) => p.ok) ? "ok" : "bad"}
            />
            <Stat
              label="Median response"
              value={`${median(d.probes.map((p) => p.ms))} ms`}
              sub={d.baseUrl.replace(/^https?:\/\//, "")}
              tone="neutral"
            />
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-muted-foreground text-left text-xs uppercase">
                <tr>
                  <th className="py-2 pr-4 font-medium">Endpoint</th>
                  <th className="py-2 pr-4 font-medium">Status</th>
                  <th className="py-2 pr-4 font-medium">Time</th>
                  <th className="py-2 font-medium">Note</th>
                </tr>
              </thead>
              <tbody>
                {d.probes.map((p) => (
                  <tr key={p.name} className="border-border/60 border-t">
                    <td className="hash py-2 pr-4">{p.path}</td>
                    <td className="py-2 pr-4">
                      <span className={p.ok ? "text-done-foreground" : "text-failed-foreground"}>
                        {p.ok ? "OK" : "FAIL"} {p.status ?? ""}
                      </span>
                    </td>
                    <td className="hash py-2 pr-4">{p.ms} ms</td>
                    <td className="text-muted-foreground py-2">{p.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div>
            <h3 className="text-sm font-semibold">Recent capture failures</h3>
            {d.errors.length === 0 ? (
              <p className="text-muted-foreground mt-2 text-sm">No failed captures recorded.</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {d.errors.map((e) => (
                  <li key={e.jobId} className="bg-muted/40 rounded-lg p-3 text-sm">
                    <div className="text-muted-foreground text-xs">{formatDateTime(e.at)}</div>
                    <div className="mt-1 break-all">{e.url}</div>
                    <div className="text-failed-foreground mt-1">{e.message}</div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)]!;
}

function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub: string;
  tone: "ok" | "bad" | "neutral";
}) {
  return (
    <div className="bg-muted/40 rounded-lg p-4">
      <div className="text-muted-foreground text-xs uppercase">{label}</div>
      <div
        className={`mt-1 text-lg font-semibold ${
          tone === "ok"
            ? "text-done-foreground"
            : tone === "bad"
              ? "text-failed-foreground"
              : undefined
        }`}
      >
        {value}
      </div>
      <div className="text-muted-foreground mt-1 truncate text-xs">{sub}</div>
    </div>
  );
}
