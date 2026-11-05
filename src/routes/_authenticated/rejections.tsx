import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/AppShell";
import { Chip, Section } from "@/components/engagement/ui";
import { hubHead } from "@/lib/hub";
import { formatDateTime } from "@/lib/format";
import { rejectionRate } from "@/lib/rejections";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/rejections")({
  head: () => hubHead("Rejection rates", "Per-connector rejected items, rejection rate and auto-suspension in FA Portal."),
  component: Rejections,
});

type Day = { day: string; accepted: number; rejected: number };
type Conn = {
  key: string; name: string; version: string; status: "active" | "suspended"; status_reason: string | null;
  reject_limit: number; reject_window_minutes: number; auto_suspended: boolean; last_suspended_at: string | null;
  accepted: number; rejected: number; rejected_in_window: number; trend: Day[];
};
const errText = (e: unknown) => (e && typeof e === "object" && "message" in e ? String((e as { message: unknown }).message) : String(e));

function Rejections() {
  const [days, setDays] = useState(14);
  const q = useQuery({
    queryKey: ["rejection-dashboard", days],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("research_rejection_dashboard", { _days: days });
      if (error) throw error;
      return data as unknown as { days: number; since: string; connectors: Conn[] };
    },
  });
  return (
    <>
      <PageHeader kicker="05 · Collect" title="Rejection rates" subtitle="Items each connector delivered, how many the database rejected, and any automatic suspension." />
      <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Period">
        {[7, 14, 30, 90].map((d) => (
          <button key={d} type="button" aria-pressed={days === d} onClick={() => setDays(d)}
            className={cn("min-h-11 rounded-[10px] px-4 text-sm font-medium", days === d ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground")}>
            Last {d} days
          </button>
        ))}
      </div>
      {q.error ? <p role="alert" className="bg-failed text-failed-foreground rounded-md px-3 py-2 text-sm">{errText(q.error)}</p> : null}
      {!q.data && !q.error ? <p className="text-muted-foreground text-sm">Loading…</p> : null}
      {q.data?.connectors.length === 0 ? <p className="text-muted-foreground text-sm">No connectors are registered.</p> : null}
      <div className="grid gap-4">
        {q.data?.connectors.map((c) => <ConnectorCard key={c.key} c={c} />)}
      </div>
    </>
  );
}

function ConnectorCard({ c }: { c: Conn }) {
  const received = c.accepted + c.rejected;
  const rate = rejectionRate(c.accepted, c.rejected);
  const max = Math.max(1, ...c.trend.map((t) => t.accepted + t.rejected));
  return (
    <Section id={`conn-${c.key}`} title={`${c.name} · v${c.version}`}
      actions={<Chip tone={c.status === "suspended" ? "bg-failed text-failed-foreground" : "bg-done text-done-foreground"}>
        <span className={cn("size-2 rounded-full", c.status === "suspended" ? "bg-negative" : "bg-positive")} aria-hidden />
        {c.status === "suspended" ? (c.auto_suspended ? "Suspended automatically" : "Suspended") : "Active"}
      </Chip>}>
      {c.status === "suspended" && c.status_reason ? <p className="bg-warn text-warn-foreground mb-3 rounded-md px-3 py-2 text-sm">{c.status_reason}{c.last_suspended_at ? ` · ${formatDateTime(c.last_suspended_at)}` : ""}</p> : null}
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Items received" value={String(received)} />
        <Stat label="Items rejected" value={String(c.rejected)} />
        <Stat label="Rejection rate" value={rate === null ? "No items" : `${rate.toFixed(1)}%`} />
        <Stat label="Rejected in current window" value={`${c.rejected_in_window} of ${c.reject_limit}`} />
      </dl>
      <p className="text-muted-foreground mt-3 text-sm">
        Auto-suspend setting: after <strong className="text-foreground">{c.reject_limit}</strong> rejected items within <strong className="text-foreground">{c.reject_window_minutes}</strong> minutes.
      </p>
      <figure className="mt-4">
        <figcaption className="text-muted-foreground mb-2 text-sm">Daily trend (bar height = items received; darker part = rejected)</figcaption>
        <div className="flex h-28 items-end gap-1 overflow-x-auto" role="img" aria-label={`Daily received and rejected items for ${c.name}`}>
          {c.trend.map((t) => {
            const tot = t.accepted + t.rejected;
            return (
              <div key={t.day} title={`${t.day}: ${tot} received, ${t.rejected} rejected`} className="bg-muted flex min-w-3 flex-1 flex-col justify-end rounded-sm" style={{ height: "100%" }}>
                <div className="bg-brand-blue/40 flex flex-col justify-end rounded-sm" style={{ height: `${(tot / max) * 100}%` }}>
                  <div className="bg-negative rounded-sm" style={{ height: tot ? `${(t.rejected / tot) * 100}%` : 0 }} />
                </div>
              </div>
            );
          })}
        </div>
        <div className="text-muted-foreground mt-1 flex justify-between text-xs"><span>{c.trend[0]?.day}</span><span>{c.trend.at(-1)?.day}</span></div>
      </figure>
    </Section>
  );
}

const Stat = ({ label, value }: { label: string; value: string }) => (
  <div className="bg-muted rounded-lg p-3"><dt className="text-muted-foreground text-xs">{label}</dt><dd className="font-display text-xl font-medium">{value}</dd></div>
);
