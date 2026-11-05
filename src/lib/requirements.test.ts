import { describe, expect, it } from "vitest";

import { inForce, normLanguage, normPlatform, type Requirement } from "./requirements";

const row = (req_no: number, version: number, status = "active") => ({ id: `${req_no}-${version}`, req_no, version, status }) as Requirement;

describe("requirements register", () => {
  it("keeps only the latest version of each requirement", () => {
    const r = inForce([row(1, 1), row(1, 2, "withdrawn"), row(2, 1)]);
    expect(r.map((x) => x.id)).toEqual(["1-2", "2-1"]);
    expect(r[0]?.status).toBe("withdrawn");
  });
  it("maps brief wording to baseline codes", () => {
    expect(normPlatform("Twitter")).toBe("x");
    expect(normLanguage("Bahasa Melayu")).toBe("ms");
  });
});
