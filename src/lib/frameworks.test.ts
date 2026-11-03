import { describe, expect, it } from "vitest";
import { extractionState } from "./frameworks";

describe("framework extraction step", () => {
  it("is Not configured when no extraction service is set", () => {
    expect(extractionState({}).outcome).toBe("not_configured");
  });
  it("never claims extraction ran when a service is set, because outside connections are not allowed", () => {
    expect(extractionState({ FRAMEWORK_EXTRACTION_SERVICE: "x" }).outcome).toBe("not_attempted");
  });
});
