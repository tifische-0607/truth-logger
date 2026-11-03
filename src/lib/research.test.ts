import { describe, expect, it } from "vitest";

import { fstdCompliant, type ResearchCapture } from "@/lib/research";

const H = "a".repeat(64);
const full = {
  sha256_at_capture: H,
  sha256_on_write: H,
  vault_write_verified: true,
  custody_event_id: "c1",
  second_check_by: "u2",
  tier: "FA_STD_001_V2",
  fstd001_version: "V2",
} as unknown as ResearchCapture;

describe("FA-STD-001 compliance", () => {
  it("is compliant only when every pipeline step is recorded", () => {
    expect(fstdCompliant(full)).toBe(true);
  });
  it("needs action without a second-person check", () => {
    expect(fstdCompliant({ ...full, second_check_by: null })).toBe(false);
  });
  it("needs action when the hash on write differs", () => {
    expect(fstdCompliant({ ...full, sha256_on_write: "b".repeat(64) })).toBe(false);
  });
});
