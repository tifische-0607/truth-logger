import { describe, expect, it } from "vitest";
import { formatPrice, invoiceTotal, seatLabel, PRICE_ON_REQUEST } from "./billing";

describe("billing rules", () => {
  it("shows an unset price as Price on request", () => {
    expect(formatPrice(null, "RM")).toBe(PRICE_ON_REQUEST);
    expect(PRICE_ON_REQUEST).toBe("Price on request");
  });
  it("shows a set price with its currency", () => {
    expect(formatPrice(1200, "RM")).toBe("RM 1,200.00");
  });
  it("totals invoice lines like the database", () => {
    expect(invoiceTotal([{ description: "a", quantity: 3, unit_price: 0.335 }, { description: "b", quantity: 1, unit_price: 10 }])).toBeCloseTo(11.01, 2);
  });
  it("labels an empty seat limit as unlimited", () => {
    expect(seatLabel(null)).toBe("Unlimited seats");
    expect(seatLabel(3)).toBe("3 seats");
  });
});
