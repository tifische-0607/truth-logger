import { describe, expect, it } from "vitest";
import { canSupport, stepState } from "./u6";

describe("U6 rules shown on screen", () => {
  it("only Confirmed or Probable items may support a finding", () => {
    expect(canSupport("Confirmed")).toBe(true);
    expect(canSupport("Probable")).toBe(true);
    expect(canSupport("Possible")).toBe(false);
    expect(canSupport("Unverified")).toBe(false);
  });
  it("a step with any failed subject shows failed", () => expect(stepState(["passed", "failed"], 2)).toBe("failed"));
  it("a step passes only when every subject passed", () => {
    expect(stepState(["passed"], 2)).toBe("waiting");
    expect(stepState(["passed", "passed"], 2)).toBe("passed");
  });
});
