import { describe, expect, it } from "vitest";
import { clockStatusFor } from "./sla";

describe("clock status", () => {
  it("is On track below the warn percentage", () => expect(clockStatusFor(7, 10, 80)).toBe("on_track"));
  it("is At risk from the warn percentage up to the target", () => {
    expect(clockStatusFor(8, 10, 80)).toBe("at_risk");
    expect(clockStatusFor(10, 10, 80)).toBe("at_risk");
  });
  it("is Breached above the target", () => expect(clockStatusFor(11, 10, 80)).toBe("breached"));
});
