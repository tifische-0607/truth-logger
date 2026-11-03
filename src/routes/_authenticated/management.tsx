import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/AppShell";
import { Chip, Section } from "@/components/engagement/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { hubHead } from "@/lib/hub";
import { roleLabel, useMe } from "@/lib/projects";
import { CLOCK_STATUS, clockBarPct, type ClockStatus } from "@/lib/sla";
import {
  PHASES, PHASE_NAMES, counts, filterClocks, kpiCsv, needsAttention, openClock, phaseStats, samplePortfolio, worstStatus,
  type MgmtClock, type Portfolio,
} from "@/lib/management";
import { cn } from "@/lib/utils";

const PILLS = ["Overview", "Clients", "Phases", "SOPs and KPIs"] as const;
type Pill = (typeof PILLS)[number];
const str = (v: unknown) => (typeof v === "string" && v ? v : undefined);

export const Route = createFileRoute("/_authenticated/management")({
  validateSearch: (r: Record<string, unknown>): { pill?: string | undefined; phase?: string | undefined; client?: string | undefined; preview?: string | undefined } =>
    ({ pill: str(r['pill']), phase: str(r['phase']), client: str(r['client']), preview: str(r['preview']) }),
  head: () => hubHead("Management", "FA Portal Management: portfolio turnaround, clients, phases and SOPs."),
  component: Management,
});

type Sop = { id: string; phase: number; version: number; owner_role: string; target_working_days: number; warn_pct: number; escalation_chain: string[]; steps: unknown; is_sample: boolean };
const errText = (e: unknown) => (e && typeof e === "object" && "message" in e ? String((e as { message: unknown }).message) : String(e));

function StatusChip({ s }: { s: ClockStatus }) {
  const m = CLOCK_STATUS[s];
  return <Chip tone={m.tone}><span className={cn("size-2 rounded-full", m.dot)} aria-hidden /> {m.label}</Chip>;
}

function useSops() {
  return useQuery({
    queryKey: ["sops-latest"],
    queryFn: async () => {
      const { data, error } = await supabase.from("sop_definitions").select("*").order("phase").order("version", { ascending: false });
      if (error) throw error;
      const latest = new Map<number, Sop>();
      for (const s of (data ?? []) as Sop[]) if (!latest.has(s.phase)) latest.set(s.phase, s);
      return latest;
    },
  });
}

function Management() {
  const me = useMe();
  const raw = Route.useSearch();
  const navigate = useNavigate({ from: "/management" });
  const pill = (PILLS as readonly string[]).includes(raw.pill ?? "") ? (raw.pill as Pill) : "Overview";
  const allowed = !!(me.data?.isOwner || me.data?.isManagement);
  const sample = allowed && raw.preview === "sample";
  const live = useQuery({
    queryKey: ["mgmt-portfolio"],
    enabled: allowed && !sample,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("mgmt_portfolio");
      if (error) throw error;
      return data as unknown as Portfolio;
    },
  });
  const sops = useSops();
  const set = (p: Partial<typeof raw>) => void navigate({ search: (prev) => ({ ...prev, ...p }) });

  if (me.isLoading) return <p className="text-muted-foreground text-sm">Loading…</p>;
  if (!allowed)
    return <><PageHeader title="Management" /><p role="alert" className="bg-muted rounded-lg px-4 py-3 text-sm">Management is open to Management and the owner only.</p></>;

  const p = sample ? samplePortfolio() : live.data;
  return (
    <>
      <PageHeader
        kicker="Management"
        title="Management"
        subtitle="Read-only view of turnaround across every engagement. Gates, readings, research and releases are signed elsewhere by their owners."
        actions={
          <Button variant="outline" className="min-h-11" onClick={() => set({ preview: sample ? undefined : "sample" })}>
            {sample ? "Leave Sample preview" : "Open Sample preview"}
          </Button>
        }
      />
      {sample ? <p role="note" className="bg-warn text-warn-foreground mb-5 rounded-lg px-4 py-3 text-sm font-semibold">Sample preview: made-up engagements for review only. Nothing here is saved.</p> : null}
      <nav aria-label="Management sections" className="mb-6 flex flex-wrap gap-2">
        {PILLS.map((x) => (
          <Button key={x} variant={x === pill ? "default" : "outline"} aria-current={x === pill ? "page" : undefined} className="min-h-11 rounded-full" onClick={() => set({ pill: x, client: undefined })}>
            {x}
          </Button>
        ))}
      </nav>
      {live.error && !sample ? <p role="alert" className="bg-muted rounded-lg px-4 py-3 text-sm">{errText(live.error)}</p> : null}
      {!p ? <p className="text-muted-foreground text-sm">{live.isLoading ? "Loading portfolio…" : ""}</p> : (
        <>
          {pill === "Overview" && <Overview p={p} sample={sample} />}
          {pill === "Clients" && <Clients p={p} sample={sample} selected={raw.client} onOpen={(id) => set({ client: id })} />}
          {pill === "Phases" && <Phases p={p} sops={sops.data} sample={sample} phase={Number(raw.phase ?? 0)} onPhase={(n) => set({ phase: String(n) })} />}
          {pill === "SOPs and KPIs" && <SopsKpis p={p} sops={sops.data} />}
        </>
      )}
    </>
  );
}

function EngLink({ id, sample, children }: { id: string; sample: boolean; children: React.ReactNode }) {
  if (sample) return <span className="text-muted-foreground text-sm">{children} (Sample)</span>;
  return <Link to="/projects/$projectId" params={{ projectId: id }} search={{ tab: "overview" }} className="text-primary inline-flex min-h-11 items-center font-semibold underline-offset-4 hover:underline">{children}</Link>;
}

function Overview({ p, sample }: { p: Portfolio; sample: boolean }) {
  const c = counts(p);
  const att = needsAttention(p);
  const eng = new Map(p.engagements.map((e) => [e.id, e]));
  const tiles: [string, number][] = [["Active", c.active], ["On track", c.on_track], ["At risk", c.at_risk], ["Breached", c.breached], ["Paused", c.paused]];
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {tiles.map(([l, n]) => <div key={l} className="panel p-4"><p className="text-muted-foreground text-sm">{l}</p><p className="font-display text-2xl font-medium">{n}</p></div>)}
      </div>
      <Section id="perf" title="Phase performance" hint="Working days, computed from recorded clocks.">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead><tr className="text-left"><th className="py-2">Phase</th><th>Median days</th><th>On-time rate</th><th>In phase now</th><th>Breached</th></tr></thead>
            <tbody className="divide-y">
              {PHASES.map((ph) => { const s = phaseStats(p, ph, 0); return (
                <tr key={ph}><td className="py-2">{ph} · {PHASE_NAMES[ph]}</td><td>{s.median ?? "—"}</td><td>{s.onTimeRate == null ? "—" : `${s.onTimeRate}%`}</td><td>{s.inPhase}</td><td>{s.breached}</td></tr>
              ); })}
            </tbody>
          </table>
        </div>
      </Section>
      <Section id="heat" title="Portfolio heat map" hint="Current cell shows working days used over target, coloured by status. Future phases are dashed.">
        {p.engagements.length === 0 ? <p className="text-muted-foreground text-sm">No engagements yet.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-separate border-spacing-1 text-xs">
              <thead><tr><th className="text-left">Engagement</th>{PHASES.map((ph) => <th key={ph} scope="col">{ph}</th>)}</tr></thead>
              <tbody>
                {p.engagements.map((e) => {
                  const cur = openClock(p, e.id);
                  return (
                    <tr key={e.id}>
                      <th scope="row" className="pr-2 text-left font-semibold whitespace-nowrap">{e.code}</th>
                      {PHASES.map((ph) => {
                        const done = p.clocks.filter((k) => k.project_id === e.id && k.phase === ph && k.completed_at).at(-1);
                        if (cur && cur.phase === ph) { const m = CLOCK_STATUS[cur.status]; return <td key={ph} className={cn("rounded-md px-1 py-2 text-center font-semibold", m.tone)} title={m.label}><span className={cn("mr-1 inline-block size-2 rounded-full", m.dot)} aria-hidden />{cur.used}/{cur.target}<span className="sr-only"> {m.label}</span></td>; }
                        if (done) return <td key={ph} className="bg-muted rounded-md px-1 py-2 text-center">{done.used}/{done.target}</td>;
                        return <td key={ph} className="rounded-md border border-dashed px-1 py-2 text-center text-muted-foreground" aria-label="Not started">·</td>;
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>
      <Section id="attention" title="Needs attention">
        {att.length === 0 ? <p className="text-muted-foreground text-sm">Nothing is at risk or breached.</p> : (
          <ul className="divide-y">
            {att.map((k) => { const e = eng.get(k.project_id); return (
              <li key={k.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2"><span className="font-semibold">{e?.code} · {e?.name}</span><StatusChip s={k.status} /></div>
                  <p className="text-muted-foreground text-sm">Phase {k.phase} · {k.used} of {k.target} working days · Owner {roleLabel(k.owner_role)} · Escalates to {k.escalation_chain.map(roleLabel).join(", ") || "—"}</p>
                </div>
                {e ? <EngLink id={e.id} sample={sample}>Open</EngLink> : null}
              </li>
            ); })}
          </ul>
        )}
      </Section>
    </div>
  );
}

function Clients({ p, sample, selected, onOpen }: { p: Portfolio; sample: boolean; selected?: string | undefined; onOpen: (id: string | undefined) => void }) {
  const c = p.clients.find((x) => x.id === selected);
  if (c) {
    const es = p.engagements.filter((e) => e.client_id === c.id);
    return (
      <div className="space-y-4">
        <Button variant="outline" className="min-h-11" onClick={() => onOpen(undefined)}>Back to clients</Button>
        <Section id="client-detail" title={c.name} hint={`${c.code} · ${c.kind === "individual" ? "Individual" : "Organisation"}`}>
          <dl className="grid gap-3 text-sm sm:grid-cols-3">
            <div><dt className="text-muted-foreground">Portal</dt><dd>{c.portal_enabled ? "Enabled" : "Not enabled"}</dd></div>
            <div><dt className="text-muted-foreground">Administrators</dt><dd>{c.admins} of 2</dd></div>
            <div><dt className="text-muted-foreground">Shared documents</dt><dd>{c.shared_documents}</dd></div>
          </dl>
          <ul className="mt-5 divide-y">
            {es.length === 0 ? <li className="text-muted-foreground py-3 text-sm">No engagements.</li> : es.map((e) => { const k = openClock(p, e.id); return (
              <li key={e.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div><p className="font-semibold">{e.code} · {e.name}</p>{k ? <ClockBar k={k} /> : <p className="text-muted-foreground text-sm">No clock running.</p>}</div>
                <EngLink id={e.id} sample={sample}>Open</EngLink>
              </li>
            ); })}
          </ul>
        </Section>
      </div>
    );
  }
  if (!p.clients.length) return <p className="text-muted-foreground text-sm">No clients yet.</p>;
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {p.clients.map((c) => {
        const w = worstStatus(p, c.id);
        const es = p.engagements.filter((e) => e.client_id === c.id);
        return (
          <article key={c.id} className="panel space-y-3 p-5">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-display font-medium">{c.name}</h2>
              <Chip>{c.kind === "individual" ? "Individual" : "Organisation"}</Chip>
              {w ? <StatusChip s={w} /> : null}
              <Chip tone={c.portal_enabled ? undefined : "bg-muted text-foreground"}>Portal {c.portal_enabled ? "on" : "off"}</Chip>
            </div>
            <p className="text-muted-foreground text-sm">{es.length} engagements · {c.shared_documents} shared documents · Administrators {c.admins} of 2</p>
            <ul className="space-y-1 text-sm">
              {es.map((e) => { const k = openClock(p, e.id); return <li key={e.id}>{e.code}: {k ? `Phase ${k.phase}, ${CLOCK_STATUS[k.status].label.toLowerCase()}, ${k.used} of ${k.target} days` : "no clock running"}</li>; })}
            </ul>
            <Button variant="outline" className="min-h-11" onClick={() => onOpen(c.id)}>View client</Button>
          </article>
        );
      })}
    </div>
  );
}

function ClockBar({ k }: { k: MgmtClock }) {
  const m = CLOCK_STATUS[k.status];
  return (
    <div className="mt-1 flex items-center gap-3">
      <div className="bg-muted h-2 w-40 overflow-hidden rounded-full" role="progressbar" aria-valuemin={0} aria-valuemax={k.target} aria-valuenow={k.used} aria-label="Working days used"><div className={cn("h-full", m.bar)} style={{ width: `${clockBarPct(k.used, k.target)}%` }} /></div>
      <span className="text-sm">Phase {k.phase} · {k.used}/{k.target} days</span><StatusChip s={k.status} />
    </div>
  );
}

function Phases({ p, sops, sample, phase, onPhase }: { p: Portfolio; sops: Map<number, Sop> | undefined; sample: boolean; phase: number; onPhase: (n: number) => void }) {
  const ph = PHASES.includes(phase) ? phase : 0;
  const sop = sops?.get(ph);
  const s = phaseStats(p, ph, sop?.target_working_days ?? 0);
  const eng = new Map(p.engagements.map((e) => [e.id, e]));
  const max = Math.max(s.target, ...s.lastFive.map((x) => x.used), 1);
  return (
    <div className="space-y-6">
      <div role="tablist" aria-label="Phases" className="flex flex-wrap gap-2">
        {PHASES.map((n) => <Button key={n} role="tab" aria-selected={n === ph} variant={n === ph ? "default" : "outline"} className="min-h-11 min-w-11" onClick={() => onPhase(n)}>{n}</Button>)}
      </div>
      <h2 className="font-display text-xl font-medium">Phase {ph} · {PHASE_NAMES[ph]}</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {([["Target", sop ? `${sop.target_working_days} days` : "—"], ["Median actual", s.median == null ? "—" : `${s.median} days`], ["On-time rate", s.onTimeRate == null ? "—" : `${s.onTimeRate}%`], ["In phase now", s.inPhase], ["Breached", s.breached]] as [string, string | number][]).map(([l, v]) =>
          <div key={l} className="panel p-4"><p className="text-muted-foreground text-sm">{l}</p><p className="font-display text-xl font-medium">{v}</p></div>)}
      </div>
      <Section id="in-phase" title="Engagements in this phase">
        {s.open.length === 0 ? <p className="text-muted-foreground text-sm">None right now.</p> : <ul className="divide-y">{s.open.map((k) => <li key={k.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div><p className="font-semibold">{eng.get(k.project_id)?.code} · {eng.get(k.project_id)?.name}</p><ClockBar k={k} /></div><EngLink id={k.project_id} sample={sample}>Open</EngLink></li>)}</ul>}
      </Section>
      <Section id="last-five" title="Last five durations" hint="Working days per completed clock. The dashed line is the SOP target.">
        {s.lastFive.length === 0 ? <p className="text-muted-foreground text-sm">No completed clocks yet.</p> : (
          <div className="relative flex h-44 items-end gap-4 border-b pb-1" role="img" aria-label={`Last durations: ${s.lastFive.map((x) => x.used).join(", ")} working days; target ${s.target}`}>
            {s.target > 0 ? <div className="border-foreground/60 absolute inset-x-0 border-t-2 border-dashed" style={{ bottom: `${(100 * s.target) / max}%` }} aria-hidden><span className="bg-background text-muted-foreground absolute -top-3 right-0 px-1 text-xs">Target {s.target}</span></div> : null}
            {s.lastFive.map((x) => <div key={x.id} className="flex flex-1 flex-col items-center justify-end gap-1 h-full"><span className="text-xs font-semibold">{x.used}</span><div className={cn("w-full max-w-12 rounded-t-md", x.used > s.target && s.target > 0 ? "bg-negative" : "bg-primary")} style={{ height: `${(100 * x.used) / max}%` }} /><span className="text-muted-foreground truncate text-xs">{eng.get(x.project_id)?.code}</span></div>)}
          </div>
        )}
      </Section>
      {sop ? <SopCard sop={sop} /> : null}
    </div>
  );
}

function SopCard({ sop }: { sop: Sop }) {
  const steps = Array.isArray(sop.steps) ? (sop.steps as string[]) : [];
  return (
    <article className="panel space-y-2 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-display font-medium">Phase {sop.phase} · {PHASE_NAMES[sop.phase]} <span className="text-muted-foreground text-sm">v{sop.version}</span></h3>
        <div className="flex items-center gap-2">{sop.is_sample ? <Chip>Sample</Chip> : null}<EditSop sop={sop} /></div>
      </div>
      <p className="text-sm">Target {sop.target_working_days} working days · warn at {sop.warn_pct}% · Owner {roleLabel(sop.owner_role)}</p>
      <p className="text-muted-foreground text-sm">Escalates to {sop.escalation_chain.map(roleLabel).join(", ") || "—"}</p>
      {steps.length ? <ol className="list-decimal pl-5 text-sm">{steps.map((s) => <li key={s}>{s}</li>)}</ol> : null}
    </article>
  );
}

function EditSop({ sop }: { sop: Sop }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState(String(sop.target_working_days));
  const [warn, setWarn] = useState(sop.warn_pct);
  const [err, setErr] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("sop_save", { _phase: sop.phase, _target: Number(target), _warn: warn, _owner: sop.owner_role, _chain: sop.escalation_chain, _steps: sop.steps as never });
      if (error) throw error;
    },
    onSuccess: () => { setOpen(false); toast.success(`Phase ${sop.phase} SOP saved as a new version.`); void qc.invalidateQueries({ queryKey: ["sops-latest"] }); void qc.invalidateQueries({ queryKey: ["mgmt-portfolio"] }); },
    onError: (e) => setErr(errText(e)),
  });
  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); setErr(null); setTarget(String(sop.target_working_days)); setWarn(sop.warn_pct); }}>
      <DialogTrigger asChild><Button variant="outline" className="min-h-11">Edit target</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit phase {sop.phase} SOP</DialogTitle>
          <DialogDescription>Saving creates version {sop.version + 1} and records an event. Earlier versions stay on record.</DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); setErr(null); save.mutate(); }}>
          <div className="space-y-1"><Label htmlFor={`t-${sop.phase}`}>Target (1 to 60 working days)</Label><Input id={`t-${sop.phase}`} type="number" min={1} max={60} inputMode="numeric" className="min-h-11" value={target} onChange={(e) => setTarget(e.target.value)} /></div>
          <fieldset className="space-y-2"><legend className="text-sm font-medium">Warn at</legend>
            <div className="flex gap-2">{[70, 80, 90].map((w) => <Button key={w} type="button" variant={w === warn ? "default" : "outline"} aria-pressed={w === warn} className="min-h-11" onClick={() => setWarn(w)}>{w}%</Button>)}</div>
          </fieldset>
          {err ? <p role="alert" className="bg-failed text-failed-foreground rounded-md px-3 py-2 text-sm">{err}</p> : null}
          <DialogFooter><Button type="button" variant="outline" className="min-h-11" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" className="min-h-11" disabled={save.isPending}>{save.isPending ? "Saving…" : "Save new version"}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function SopsKpis({ p, sops }: { p: Portfolio; sops: Map<number, Sop> | undefined }) {
  const [client, setClient] = useState("");
  const [phase, setPhase] = useState("");
  const [owner, setOwner] = useState("");
  const [days, setDays] = useState("");
  const rows = filterClocks(p, { client: client || undefined, phase: phase === "" ? undefined : Number(phase), owner: owner || undefined, days: days ? Number(days) : undefined });
  const done = rows.filter((c) => c.completed_at);
  const used = done.map((c) => c.used).sort((a, b) => a - b);
  const pick = (q: number) => (used.length ? used[Math.min(used.length - 1, Math.ceil(q * used.length) - 1)] : null);
  const owners = [...new Set(p.clocks.map((c) => c.owner_role))];
  const sel = "border-input bg-background min-h-11 rounded-md border px-3 text-sm";
  const copy = async () => { try { await navigator.clipboard.writeText(kpiCsv(p, rows)); toast.success("CSV copied to the clipboard."); } catch { toast.error("Could not copy. Your browser blocked clipboard access."); } };
  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{PHASES.map((n) => { const s = sops?.get(n); return s ? <SopCard key={n} sop={s} /> : null; })}</div>
      <Section id="how" title="How the clock works">
        <ul className="list-disc space-y-1 pl-5 text-sm">
          <li>A clock starts when a phase opens and stops when its gate or exit completes. Phase 5 runs once per cycle.</li>
          <li>Time is counted in working days; weekends and holidays in the calendar are skipped.</li>
          <li>On track below the warn level, At risk from the warn level to the target, Breached above the target.</li>
          <li>Paused only while waiting on the client, recorded by the engagement lead or Management with a reason. Time waiting on FridayAnalytics staff never pauses the clock.</li>
          <li>At risk alerts the SOP owner; a breach also alerts the next role in the escalation chain.</li>
        </ul>
      </Section>
      <Section id="kpis" title="KPIs" hint="Computed from recorded clocks, never typed." actions={<Button variant="outline" className="min-h-11" onClick={copy}>Copy CSV</Button>}>
        <div className="mb-4 grid gap-3 sm:grid-cols-4">
          <label className="text-sm">Client<select className={cn(sel, "mt-1 w-full")} value={client} onChange={(e) => setClient(e.target.value)}><option value="">All</option>{p.clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
          <label className="text-sm">Phase<select className={cn(sel, "mt-1 w-full")} value={phase} onChange={(e) => setPhase(e.target.value)}><option value="">All</option>{PHASES.map((n) => <option key={n} value={n}>{n} · {PHASE_NAMES[n]}</option>)}</select></label>
          <label className="text-sm">Owner role<select className={cn(sel, "mt-1 w-full")} value={owner} onChange={(e) => setOwner(e.target.value)}><option value="">All</option>{owners.map((o) => <option key={o} value={o}>{roleLabel(o)}</option>)}</select></label>
          <label className="text-sm">Period<select className={cn(sel, "mt-1 w-full")} value={days} onChange={(e) => setDays(e.target.value)}><option value="">All time</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option><option value="365">Last 12 months</option></select></label>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          {([["Completed", done.length], ["Median days", pick(0.5) ?? "—"], ["90th percentile", pick(0.9) ?? "—"], ["On-time rate", done.length ? `${Math.round((100 * done.filter((c) => c.used <= c.target).length) / done.length)}%` : "—"], ["Breaches", rows.filter((c) => c.used > c.target).length], ["Paused days", rows.reduce((a, c) => a + c.paused, 0)], ["Clocks", rows.length]] as [string, string | number][]).map(([l, v]) =>
            <div key={l} className="bg-muted rounded-lg p-3"><p className="text-muted-foreground text-xs">{l}</p><p className="font-display text-lg font-medium">{v}</p></div>)}
        </div>
      </Section>
    </div>
  );
}
