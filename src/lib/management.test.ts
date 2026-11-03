import { describe, expect, it } from "vitest";
import { counts, kpiCsv, needsAttention, phaseStats, samplePortfolio, worstStatus } from "./management";

describe("management portfolio", () => {
  const p = samplePortfolio();
  it("counts each active engagement once by its open clock status", () => {
    expect(counts(p)).toEqual({ active: 4, on_track: 1, at_risk: 1, breached: 1, paused: 1 });
  });
  it("worst status per client is the most severe open clock", () => {
    expect(worstStatus(p, "c1")).toBe("breached");
    expect(worstStatus(p, "c2")).toBe("paused");
  });
  it("phase KPIs come from recorded clocks: phase 1 median of 9, 11, 8 is 9", () => {
    const s = phaseStats(p, 1, 10);
    expect(s.median).toBe(9);
    expect(s.onTimeRate).toBe(67);
  });
  it("needs attention lists breached before at risk", () => {
    expect(needsAttention(p).map((c) => c.status)).toEqual(["breached", "at_risk"]);
  });
  it("CSV has a header and one line per clock", () => {
    expect(kpiCsv(p, p.clocks).split("\n")).toHaveLength(p.clocks.length + 1);
  });
});
