import type { ClockStatus } from "@/lib/sla";

export type MgmtClient = { id: string; code: string; name: string; kind: string; portal_enabled: boolean; admins: number; shared_documents: number };
export type MgmtEngagement = { id: string; code: string; name: string; client_id: string; status: string };
export type MgmtClock = {
  id: string; project_id: string; phase: number; cycle_no: number | null; started_at: string; completed_at: string | null;
  owner_role: string; escalation_chain: string[]; status: ClockStatus; used: number; paused: number; target: number; warn_pct: number; pct: number;
};
export type Portfolio = { clients: MgmtClient[]; engagements: MgmtEngagement[]; clocks: MgmtClock[] };

export const PHASES = Array.from({ length: 11 }, (_, i) => i);
export const PHASE_NAMES = ["Intake", "Discovery", "Design", "Cycle open", "Curation", "Collection", "Analysis", "Evidence load", "Drafting", "QA and release", "Close-out"];

/** Status order from best to worst, used for "worst status". */
const RANK: Record<ClockStatus, number> = { closed: 0, on_track: 1, paused: 2, at_risk: 3, breached: 4 };

export const openClock = (p: Portfolio, projectId: string) => p.clocks.find((c) => c.project_id === projectId && !c.completed_at) ?? null;

export function counts(p: Portfolio) {
  const open = p.engagements.map((e) => openClock(p, e.id)).filter((c): c is MgmtClock => !!c);
  const n = (s: ClockStatus) => open.filter((c) => c.status === s).length;
  return { active: open.length, on_track: n("on_track"), at_risk: n("at_risk"), breached: n("breached"), paused: n("paused") };
}

export function worstStatus(p: Portfolio, clientId: string): ClockStatus | null {
  let w: ClockStatus | null = null;
  for (const e of p.engagements.filter((x) => x.client_id === clientId)) {
    const c = openClock(p, e.id);
    if (c && (!w || RANK[c.status] > RANK[w])) w = c.status;
  }
  return w;
}

const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b), m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

export function phaseStats(p: Portfolio, phase: number, target: number) {
  const done = p.clocks.filter((c) => c.phase === phase && c.completed_at).sort((a, b) => a.completed_at!.localeCompare(b.completed_at!));
  const now = p.clocks.filter((c) => c.phase === phase && !c.completed_at);
  const onTime = done.filter((c) => c.used <= c.target).length;
  return {
    target,
    median: median(done.map((c) => c.used)),
    onTimeRate: done.length ? Math.round((100 * onTime) / done.length) : null,
    inPhase: now.length,
    breached: now.filter((c) => c.status === "breached").length + done.filter((c) => c.used > c.target).length,
    lastFive: done.slice(-5).map((c) => ({ id: c.id, used: c.used, project_id: c.project_id })),
    open: now,
  };
}

export function needsAttention(p: Portfolio) {
  return p.clocks
    .filter((c) => !c.completed_at && (c.status === "breached" || c.status === "at_risk"))
    .sort((a, b) => RANK[b.status] - RANK[a.status] || b.pct - a.pct);
}

export type KpiFilter = { client?: string; phase?: number; owner?: string; days?: number };

export function filterClocks(p: Portfolio, f: KpiFilter, nowMs = Date.now()) {
  const byId = new Map(p.engagements.map((e) => [e.id, e]));
  return p.clocks.filter((c) =>
    (!f.client || byId.get(c.project_id)?.client_id === f.client) &&
    (f.phase == null || c.phase === f.phase) &&
    (!f.owner || c.owner_role === f.owner) &&
    (!f.days || nowMs - new Date(c.started_at).getTime() <= f.days * 86_400_000));
}

const csvCell = (v: unknown) => { const s = v == null ? "" : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

export function kpiCsv(p: Portfolio, rows: MgmtClock[]) {
  const byId = new Map(p.engagements.map((e) => [e.id, e]));
  const cl = new Map(p.clients.map((c) => [c.id, c]));
  const head = ["engagement", "client", "phase", "cycle", "owner_role", "started_at", "completed_at", "status", "working_days_used", "paused_days", "target"];
  const body = rows.map((c) => { const e = byId.get(c.project_id); return [e?.code, e ? cl.get(e.client_id)?.name : "", c.phase, c.cycle_no, c.owner_role, c.started_at, c.completed_at, c.status, c.used, c.paused, c.target]; });
  return [head, ...body].map((r) => r.map(csvCell).join(",")).join("\n");
}

/** Sample portfolio for the staff-only review preview. Never written to the database. */
export function samplePortfolio(): Portfolio {
  const clients: MgmtClient[] = [
    { id: "c1", code: "SAMPLE-ACME", name: "Sample Acme Berhad", kind: "organisation", portal_enabled: true, admins: 2, shared_documents: 6 },
    { id: "c2", code: "SAMPLE-NGO", name: "Sample Rights Network", kind: "organisation", portal_enabled: true, admins: 1, shared_documents: 2 },
    { id: "c3", code: "SAMPLE-IND", name: "Sample Individual Client", kind: "individual", portal_enabled: false, admins: 0, shared_documents: 0 },
  ];
  const engagements: MgmtEngagement[] = [
    { id: "e1", code: "SAMPLE-E01", name: "Brand attack review", client_id: "c1", status: "active" },
    { id: "e2", code: "SAMPLE-E02", name: "Harassment escalation", client_id: "c1", status: "active" },
    { id: "e3", code: "SAMPLE-E03", name: "Narrative mapping", client_id: "c2", status: "active" },
    { id: "e4", code: "SAMPLE-E04", name: "Personal reputation", client_id: "c3", status: "active" },
  ];
  const T = [2, 10, 5, 3, 7, 14, 5, 3, 7, 2, 5];
  const OWN = ["engagement_lead", "engagement_lead", "engagement_lead", "curator", "curator", "engagement_lead", "analyst", "evidence_officer", "engagement_lead", "curator", "engagement_lead"];
  const clocks: MgmtClock[] = [];
  let k = 0;
  const day = (d: number) => new Date(Date.UTC(2026, 8, 1) + d * 86_400_000).toISOString();
  const add = (pid: string, phase: number, used: number, open: boolean, status?: ClockStatus) => {
    const t = T[phase]!;
    clocks.push({ id: `k${++k}`, project_id: pid, phase, cycle_no: phase === 5 ? 1 : null, started_at: day(k * 3), completed_at: open ? null : day(k * 3 + used),
      owner_role: OWN[phase]!, escalation_chain: ["curator", "management"], status: status ?? (open ? (used > t ? "breached" : 100 * used / t >= 80 ? "at_risk" : "on_track") : "closed"),
      used, paused: status === "paused" ? 2 : 0, target: t, warn_pct: 80, pct: Math.round(1000 * used / t) / 10 });
  };
  [[2, 9, 4, 3, 8], [1, 11, 6, 2, 7]].forEach((d, i) => d.forEach((u, ph) => add(`e${i + 1}`, ph, u, false)));
  add("e1", 5, 12, true);
  add("e2", 5, 16, true);
  [1, 8, 5].forEach((u, ph) => add("e3", ph, u, false));
  add("e3", 3, 2, true, "paused");
  add("e4", 0, 1, true);
  return { clients, engagements, clocks };
}
