import { describe, expect, it } from "vitest";
import { applyVisibility, sampleSearchGateway, searchGateway } from "./search-gateway";

describe("U12 search access rules", () => {
  it("drops any hit the access check did not return", () => {
    const r = sampleSearchGateway.search("keyword", {});
    if (!r.ok) throw new Error("sample");
    const out = applyVisibility(r.hits, sampleSearchGateway.visible(r.hits));
    expect(out.shown.map((x) => x.hit.key)).toEqual(["h1", "h2", "h3"]);
    expect(out.hidden).toBe(1);
  });
  it("every shown result carries a capture link", () => {
    const out = applyVisibility([{ key: "a", capture: { kind: "research", id: "x" } } as never], [{ key: "a", run_id: "r" }]);
    expect(out.shown[0]!.link.run_id).toBe("r");
  });
  it("shows the unavailable message when DarkNight is unreachable", async () => {
    const r = await searchGateway("https://dn.example", { project_id: "p", mode: "keyword", query: "", filters: {} }, "t", (() => Promise.reject(new Error("x"))) as typeof fetch);
    expect(r).toEqual({ ok: false, message: "Temporarily unavailable, please try again later" });
  });
  it("no gateway configured → unavailable", async () => {
    expect((await searchGateway(null, { project_id: "p", mode: "meaning", query: "", filters: {} }, "t")).ok).toBe(false);
  });
});
