import { DARKNIGHT_UNAVAILABLE } from "./library-home";

/**
 * DarkNight unified-search gateway client (contract: docs/search/gateway-contract.md).
 * Indexes (keyword, meaning, image) live on DarkNight; results are read live and filtered by the portal's access check.
 */
export type SearchMode = "keyword" | "meaning" | "image";
export type SearchKind = "captures" | "cases" | "narratives" | "entities" | "reports";
export type SearchFilters = { platform?: string | undefined; from?: string | undefined; to?: string | undefined; narrative?: string | undefined; entity?: string | undefined; verification?: string | undefined; kinds?: SearchKind[] | undefined };
export type SearchHit = {
  key: string;
  kind: SearchKind;
  title: string;
  snippet: string;
  platform: string;
  at: string;
  project_id: string;
  verification: string;
  score: number;
  capture: { kind: "research" | "case_item"; id: string };
  case_id?: string | null;
};
export type SearchResult = { ok: true; hits: SearchHit[] } | { ok: false; message: string };

export const CONTENT_TYPES: { key: SearchKind; label: string }[] = [
  { key: "captures", label: "Captures" }, { key: "cases", label: "Cases" }, { key: "narratives", label: "Narratives" },
  { key: "entities", label: "Entities" }, { key: "reports", label: "Reports" },
];
export const NO_CONTENT_TYPES = "No content types chosen yet";

export async function searchGateway(gatewayUrl: string | null, body: { project_id: string; mode: SearchMode; query: string; filters: SearchFilters }, token: string, fetcher: typeof fetch = fetch): Promise<SearchResult> {
  if (!gatewayUrl) return { ok: false, message: DARKNIGHT_UNAVAILABLE };
  try {
    const u = new URL(gatewayUrl);
    if (u.protocol !== "https:" || u.username || u.password || u.search || u.hash) return { ok: false, message: DARKNIGHT_UNAVAILABLE };
    const res = await fetcher(`${u.href.replace(/\/$/, "")}/v1/search`, { method: "POST", headers: { Authorization: `Bearer ${token}`, Accept: "application/json", "Content-Type": "application/json" }, body: JSON.stringify(body), credentials: "omit", redirect: "error", cache: "no-store", signal: AbortSignal.timeout(20_000) });
    if (!res.ok) return { ok: false, message: DARKNIGHT_UNAVAILABLE };
    const d = (await res.json()) as { hits?: SearchHit[] };
    if (!Array.isArray(d?.hits)) return { ok: false, message: DARKNIGHT_UNAVAILABLE };
    return { ok: true, hits: d.hits };
  } catch {
    return { ok: false, message: DARKNIGHT_UNAVAILABLE };
  }
}

/** Keep only hits the database said are visible, in the gateway's order, with the links it returned. */
export function applyVisibility(hits: SearchHit[], visible: { key: string; run_id?: string; item_id?: string }[]) {
  const m = new Map(visible.map((v) => [v.key, v]));
  const shown = hits.filter((h) => h.capture && m.has(h.key)).map((h) => ({ hit: h, link: m.get(h.key)! }));
  return { shown, hidden: hits.length - shown.length };
}

/* ---------------- Fake gateway: staff-only Sample dataset, never stored ---------------- */
const SAMPLE_PROJECT = "00000000-0000-0000-0000-000000000001";
const SAMPLE: SearchHit[] = [
  { key: "h1", kind: "captures", title: "Sample capture: post in Malay", snippet: "Sample text — keyword match shown here.", platform: "facebook", at: "2026-11-04T09:00:00Z", project_id: SAMPLE_PROJECT, verification: "verified", score: 0.93, capture: { kind: "research", id: "sample-cap-01" } },
  { key: "h2", kind: "captures", title: "Sample capture: same claim in English", snippet: "Sample text — meaning match across languages.", platform: "x", at: "2026-11-04T10:00:00Z", project_id: SAMPLE_PROJECT, verification: "unverified", score: 0.81, capture: { kind: "research", id: "sample-cap-02" } },
  { key: "h3", kind: "narratives", title: "Sample narrative clu-001", snippet: "Sample narrative cluster citing three captures.", platform: "facebook", at: "2026-11-04T12:00:00Z", project_id: SAMPLE_PROJECT, verification: "verified", score: 0.77, capture: { kind: "research", id: "sample-cap-05" } },
  { key: "h4", kind: "captures", title: "Sample image copy (edited)", snippet: "Sample — image match: cropped copy of an earlier picture.", platform: "tiktok", at: "2026-11-04T13:00:00Z", project_id: SAMPLE_PROJECT, verification: "verified", score: 0.88, capture: { kind: "research", id: "sample-cap-11" } },
  { key: "h5", kind: "entities", title: "Sample entity acc-002 (not visible to you)", snippet: "Sample — removed by the access check.", platform: "facebook", at: "2026-11-04T14:00:00Z", project_id: "00000000-0000-0000-0000-000000000002", verification: "verified", score: 0.7, capture: { kind: "research", id: "sample-cap-99" } },
];
export const sampleSearchGateway = {
  search: (mode: SearchMode, f: SearchFilters): SearchResult => ({
    ok: true,
    hits: SAMPLE.filter((h) => (mode === "image" ? h.key === "h4" : h.key !== "h4") && (!f.platform || h.platform === f.platform) && (!f.verification || h.verification === f.verification) && (!f.kinds?.length || f.kinds.includes(h.kind))),
  }),
  /** Sample access check: only the Sample engagement is visible. */
  visible: (hits: SearchHit[]) => hits.filter((h) => h.project_id === SAMPLE_PROJECT).map((h) => ({ key: h.key, run_id: "sample-run" })),
};
