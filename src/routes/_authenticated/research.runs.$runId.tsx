import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, ChevronLeft, CircleDashed, House } from "lucide-react";

import { Chip } from "@/components/engagement/ui";
import { PlanChip, Refusal } from "@/components/research/ResearchBits";
import { supabase } from "@/integrations/supabase/client";
import { formatDateTime } from "@/lib/format";
import { hubHead } from "@/lib/hub";
import { PIPELINE, TIER_LABEL, errText, fstdCompliant } from "@/lib/research";

export const Route = createFileRoute("/_authenticated/research/runs/$runId")({
  head: () => hubHead("Research run", "Capture pipeline, FA-STD-001 checks and refused jobs for one run."),
  component: RunPage,
});

function RunPage() {
  const { runId } = Route.useParams();
  const q = useQuery({
    queryKey: ["research", "run", runId],
    queryFn: async () => {
      const run = await supabase.from("research_runs").select("*").eq("id", runId).single();
      if (run.error) throw run.error;
      const [caps, refusals, plan] = await Promise.all([
        supabase.from("research_captures").select("*").eq("run_id", runId).order("captured_at"),
        supabase.from("research_refusals").select("*").eq("plan_id", run.data.plan_id).order("refused_at", { ascending: false }),
        supabase.from("research_plans").select("*").eq("id", run.data.plan_id).single(),
      ]);
      for (const r of [caps, refusals, plan]) if (r.error) throw r.error;
      return { run: run.data, caps: caps.data ?? [], refusals: refusals.data ?? [], plan: plan.data! };
    },
  });
  if (q.error) return <Refusal text={errText(q.error)} />;
  if (!q.data) return <p className="text-muted-foreground text-sm">Loading run…</p>;
  const { run, caps, refusals, plan } = q.data;
  const versions = [...new Set(caps.map((c) => c.fstd001_version))];

  return (
    <div className="space-y-5">
      <Link to="/research" className="text-muted-foreground inline-flex min-h-11 items-center gap-1 text-sm hover:underline"><ChevronLeft className="size-4" /> Research</Link>
      <header>
        <p className="kicker mb-2">Research run · {run.type}</p>
        <h1 className="flex flex-wrap items-center gap-3 text-2xl font-semibold"><span className="font-mono">{run.id.slice(0, 8)}</span> <PlanChip status={run.status} /></h1>
        <p className="text-muted-foreground mt-1 text-sm">Cycle {plan.cycle} · {run.captured} captured · {run.in_vault} in vault · started {formatDateTime(run.started_at)}</p>
        {run.captured !== run.in_vault ? <p className="mt-2 text-sm"><span className="font-semibold">Delivery blocked:</span> captured ({run.captured}) must equal in vault ({run.in_vault}).</p> : null}
      </header>

      <section className="panel p-5" aria-labelledby="pipe">
        <h2 id="pipe" className="mb-3 font-semibold">Pipeline</h2>
        <ol className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {PIPELINE.map((s, i) => {
            const n = caps.filter(s.done).length;
            return (
              <li key={s.id} className="rounded-lg border p-3 text-sm">
                <p className="text-muted-foreground text-xs">Step {i + 1}</p>
                <p className="font-semibold">{s.label}</p>
                <p>{n} of {caps.length}</p>
              </li>
            );
          })}
        </ol>
      </section>

      <section className="panel overflow-hidden" aria-labelledby="caps">
        <h2 id="caps" className="border-b px-5 py-4 font-semibold">Captures</h2>
        {caps.length === 0 ? <p className="text-muted-foreground p-5 text-sm">No captures reported yet.</p> : null}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted text-left text-xs">
              <tr><th className="px-3 py-2">Item</th>{PIPELINE.map((s) => <th key={s.id} className="px-3 py-2">{s.label}</th>)}<th className="px-3 py-2">Tier</th><th className="px-3 py-2">FA-STD-001</th></tr>
            </thead>
            <tbody className="divide-y">
              {caps.map((c) => (
                <tr key={c.id} className="align-top">
                  <td className="max-w-64 px-3 py-2">
                    {c.evidence_ref_id ? (
                      <p className="flex items-center gap-1 text-xs font-semibold"><House className="size-3.5" aria-hidden /> Stays in the vault</p>
                    ) : null}
                    <p className="font-mono text-xs break-all">{c.item_ref}</p>
                    <p className="text-muted-foreground font-mono text-[11px] break-all">{c.sha256_at_capture}</p>
                    <p className="text-muted-foreground text-xs">{[c.platform, c.item_type, c.language, c.connector_key && `${c.connector_key} v${c.connector_version}`].filter(Boolean).join(" · ")}</p>
                    {c.requirement_ref ? (
                      <p className="text-xs"><span className="font-semibold">{c.requirement_ref}</span>{c.collector ? ` · ${c.collector}` : ""}{c.captured_at_utc ? ` · ${c.captured_at_utc.replace("+00:00", "Z")} UTC` : ""}</p>
                    ) : null}
                    {c.darknight_path ? (
                      <p className="text-muted-foreground font-mono text-[11px] break-all" title="Sample naming: FA-STD-001 not final">DarkNight: {c.darknight_path}</p>
                    ) : null}
                  </td>
                  {PIPELINE.map((s) => {
                    const ok = s.done(c);
                    return (
                      <td key={s.id} className="px-3 py-2 text-xs whitespace-nowrap">
                        {ok ? <CheckCircle2 className="text-positive inline size-4" aria-hidden /> : <CircleDashed className="text-muted-foreground inline size-4" aria-hidden />} {ok ? "Done" : "Pending"}
                      </td>
                    );
                  })}
                  <td className="px-3 py-2">{c.tier ? <Chip>{TIER_LABEL[c.tier] ?? c.tier}</Chip> : <span className="text-xs">Not set</span>}</td>
                  <td className="px-3 py-2">{fstdCompliant(c) ? <Chip tone="bg-done text-done-foreground"><span aria-hidden className="size-1.5 rounded-full bg-current" />Compliant</Chip> : <Chip tone="bg-warn text-warn-foreground"><span aria-hidden className="size-1.5 rounded-full bg-current" />Needs action</Chip>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel p-5" aria-labelledby="fstd">
        <h2 id="fstd" className="font-semibold">FA-STD-001</h2>
        <p className="mt-2 text-sm">Standard version{versions.length === 1 ? "" : "s"} recorded: {versions.length ? versions.join(", ") : "none yet"}.</p>
        <p className="text-muted-foreground mt-1 text-sm">A capture is compliant when its hash, verified vault write (hash re-checked on write), custody event, second-person check by someone other than the capturer, and tier are all recorded. The standard's full text is added later.</p>
        <p className="text-muted-foreground mt-1 text-sm">Home-vault records are listed by reference and hash only; their files stay in the vault.</p>
      </section>

      <section className="panel p-5" aria-labelledby="ref">
        <h2 id="ref" className="font-semibold">Refused jobs and captures</h2>
        {refusals.length === 0 ? <p className="text-muted-foreground mt-2 text-sm">None.</p> : (
          <ul className="mt-2 divide-y text-sm">
            {refusals.map((r) => (
              <li key={r.id} className="py-2"><span className="font-semibold">{r.kind === "job" ? "Job" : "Capture"} refused:</span> {r.reason}{r.connector_key ? ` · ${r.connector_key}` : ""} <span className="text-muted-foreground">· {formatDateTime(r.refused_at)}</span></li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
