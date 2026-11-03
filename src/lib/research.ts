import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type ResearchPlan = Tables<"research_plans">;
export type ResearchRun = Tables<"research_runs">;
export type ResearchCapture = Tables<"research_captures">;
export type ResearchRefusal = Tables<"research_refusals">;
export type ResearchEvent = Tables<"research_events">;
export type ResearchConnector = Tables<"research_connectors">;

export const JOB_TYPES = [
  { id: "monitor", label: "Monitor" },
  { id: "scrape", label: "Scrape" },
  { id: "osint_search", label: "OSINT search" },
] as const;

export const PLAN_STATUS: Record<string, { label: string; tone: string }> = {
  draft: { label: "Draft", tone: "bg-muted text-foreground" },
  locked: { label: "Locked", tone: "bg-queued text-queued-foreground" },
  queued: { label: "Queued", tone: "bg-queued text-queued-foreground" },
  running: { label: "Running", tone: "bg-running text-running-foreground" },
  paused: { label: "Paused", tone: "bg-warn text-warn-foreground" },
  delivered: { label: "Delivered", tone: "bg-done text-done-foreground" },
  loaded: { label: "Loaded", tone: "bg-done text-done-foreground" },
  stopped: { label: "Stopped", tone: "bg-failed text-failed-foreground" },
  failed: { label: "Failed", tone: "bg-failed text-failed-foreground" },
};
export const planStatus = (s: string) => PLAN_STATUS[s] ?? { label: s, tone: "bg-muted text-foreground" };

/** Run status steps shown on the Collect tab, in order. */
export const RUN_STEPS = ["draft", "queued", "running", "delivered", "loaded"] as const;

/** Capture pipeline steps, in order, with the test for each. */
export const PIPELINE: { id: string; label: string; done: (c: ResearchCapture) => boolean }[] = [
  { id: "capture", label: "Capture", done: () => true },
  { id: "hash", label: "Hash", done: (c) => /^[0-9a-f]{64}$/.test(c.sha256_at_capture) },
  { id: "vault", label: "Write to vault", done: (c) => c.vault_write_verified },
  { id: "custody", label: "Custody event", done: (c) => !!c.custody_event_id },
  { id: "check", label: "Second-person check", done: (c) => !!c.second_check_by },
  { id: "tier", label: "Tier", done: (c) => !!c.tier },
];

/** FA-STD-001: compliant when every pipeline step is complete and the standard version is recorded. */
export function fstdCompliant(c: ResearchCapture) {
  return (
    PIPELINE.every((s) => s.done(c)) &&
    c.sha256_on_write === c.sha256_at_capture &&
    c.fstd001_version.trim().length > 0
  );
}

export const TIER_LABEL: Record<string, string> = {
  API_RAW_ONLY: "API raw only",
  BROWSER_DOM_ONLY: "Browser DOM only",
  ELEMENT_CROP: "Element crop",
  FA_STD_001_V2: "FA-STD-001 V2 (proof)",
};

export function errText(e: unknown) {
  if (e instanceof Error) return e.message;
  if (e && typeof e === "object" && "message" in e) return String((e as { message: unknown }).message);
  return "Could not save";
}

export function useResearchForProject(projectId: string) {
  return useQuery({
    queryKey: ["research", "project", projectId],
    queryFn: async () => {
      const [plans, runs, refusals] = await Promise.all([
        supabase.from("research_plans").select("*").eq("engagement_id", projectId).order("created_at", { ascending: false }),
        supabase.from("research_runs").select("*").eq("project_id", projectId).order("started_at", { ascending: false }),
        supabase.from("research_refusals").select("*").eq("project_id", projectId).order("refused_at", { ascending: false }).limit(50),
      ]);
      for (const r of [plans, runs, refusals]) if (r.error) throw r.error;
      return { plans: plans.data ?? [], runs: runs.data ?? [], refusals: refusals.data ?? [] };
    },
  });
}

export type Readiness = {
  g1: boolean;
  g2: boolean;
  design_current: boolean;
  no_pending_amendment: boolean;
  vault_online: boolean;
  vault_window_minutes: number;
  cycle_free: boolean;
  block_reason: string | null;
};

export function useReadiness(projectId: string, cycle: number) {
  return useQuery({
    queryKey: ["research", "readiness", projectId, cycle],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("research_readiness", { _project: projectId, _cycle: cycle });
      if (error) throw error;
      return data as unknown as Readiness;
    },
  });
}

export function useVaultStatus() {
  return useQuery({
    queryKey: ["research", "vault"],
    queryFn: async () => {
      const [online, win, last] = await Promise.all([
        supabase.rpc("research_home_vault_online"),
        supabase.rpc("research_vault_window_minutes"),
        supabase.from("research_vault_reports").select("*").order("reported_at", { ascending: false }).limit(1),
      ]);
      return {
        online: online.data === true,
        windowMinutes: (win.data as number | null) ?? 15,
        last: last.data?.[0] ?? null,
      };
    },
    refetchInterval: 60_000,
  });
}
