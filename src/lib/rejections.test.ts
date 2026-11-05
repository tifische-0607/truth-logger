import { describe, expect, it } from "vitest";
import { rejectionRate } from "./rejections";

describe("rejectionRate", () => {
  it("is rejected share of all items received", () => expect(rejectionRate(15, 5)).toBe(25));
  it("is null when nothing was received", () => expect(rejectionRate(0, 0)).toBeNull());
});
