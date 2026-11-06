import { DARKNIGHT_UNAVAILABLE } from "./library-home";
import type { Graph } from "./link-graph";

/**
 * DarkNight link-analysis gateway client (contract: docs/link-analysis/gateway-contract.md).
 * The browser reads graph data live over HTTPS with a bearer token; nothing is cached or written to the cloud.
 */
export type GraphResult = { ok: true; graph: Graph } | { ok: false; message: string };

function base(gatewayUrl: string) {
  const u = new URL(gatewayUrl);
  if (u.protocol !== "https:" || u.username || u.password || u.search || u.hash) throw new Error("Gateway must be a clean HTTPS address");
  return u.href.replace(/\/$/, "");
}

export function graphUrl(gatewayUrl: string, projectId: string, path = "") {
  if (!/^[0-9a-f-]{36}$/i.test(projectId)) throw new Error("Invalid engagement");
  return `${base(gatewayUrl)}/v1/graph/${projectId}${path}`;
}

async function getJson(url: string, token: string, fetcher: typeof fetch): Promise<GraphResult> {
  try {
    const res = await fetcher(url, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }, credentials: "omit", redirect: "error", cache: "no-store", signal: AbortSignal.timeout(20_000) });
    if (!res.ok) return { ok: false, message: DARKNIGHT_UNAVAILABLE };
    const g = (await res.json()) as Graph;
    if (!Array.isArray(g?.nodes) || !Array.isArray(g?.edges)) return { ok: false, message: DARKNIGHT_UNAVAILABLE };
    return { ok: true, graph: { standard_version: g.standard_version ?? null, nodes: g.nodes, edges: g.edges, suggestions: Array.isArray(g.suggestions) ? g.suggestions : [] } };
  } catch {
    return { ok: false, message: DARKNIGHT_UNAVAILABLE };
  }
}

export function fetchGraph(gatewayUrl: string | null, projectId: string, token: string, fetcher: typeof fetch = fetch): Promise<GraphResult> {
  if (!gatewayUrl) return Promise.resolve({ ok: false, message: DARKNIGHT_UNAVAILABLE });
  return getJson(graphUrl(gatewayUrl, projectId), token, fetcher);
}

export function fetchNeighbours(gatewayUrl: string | null, projectId: string, nodeId: string, token: string, fetcher: typeof fetch = fetch): Promise<GraphResult> {
  if (!gatewayUrl) return Promise.resolve({ ok: false, message: DARKNIGHT_UNAVAILABLE });
  return getJson(graphUrl(gatewayUrl, projectId, `/node/${encodeURIComponent(nodeId)}/neighbours`), token, fetcher);
}

/* ---------------- Fake gateway: staff-only Sample dataset, never stored ---------------- */
const T = (h: number, m = 0) => new Date(Date.UTC(2026, 10, 4, h, m)).toISOString();
const SAMPLE_CORE: Graph = {
  standard_version: "Sample",
  nodes: [
    { id: "acc-001", type: "account", label: "Sample account A" },
    { id: "acc-002", type: "account", label: "Sample account B" },
    { id: "acc-003", type: "account", label: "Sample account C" },
    { id: "acc-004", type: "account", label: "Sample account D (new)" },
    { id: "grp-001", type: "group", label: "Sample group 1" },
    { id: "pg-001", type: "page", label: "Sample page" },
    { id: "tag-001", type: "hashtag", label: "#SampleTag" },
    { id: "nar-001", type: "narrative", label: "Sample narrative" },
    { id: "loc-001", type: "location", label: "Sample square" },
    { id: "ph-001", type: "phone", label: "Sample phone (masked)" },
  ],
  edges: [
    { id: "e1", source: "acc-001", target: "grp-001", type: "posted_in", at: T(9, 0), captures: ["sample-cap-01"] },
    { id: "e2", source: "acc-002", target: "grp-001", type: "posted_in", at: T(9, 4), captures: ["sample-cap-02"] },
    { id: "e3", source: "acc-003", target: "grp-001", type: "posted_in", at: T(9, 7), captures: ["sample-cap-03"] },
    { id: "e4", source: "acc-004", target: "grp-001", type: "shared", at: T(9, 9), captures: ["sample-cap-04"] },
    { id: "e5", source: "acc-001", target: "tag-001", type: "mentions", at: T(10), captures: ["sample-cap-05"] },
    { id: "e6", source: "acc-002", target: "loc-001", type: "mentions", at: T(11), captures: ["sample-cap-06"] },
    { id: "e7", source: "acc-001", target: "pg-001", type: "same_admin", at: T(8), captures: ["sample-cap-07", "sample-cap-08"] },
    { id: "e8", source: "acc-003", target: "ph-001", type: "same_phone", at: T(7), captures: ["sample-cap-09"] },
    { id: "e9", source: "acc-004", target: "ph-001", type: "same_phone", at: T(7, 30), captures: ["sample-cap-10"] },
    { id: "e10", source: "tag-001", target: "nar-001", type: "mentions", at: T(12), captures: ["sample-cap-11"] },
    { id: "e11", source: "acc-002", target: "nar-001", type: "shared", at: T(13), captures: [] },
  ],
  suggestions: [{ id: "sug-001", a: "acc-003", b: "acc-004", score: 0.82, basis: "Same phone number; posting minutes apart (Sample)" }],
};
const SAMPLE_EXTRA: Graph = {
  standard_version: "Sample",
  nodes: [{ id: "acc-005", type: "account", label: "Sample account E" }, { id: "url-001", type: "url", label: "sample.example/post" }],
  edges: [
    { id: "e12", source: "acc-005", target: "grp-001", type: "posted_in", at: T(9, 12), captures: ["sample-cap-12"] },
    { id: "e13", source: "acc-005", target: "url-001", type: "shared", at: T(14), captures: ["sample-cap-13"] },
  ],
  suggestions: [],
};
export const sampleGateway = {
  graph: (): GraphResult => ({ ok: true, graph: structuredClone(SAMPLE_CORE) }),
  neighbours: (nodeId: string): GraphResult => ({ ok: true, graph: nodeId === "grp-001" ? structuredClone(SAMPLE_EXTRA) : { standard_version: "Sample", nodes: [], edges: [], suggestions: [] } }),
};
