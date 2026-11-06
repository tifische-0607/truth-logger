/** U9 link analysis: graph shape returned by the DarkNight gateway, plus the measures computed in the browser. Nothing here is stored. */
export const ENTITY_TYPES = ["account", "person", "group", "page", "hashtag", "url", "phone", "location", "narrative"] as const;
export type EntityType = (typeof ENTITY_TYPES)[number];
export const LINK_TYPES = ["posted_in", "shared", "mentions", "same_admin", "same_phone"] as const;
export type LinkType = (typeof LINK_TYPES)[number];
export const LINK_LABEL: Record<LinkType, string> = { posted_in: "Posted in", shared: "Shared", mentions: "Mentions", same_admin: "Same admin", same_phone: "Same phone number" };
export const ENTITY_LABEL: Record<EntityType, string> = { account: "Account", person: "Person", group: "Group", page: "Page", hashtag: "Hashtag", url: "URL", phone: "Phone number", location: "Location", narrative: "Narrative" };

export type GraphNode = { id: string; type: EntityType; label: string };
export type GraphEdge = { id: string; source: string; target: string; type: LinkType; at: string; captures: string[] };
export type MergeSuggestion = { id: string; a: string; b: string; score: number; basis: string };
export type Graph = { standard_version: string | null; nodes: GraphNode[]; edges: GraphEdge[]; suggestions: MergeSuggestion[] };

/** No link without cited evidence: edges with no capture, or pointing at unknown nodes, are dropped and counted. */
export function onlyEvidencedLinks(g: Graph): { graph: Graph; dropped: number } {
  const ids = new Set(g.nodes.map((n) => n.id));
  const edges = g.edges.filter((e) => Array.isArray(e.captures) && e.captures.length > 0 && ids.has(e.source) && ids.has(e.target));
  return { graph: { ...g, edges }, dropped: g.edges.length - edges.length };
}

export function filterByTime(g: Graph, from?: string, to?: string): Graph {
  const f = from ? Date.parse(from) : -Infinity;
  const t = to ? Date.parse(to) + 86_399_999 : Infinity;
  const edges = g.edges.filter((e) => { const at = Date.parse(e.at); return at >= f && at <= t; });
  const used = new Set(edges.flatMap((e) => [e.source, e.target]));
  return { ...g, edges, nodes: g.nodes.filter((n) => used.has(n.id)) };
}

/** Degree centrality: share of other nodes each node is directly linked to. */
export function degreeCentrality(g: Graph): { id: string; degree: number; centrality: number }[] {
  const deg = new Map(g.nodes.map((n) => [n.id, new Set<string>()]));
  for (const e of g.edges) { deg.get(e.source)?.add(e.target); deg.get(e.target)?.add(e.source); }
  const n = Math.max(1, g.nodes.length - 1);
  return [...deg.entries()].map(([id, s]) => ({ id, degree: s.size, centrality: s.size / n })).sort((a, b) => b.degree - a.degree || a.id.localeCompare(b.id));
}

/** Clusters = connected groups of nodes. */
export function clusters(g: Graph): string[][] {
  const adj = new Map(g.nodes.map((n) => [n.id, [] as string[]]));
  for (const e of g.edges) { adj.get(e.source)?.push(e.target); adj.get(e.target)?.push(e.source); }
  const seen = new Set<string>(); const out: string[][] = [];
  for (const n of g.nodes) {
    if (seen.has(n.id)) continue;
    const stack = [n.id]; const group: string[] = []; seen.add(n.id);
    while (stack.length) { const c = stack.pop()!; group.push(c); for (const x of adj.get(c) ?? []) if (!seen.has(x)) { seen.add(x); stack.push(x); } }
    out.push(group.sort());
  }
  return out.sort((a, b) => b.length - a.length);
}

export type Burst = { target: string; start: string; end: string; accounts: string[]; captures: string[] };
/**
 * Coordinated posting bursts: at least `minAccounts` different accounts posting/sharing into the same target within `windowMinutes`.
 * Returns null when either threshold is not set — nothing is flagged from an unset threshold.
 */
export function bursts(g: Graph, minAccounts: number | null | undefined, windowMinutes: number | null | undefined): Burst[] | null {
  if (!minAccounts || !windowMinutes) return null;
  const win = windowMinutes * 60_000;
  const byTarget = new Map<string, GraphEdge[]>();
  for (const e of g.edges) if (e.type === "posted_in" || e.type === "shared") (byTarget.get(e.target) ?? byTarget.set(e.target, []).get(e.target)!).push(e);
  const out: Burst[] = [];
  for (const [target, list] of byTarget) {
    const sorted = [...list].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
    let i = 0;
    for (let j = 0; j < sorted.length; j++) {
      while (Date.parse(sorted[j]!.at) - Date.parse(sorted[i]!.at) > win) i++;
      const slice = sorted.slice(i, j + 1);
      const accounts = [...new Set(slice.map((e) => e.source))];
      if (accounts.length >= minAccounts) {
        out.push({ target, start: slice[0]!.at, end: slice[slice.length - 1]!.at, accounts, captures: [...new Set(slice.flatMap((e) => e.captures))] });
        i = j + 1;
      }
    }
  }
  return out;
}
