import { describe, expect, it } from "vitest";
import { eligible, fetchNarratives, formatWindow, onlyCited, sampleNarrativeGateway } from "./narrative-gateway";

const r = sampleNarrativeGateway.load();
if (!r.ok) throw new Error("sample");
const unset = { coord_min_accounts: null, coord_window_minutes: null, new_account_min: null };

describe("U11 narrative and coordination rules", () => {
  it("nothing is eligible to be labelled while thresholds are not set", () => {
    expect(r.data.coordination.map((f) => eligible(f, unset))).toEqual([null, null, null]);
  });
  it("four accounts within nine minutes meet a 3-account / 15-minute threshold", () => {
    expect(eligible(r.data.coordination[0]!, { coord_min_accounts: 3, coord_window_minutes: 15, new_account_min: null })).toBe(true);
  });
  it("a two-hour window does not meet a 15-minute threshold", () => {
    expect(eligible(r.data.coordination[1]!, { coord_min_accounts: 2, coord_window_minutes: 15, new_account_min: null })).toBe(false);
  });
  it("hides findings that cite no capture", () => {
    expect(onlyCited([{ captures: [] }, { captures: ["c"] }])).toHaveLength(1);
  });
  it("windows longer than 20 minutes are shown in hours", () => {
    expect(formatWindow(4320)).toBe("72 h");
    expect(formatWindow(90)).toBe("1 h 30 min");
  });
  it("shows the unavailable message when the gateway is unreachable", async () => {
    const res = await fetchNarratives("https://dn.example", "00000000-0000-0000-0000-000000000000", "t", (() => Promise.reject(new Error("x"))) as typeof fetch);
    expect(res).toEqual({ ok: false, message: "Temporarily unavailable, please try again later" });
  });
});
