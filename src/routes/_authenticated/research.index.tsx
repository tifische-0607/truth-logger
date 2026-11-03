import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { PlanChip, PlanControls, Refusal, VaultPanel } from "@/components/research/ResearchBits";
import { Chip } from "@/components/engagement/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { hubHead } from "@/lib/hub";
import { useMe } from "@/lib/projects";
import { errText, fstdCompliant } from "@/lib/research";

export const Route = createFileRoute("/_authenticated/research/")({
  head: () => hubHead("Research", "All research runs, vault status, connectors and FA-STD-001 checks."),
  component: ResearchPage,
});

function ResearchPage() {
  const me = useMe();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["research", "all"],
    queryFn: async () => {
      const [plans, runs, caps, refusals, connectors, projects] = await Promise.all([
        supabase.from("research_plans").select("*").order("created_at", { ascending: false }),
        supabase.from("research_runs").select("*").order("started_at", { ascending: false }),
        supabase.from("research_captures").select("*"),
        supabase.from("research_refusals").select("id, connector_key, refused_at"),
        supabase.from("research_connectors").select("*").order("key"),
        supabase.from("projects").select("id, code, name"),
      ]);
      for (const r of [plans, runs, caps, refusals, connectors, projects]) if (r.error) throw r.error;
      return {
        plans: plans.data ?? [], runs: runs.data ?? [], caps: caps.data ?? [], refusals: refusals.data ?? [],
        connectors: connectors.data ?? [], projects: new Map((projects.data ?? []).map((p) => [p.id, p])),
      };
    },
  });
  const d = q.data;
  const active = d?.plans.filter((p) => ["queued", "running", "paused", "locked"].includes(p.status)) ?? [];
  const compliant = d?.caps.filter(fstdCompliant).length ?? 0;
  const total = d?.caps.length ?? 0;
  const homeOnly = d?.caps.filter((c) => !!c.evidence_ref_id).length ?? 0;

  const [reason, setReason] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);
  const setConn = useMutation({
    mutationFn: async (v: { key: string; status: string }) => {
      const { error } = await supabase.rpc("research_set_connector", { _key: v.key, _status: v.status, _reason: reason[v.key] ?? "" });
      if (error) throw error;
    },
    onSuccess: () => { setErr(null); void qc.invalidateQueries({ queryKey: ["research"] }); },
    onError: (e) => setErr(errText(e)),
  });

  return (
    <div className="space-y-5">
      <header>
        <p className="kicker mb-2">Research</p>
        <h1 className="text-2xl font-semibold">Research runs</h1>
        <p className="text-muted-foreground mt-1 max-w-2xl text-sm">
          Every run across engagements you can see. Collection happens on FA's own devices; this screen only shows what they report.
        </p>
      </header>
      {q.error ? <Refusal text={errText(q.error)} /> : null}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Tile k="Active plans" v={active.length} />
        <Tile k="Runs" v={d?.runs.length ?? 0} />
        <Tile k="Captures" v={total} />
        <Tile k="Refused" v={d?.refusals.length ?? 0} />
        <div className="col-span-2 lg:col-span-1"><VaultPanel /></div>
      </div>

      <section className="panel p-5" aria-labelledby="fstd">
        <h2 id="fstd" className="font-semibold">FA-STD-001 checks</h2>
        <p className="mt-2 text-sm"><span className="font-semibold">{compliant}</span> of {total} captures compliant · <span className="font-semibold">{total - compliant}</span> need action · {homeOnly} reference home-vault records (stay in the vault).</p>
        <p className="text-muted-foreground mt-1 text-xs">Compliant means hash, verified vault write, custody event, second-person check by someone other than the capturer, tier and standard version are all recorded.</p>
      </section>

      <section className="panel overflow-hidden" aria-labelledby="runs">
        <h2 id="runs" className="border-b px-5 py-4 font-semibold">All runs</h2>
        {d && d.runs.length === 0 ? <p className="text-muted-foreground p-5 text-sm">No runs yet.</p> : null}
        {d && d.runs.length > 0 ? <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted text-left text-xs"><tr><th className="px-4 py-2">Engagement</th><th className="px-4 py-2">Run</th><th className="px-4 py-2">Counts</th><th className="px-4 py-2">Status</th></tr></thead>
            <tbody className="divide-y">
              {d?.runs.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-2">{d.projects.get(r.project_id)?.code ?? "—"}</td>
                  <td className="px-4 py-2"><Link to="/research/runs/$runId" params={{ runId: r.id }} className="inline-flex min-h-11 items-center font-mono text-xs font-semibold hover:underline">{r.id.slice(0, 8)} · {r.type}</Link></td>
                  <td className="px-4 py-2">{r.captured} captured · {r.in_vault} in vault{r.expected ? ` · ${r.expected} expected` : ""}</td>
                  <td className="px-4 py-2"><PlanChip status={r.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div> : null}
      </section>

      {active.length ? (
        <section className="panel p-5" aria-labelledby="active">
          <h2 id="active" className="mb-3 font-semibold">Active plans</h2>
          <ul className="space-y-4">
            {active.map((p) => (
              <li key={p.id} className="space-y-2 rounded-lg border p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Link to="/projects/$projectId" params={{ projectId: p.engagement_id }} search={{ tab: "collect" }} className="font-semibold hover:underline">{d?.projects.get(p.engagement_id)?.code} · cycle {p.cycle}</Link>
                  <PlanChip status={p.status} />
                  <span className="text-muted-foreground font-mono text-xs break-all">{p.plan_sha256}</span>
                </div>
                <PlanControls plan={p} can={!me.data?.isManagement} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="panel p-5" aria-labelledby="conn">
        <h2 id="conn" className="font-semibold">Connectors</h2>
        <p className="text-muted-foreground mt-1 text-xs">Every connector delivers the same standard item shape. A connector is suspended automatically after repeated rejected items. No connection is made from this app.</p>
        <Refusal text={err} />
        <ul className="mt-3 space-y-3">
          {d?.connectors.map((c) => {
            const rejected = d.refusals.filter((r) => r.connector_key === c.key && Date.parse(r.refused_at) > Date.now() - c.reject_window_minutes * 60_000).length;
            return (
              <li key={c.key} className="rounded-lg border p-4 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{c.name}</span><span className="text-muted-foreground">v{c.version}</span>
                  <Chip tone={c.status === "active" ? "bg-done text-done-foreground" : "bg-failed text-failed-foreground"}><span aria-hidden className="size-1.5 rounded-full bg-current" />{c.status === "active" ? "Active" : "Suspended"}</Chip>
                </div>
                <p className="text-muted-foreground mt-1">Platforms: {c.platforms.join(", ")} · Rejected in last {c.reject_window_minutes} min: {rejected} of {c.reject_limit} allowed</p>
                {c.status_reason ? <p className="mt-1">Reason: {c.status_reason}</p> : null}
                {me.data?.isOwner || me.data?.isCurator ? (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <Input className="min-h-11 max-w-sm" placeholder="Reason (required)" aria-label={`Reason for ${c.name}`} value={reason[c.key] ?? ""} onChange={(e) => setReason((s) => ({ ...s, [c.key]: e.target.value }))} />
                    <Button variant="outline" className="min-h-11" disabled={setConn.isPending} onClick={() => setConn.mutate({ key: c.key, status: c.status === "active" ? "suspended" : "active" })}>
                      {c.status === "active" ? "Suspend" : "Restore"}
                    </Button>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}

function Tile({ k, v }: { k: string; v: number }) {
  return (
    <div className="panel p-4">
      <p className="text-muted-foreground text-xs">{k}</p>
      <p className="text-2xl font-semibold">{v}</p>
    </div>
  );
}
