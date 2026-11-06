import { DARKNIGHT_UNAVAILABLE } from "./library-home";

/**
 * DarkNight narrative/coordination gateway client (contract: docs/narratives/gateway-contract.md).
 * Clustering, embeddings and text live on DarkNight; the browser reads results live and nothing is stored in the cloud.
 */
export type NarrativeCluster = {
  id: string;
  languages: string[]; // e.g. ["ms","en"]
  summary: string; // DarkNight-generated, shown live only
  similarity: number; // 0–1
  captures: string[];
  timeline: { day: string; volume: number; platforms: string[]; new_accounts: number }[];
};
export type CoordinationFinding = {
  id: string;
  kind: "near_identical_text" | "same_links" | "new_account_burst";
  accounts: string[];
  window_start: string;
  window_end: string;
  basis: string;
  captures: string[];
};
export type NarrativeData = { standard_version: string | null; model: string | null; clusters: NarrativeCluster[]; coordination: CoordinationFinding[] };
export type NarrativeResult = { ok: true; data: NarrativeData } | { ok: false; message: string };

export const COORD_KIND_LABEL: Record<CoordinationFinding["kind"], string> = {
  near_identical_text: "Same or near-identical text",
  same_links: "Same links pushed together",
  new_account_burst: "Burst of new accounts",
};

export function narrativeUrl(gatewayUrl: string, projectId: string) {
  const u = new URL(gatewayUrl);
  if (u.protocol !== "https:" || u.username || u.password || u.search || u.hash) throw new Error("Gateway must be a clean HTTPS address");
  if (!/^[0-9a-f-]{36}$/i.test(projectId)) throw new Error("Invalid engagement");
  return `${u.href.replace(/\/$/, "")}/v1/narratives/${projectId}`;
}

export async function fetchNarratives(gatewayUrl: string | null, projectId: string, token: string, fetcher: typeof fetch = fetch): Promise<NarrativeResult> {
  if (!gatewayUrl) return { ok: false, message: DARKNIGHT_UNAVAILABLE };
  try {
    const res = await fetcher(narrativeUrl(gatewayUrl, projectId), { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }, credentials: "omit", redirect: "error", cache: "no-store", signal: AbortSignal.timeout(20_000) });
    if (!res.ok) return { ok: false, message: DARKNIGHT_UNAVAILABLE };
    const d = (await res.json()) as NarrativeData;
    if (!Array.isArray(d?.clusters) || !Array.isArray(d?.coordination)) return { ok: false, message: DARKNIGHT_UNAVAILABLE };
    return { ok: true, data: { standard_version: d.standard_version ?? null, model: d.model ?? null, clusters: d.clusters, coordination: d.coordination } };
  } catch {
    return { ok: false, message: DARKNIGHT_UNAVAILABLE };
  }
}

/** Findings that cite no capture are never shown. */
export function onlyCited<T extends { captures: string[] }>(xs: T[]): T[] {
  return xs.filter((x) => Array.isArray(x.captures) && x.captures.length > 0);
}

/** A coordination finding is only "eligible" when thresholds are set; unset → null (nothing labelled). */
export function eligible(f: CoordinationFinding, t: { coord_min_accounts: number | null; coord_window_minutes: number | null; new_account_min: number | null }): boolean | null {
  const min = f.kind === "new_account_burst" ? t.new_account_min : t.coord_min_accounts;
  if (!min || !t.coord_window_minutes) return null;
  const mins = (Date.parse(f.window_end) - Date.parse(f.window_start)) / 60000;
  return f.accounts.length >= min && mins <= t.coord_window_minutes;
}

export function formatWindow(minutes: number | null | undefined): string {
  if (!minutes) return "Not set";
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60), m = minutes % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/* ---------------- Fake gateway: staff-only Sample dataset, never stored ---------------- */
const D = (d: number, h = 9, m = 0) => new Date(Date.UTC(2026, 10, d, h, m)).toISOString();
const SAMPLE: NarrativeData = {
  standard_version: "Sample",
  model: "Sample multilingual model (ms, en)",
  clusters: [
    { id: "clu-001", languages: ["ms", "en"], summary: "Sample: the same claim written in Malay and English in different words.", similarity: 0.86, captures: ["sample-cap-01", "sample-cap-02", "sample-cap-05"],
      timeline: [{ day: "2026-11-02", volume: 4, platforms: ["facebook"], new_accounts: 0 }, { day: "2026-11-03", volume: 11, platforms: ["facebook", "x"], new_accounts: 2 }, { day: "2026-11-04", volume: 27, platforms: ["facebook", "x", "tiktok"], new_accounts: 6 }] },
    { id: "clu-002", languages: ["ms"], summary: "Sample: a second, smaller group of similar posts.", similarity: 0.74, captures: ["sample-cap-06"],
      timeline: [{ day: "2026-11-03", volume: 3, platforms: ["facebook"], new_accounts: 0 }, { day: "2026-11-04", volume: 5, platforms: ["facebook"], new_accounts: 1 }] },
  ],
  coordination: [
    { id: "crd-001", kind: "near_identical_text", accounts: ["acc-001", "acc-002", "acc-003", "acc-004"], window_start: D(4, 9, 0), window_end: D(4, 9, 9), basis: "Sample: four accounts posted near-identical text within nine minutes.", captures: ["sample-cap-01", "sample-cap-02", "sample-cap-03", "sample-cap-04"] },
    { id: "crd-002", kind: "same_links", accounts: ["acc-002", "acc-005"], window_start: D(4, 14, 0), window_end: D(4, 16, 0), basis: "Sample: the same link shared by two accounts within two hours.", captures: ["sample-cap-13"] },
    { id: "crd-003", kind: "new_account_burst", accounts: ["acc-004", "acc-006", "acc-007"], window_start: D(3, 20), window_end: D(4, 8), basis: "Sample: three accounts created within twelve hours began posting the narrative.", captures: ["sample-cap-10"] },
  ],
};
export const sampleNarrativeGateway = { load: (): NarrativeResult => ({ ok: true, data: structuredClone(SAMPLE) }) };
