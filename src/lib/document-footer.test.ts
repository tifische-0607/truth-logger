import { describe, expect, it } from "vitest";
import { DOCUMENT_COMPANY_LINE, DOCUMENT_FOOTER, DOCUMENT_FOOTER_TEXT } from "./document-footer";

describe("generated-document footer", () => {
  it("attribution line is exact", () => {
    expect(DOCUMENT_FOOTER).toBe("Produced by FridayAnalytics.org");
  });
  it("company line carries name, registration and web only", () => {
    expect(DOCUMENT_COMPANY_LINE).toBe(
      "Friday Analytics Sdn. Bhd. · Company Reg. No. 202601040549 (1702644-K) · www.fridayanalytics.org",
    );
  });
  it("plain-text footer is attribution then company line", () => {
    expect(DOCUMENT_FOOTER_TEXT.split("\n")).toEqual([DOCUMENT_FOOTER, DOCUMENT_COMPANY_LINE]);
  });
});
