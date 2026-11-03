export type ClockStatus = "on_track" | "at_risk" | "breached" | "paused" | "closed";

export const CLOCK_STATUS: Record<ClockStatus, { label: string; tone: string; dot: string; bar: string }> = {
  on_track: { label: "On track", tone: "bg-secondary text-secondary-foreground", dot: "bg-success", bar: "bg-success" },
  at_risk: { label: "At risk", tone: "bg-warn text-warn-foreground", dot: "bg-warn-foreground", bar: "bg-warn" },
  breached: { label: "Breached", tone: "bg-failed text-failed-foreground", dot: "bg-failed-foreground", bar: "bg-failed" },
  paused: { label: "Paused", tone: "bg-muted text-foreground", dot: "bg-muted-foreground", bar: "bg-muted-foreground" },
  closed: { label: "Closed", tone: "bg-muted text-foreground", dot: "bg-muted-foreground", bar: "bg-muted-foreground" },
};

export const PAUSE_REASONS = [
  { id: "waiting_on_sponsor_readback", label: "Waiting on sponsor read-back" },
  { id: "client_documents", label: "Waiting on client documents" },
  { id: "client_approval", label: "Waiting on client approval" },
] as const;

/** Mirrors the database rule: On track below warn %, At risk from warn % to target, Breached above target. */
export function clockStatusFor(used: number, target: number, warnPct: number): ClockStatus {
  if (used > target) return "breached";
  if ((100 * used) / target >= warnPct) return "at_risk";
  return "on_track";
}

export const clockBarPct = (used: number, target: number) => Math.min(100, Math.round((100 * used) / Math.max(target, 1)));
