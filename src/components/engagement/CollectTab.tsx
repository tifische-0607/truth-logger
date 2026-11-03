import { Link } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { Section, TextIn, csvList } from "@/components/engagement/ui";
import { Check, PlanChip, PlanControls, Refusal, VaultPanel } from "@/components/research/ResearchBits";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { formatDate, formatDateTime } from "@/lib/format";
import type { Workspace } from "@/lib/projects";
import { JOB_TYPES, RUN_STEPS, errText, planStatus, useReadiness, useResearchForProject } from "@/lib/research";
import { cn } from "@/lib/utils";

const CAN_START = ["owner", "curator", "engagement_lead", "collection_operator"];
const CAN_DRAFT = [...CAN_START, "lead_analyst"];

export function CollectTab({ ws }: { ws: Workspace }) {
  const pid = ws.project.id;
  const cycle = Math.max(1, ...ws.cycles.map((c) => c.cycle_no));
  const r = useResearchForProject(pid);
  const ready = useReadiness(pid, cycle);
  const qc = useQueryClient();
  const isMgmt = ws.me.isManagement;
  const canStart = ws.has(...CAN_START) && !isMgmt;
  const canDraft = ws.has(...CAN_DRAFT) && !isMgmt;

  const plans = (r.data?.plans ?? []).filter((p) => p.cycle === cycle);
  const plan = plans.find((p) => !["loaded", "stopped", "failed"].includes(p.status)) ?? plans[0] ?? null;
  const runs = (r.data?.runs ?? []).filter((x) => plan && x.plan_id === plan.id);
  const refused = (r.data?.refusals ?? []).filter((x) => plan && x.plan_id === plan.id);
  const totals = runs.reduce(
    (a, x) => ({ expected: a.expected + x.expected, captured: a.captured + x.captured, in_vault: a.in_vault + x.in_vault }),
    { expected: 0, captured: 0, in_vault: 0 },
  );

  const rd = ready.data;
  const checks = rd
    ? [
        { ok: rd.g1, label: "Mandate confirmed (G1 signed)" },
        { ok: rd.g2, label: "Design approved (G2 signed)" },
        { ok: rd.design_current, label: "Design is current (not stale)" },
        { ok: rd.no_pending_amendment, label: "No amendment awaiting the Curator" },
        { ok: rd.vault_online, label: `Home vault online (report within ${rd.vault_window_minutes} min)` },
        { ok: rd.cycle_free, label: `Cycle ${cycle} has no other active plan` },
      ]
    : [];
  const done = checks.filter((c) => c.ok).length;

  const [err, setErr] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const refresh = () => void qc.invalidateQueries({ queryKey: ["research"] });

  const start = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("research_start_plan", { _plan: plan!.id });
      if (error) throw error;
    },
    onSuccess: () => {
      setErr(null);
      setConfirm(false);
      refresh();
    },
    onError: (e) => setErr(errText(e)),
  });
  const mirror = useMutation({
    mutationFn: async (v: boolean) => {
      const { error } = await supabase.from("research_plans").update({ cloud_mirror: v }).eq("id", plan!.id);
      if (error) throw error;
    },
    onSuccess: refresh,
    onError: (e) => setErr(errText(e)),
  });

  const startBlocked = !plan
    ? "Draft a plan first"
    : plan.status !== "draft"
      ? `This plan is ${planStatus(plan.status).label.toLowerCase()}`
      : !canStart
        ? isMgmt
          ? "FA Management cannot plan, start or stop research"
          : "Only the collection operator, engagement lead or Curator can start research"
        : rd?.block_reason ?? null;

  return (
    <div className="space-y-5">
      <Section
        id="collect-ready"
        title={`Readiness · cycle ${cycle}`}
        hint="The database checks every item again when you press Start research."
      >
        <div className="mb-3 flex items-center gap-3">
          <div className="bg-muted h-2.5 flex-1 overflow-hidden rounded-full" role="progressbar" aria-valuemin={0} aria-valuemax={checks.length || 6} aria-valuenow={done} aria-label="Readiness">
            <div className="bg-primary h-full" style={{ width: `${checks.length ? (done / checks.length) * 100 : 0}%` }} />
          </div>
          <span className="text-sm font-semibold">{done} of {checks.length || 6} ready</span>
        </div>
        <div className="grid gap-4 md:grid-cols-[1fr_280px]">
          <ul>{checks.map((c) => <Check key={c.label} ok={c.ok}>{c.label}</Check>)}</ul>
          <VaultPanel />
        </div>
      </Section>

      <Section
        id="collect-plan"
        title="Research plan"
        hint="Locked once started: the facts below and the plan hash cannot change after Start."
        actions={plan ? <PlanChip status={plan.status} /> : null}
      >
        {plan ? (
          <div className="space-y-4">
            <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
              <Fact k="Brief version" v={`v${plan.brief_version}`} />
              <Fact k="Design version" v={`v${plan.design_version}`} />
              <Fact k="Lexicon version" v={plan.lexicon_version} />
              <Fact k="Approved sources" v={plan.approved_sources.join(", ")} />
              <Fact k="Job types" v={plan.job_types.map((j) => JOB_TYPES.find((t) => t.id === j)?.label ?? j).join(", ")} />
              <Fact k="Window" v={`${formatDate(plan.window_from)} to ${formatDate(plan.window_to)}`} />
              <Fact k="Cadence" v={plan.cadence} />
              <Fact k="Primary vault" v="Home vault" />
              <Fact k="Plan hash" v={plan.plan_sha256 ?? "Recorded at Start"} mono />
            </dl>
            <label className="flex min-h-11 items-center gap-3 text-sm">
              <Checkbox
                checked={plan.cloud_mirror}
                disabled={plan.status !== "draft" || !canDraft || mirror.isPending}
                onCheckedChange={(v) => mirror.mutate(v === true)}
              />
              <span>
                Mirror to Cloud Vault <span className="text-muted-foreground">({plan.status === "draft" ? "optional, before start" : "fixed at start"})</span>
              </span>
            </label>
            {plan.status_reason ? <p className="text-sm"><span className="font-semibold">Reason recorded:</span> {plan.status_reason}</p> : null}
            <PlanControls plan={plan} can={canStart} />
          </div>
        ) : (
          <DraftPlan ws={ws} cycle={cycle} can={canDraft} onDone={refresh} />
        )}
      </Section>

      {plan ? (
        <Section id="collect-status" title="Run status">
          <ol className="flex flex-wrap gap-2" aria-label="Research steps">
            {RUN_STEPS.map((s) => {
              const order = RUN_STEPS.indexOf(plan.status === "locked" ? "queued" : (plan.status as (typeof RUN_STEPS)[number]));
              const here = RUN_STEPS.indexOf(s);
              const state = order < 0 ? "other" : here < order ? "done" : here === order ? "now" : "later";
              return (
                <li key={s} className={cn("rounded-lg border px-3 py-2 text-sm", state === "now" && "border-primary font-semibold")}>
                  {planStatus(s).label} · <span className="text-muted-foreground">{state === "done" ? "Done" : state === "now" ? "Now" : state === "later" ? "Next" : "—"}</span>
                </li>
              );
            })}
          </ol>
          {["paused", "stopped", "failed"].includes(plan.status) ? (
            <p className="mt-2 text-sm">Current state: <PlanChip status={plan.status} /></p>
          ) : null}
        </Section>
      ) : null}

      {plan ? (
        <Section id="collect-back" title="What comes back" hint="Counts come only from the collection device through the worker API.">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Count k="Expected" v={totals.expected} />
            <Count k="Captured" v={totals.captured} />
            <Count k="In vault" v={totals.in_vault} />
            <Count k="Refused" v={refused.length} />
          </div>
          {totals.captured !== totals.in_vault ? (
            <p className="mt-3 text-sm"><span className="font-semibold">Delivery blocked:</span> captured ({totals.captured}) must equal in vault ({totals.in_vault}).</p>
          ) : null}
          {runs.length ? (
            <ul className="mt-4 divide-y rounded-lg border">
              {runs.map((x) => (
                <li key={x.id}>
                  <Link to="/research/runs/$runId" params={{ runId: x.id }} className="hover:bg-muted flex min-h-12 flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm">
                    <span className="font-mono text-xs">{x.id.slice(0, 8)} · {x.type}</span>
                    <span>{x.captured} captured · {x.in_vault} in vault</span>
                    <PlanChip status={x.status} />
                  </Link>
                </li>
              ))}
            </ul>
          ) : <p className="text-muted-foreground mt-3 text-sm">No runs yet.</p>}
        </Section>
      ) : null}

      <Section id="collect-start" title="Ready to start">
        <ul className="mb-3">
          <Check ok={!!plan}>A research plan is drafted</Check>
          <Check ok={!!rd && !rd.block_reason}>Every readiness check passes</Check>
          <Check ok={canStart}>You can start research on this engagement</Check>
        </ul>
        <Button className="min-h-11" disabled={!!startBlocked} onClick={() => { setErr(null); setConfirm(true); }}>
          Start research
        </Button>
        {startBlocked ? <p className="text-muted-foreground mt-2 text-sm">Not available: {startBlocked}</p> : null}
        <div className="mt-2"><Refusal text={confirm ? null : err} /></div>
        <Dialog open={confirm} onOpenChange={setConfirm}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Start research for cycle {cycle}?</DialogTitle>
              <DialogDescription>
                Starting locks the plan and records its hash. Nothing in the plan can be edited afterwards.
                {plan?.cloud_mirror ? " Captures cleared for off-home storage will be mirrored to the Cloud Vault." : " Captures stay in the home vault only."}
              </DialogDescription>
            </DialogHeader>
            <Refusal text={err} />
            <DialogFooter>
              <Button variant="outline" className="min-h-11" onClick={() => setConfirm(false)}>Cancel</Button>
              <Button className="min-h-11" disabled={start.isPending} onClick={() => start.mutate()}>
                {start.isPending ? "Starting…" : "Start and lock plan"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </Section>

      <Section id="collect-who" title="Who does what">
        <ul className="grid gap-2 text-sm sm:grid-cols-2">
          <li><span className="font-semibold">Collection operator, engagement lead, Curator:</span> draft, start, pause, resume and stop (stop needs a reason).</li>
          <li><span className="font-semibold">Collection device:</span> claims jobs, posts captures with SHA-256, reports vault writes and status. Only it can write capture events.</li>
          <li><span className="font-semibold">Evidence officer:</span> second-person check (not the capturer) and evidence tier.</li>
          <li><span className="font-semibold">Data steward:</span> records the reconciled load that opens Reading.</li>
          <li><span className="font-semibold">FA Management:</span> read only; cannot start or stop research.</li>
        </ul>
      </Section>

      {refused.length ? (
        <Section id="collect-refused" title="Refused jobs and captures" hint="Refused items are logged and never queued or stored.">
          <ul className="divide-y text-sm">
            {refused.slice(0, 10).map((x) => (
              <li key={x.id} className="py-2"><span className="font-semibold">{x.kind === "job" ? "Job" : "Capture"} refused:</span> {x.reason} <span className="text-muted-foreground">· {formatDateTime(x.refused_at)}</span></li>
            ))}
          </ul>
        </Section>
      ) : null}
    </div>
  );
}

function Fact({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-muted-foreground text-xs">{k}</dt>
      <dd className={cn("font-medium break-all", mono && "font-mono text-xs")}>{v}</dd>
    </div>
  );
}

function Count({ k, v }: { k: string; v: number }) {
  return (
    <div className="bg-muted rounded-lg p-3">
      <p className="text-muted-foreground text-xs">{k}</p>
      <p className="text-2xl font-semibold">{v}</p>
    </div>
  );
}

function DraftPlan({ ws, cycle, can, onDone }: { ws: Workspace; cycle: number; can: boolean; onDone: () => void }) {
  const [sources, setSources] = useState("");
  const [types, setTypes] = useState<string[]>(["monitor"]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [cadence, setCadence] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("research_plans").insert({
        engagement_id: ws.project.id,
        cycle,
        approved_sources: csvList(sources),
        job_types: types,
        window_from: from,
        window_to: to,
        cadence,
        // fixed by the database from the design and brief in force
        design_version: 0,
        brief_version: 0,
        lexicon_version: "",
      });
      if (error) throw error;
    },
    onSuccess: () => { setErr(null); onDone(); },
    onError: (e) => setErr(errText(e)),
  });
  if (!can) return <p className="text-muted-foreground text-sm">No plan yet. The collection operator, engagement lead, lead analyst or Curator drafts it.</p>;
  return (
    <div className="space-y-3">
      <p className="text-muted-foreground text-sm">Design, lexicon and brief versions are taken by the database from what is in force; research never changes them.</p>
      <TextIn label="Approved sources (comma-separated)" value={sources} onChange={setSources} placeholder="facebook, tiktok" />
      <fieldset className="grid gap-1">
        <legend className="mb-1 text-sm font-medium">Job types</legend>
        {JOB_TYPES.map((t) => (
          <label key={t.id} className="flex min-h-11 items-center gap-3 text-sm">
            <Checkbox checked={types.includes(t.id)} onCheckedChange={(v) => setTypes((s) => (v === true ? [...s, t.id] : s.filter((x) => x !== t.id)))} />
            {t.label}
          </label>
        ))}
      </fieldset>
      <div className="grid gap-3 sm:grid-cols-3">
        <TextIn label="Window from" type="date" value={from} onChange={setFrom} />
        <TextIn label="Window to" type="date" value={to} onChange={setTo} />
        <TextIn label="Cadence" value={cadence} onChange={setCadence} placeholder="Daily" />
      </div>
      <Refusal text={err} />
      <Button className="min-h-11" disabled={save.isPending} onClick={() => save.mutate()}>Draft plan</Button>
    </div>
  );
}
