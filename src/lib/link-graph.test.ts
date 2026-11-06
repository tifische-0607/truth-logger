import { describe, expect, it } from "vitest";
import { bursts, clusters, degreeCentrality, onlyEvidencedLinks } from "./link-graph";
import { fetchGraph, sampleGateway } from "./link-gateway";

const g = sampleGateway.graph();
if (!g.ok) throw new Error("sample");

describe("link analysis rules", () => {
  it("drops any link without cited evidence", () => {
    const r = onlyEvidencedLinks(g.graph);
    expect(r.dropped).toBe(1);
    expect(r.graph.edges.every((e) => e.captures.length > 0)).toBe(true);
  });
  it("does not flag bursts while the coordination threshold is not set", () => {
    expect(bursts(g.graph, null, 15)).toBeNull();
    expect(bursts(g.graph, 3, null)).toBeNull();
  });
  it("finds 3+ accounts posting into one group within 15 minutes once thresholds are set", () => {
    const b = bursts(onlyEvidencedLinks(g.graph).graph, 3, 15)!;
    expect(b[0]!.target).toBe("grp-001");
    expect(b[0]!.accounts.length).toBeGreaterThanOrEqual(3);
  });
  it("ranks the most connected node first", () => expect(degreeCentrality(g.graph)[0]!.id).toBe("acc-001"));
  it("puts linked nodes in one cluster", () => expect(clusters(g.graph)[0]!.length).toBe(10));
  it("shows the unavailable message when DarkNight cannot be reached", async () => {
    const r = await fetchGraph("https://darknight.invalid", "00000000-0000-0000-0000-000000000000", "t", async () => { throw new Error("down"); });
    expect(r).toEqual({ ok: false, message: "Temporarily unavailable, please try again later" });
  });
});
