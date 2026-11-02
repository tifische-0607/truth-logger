import { describe, it, expect } from "vitest";
import { validHash, safeName } from "./hub";
import { fileProblem, gatewayBase, recordFrom } from "./home-vault";
import type { Source } from "./hub";
describe("home-vault evidence safety", () => {
  const hash = "a".repeat(64);
  const file = {
    file_id: "1",
    filename: "evidence.png",
    kind: "screenshot",
    sha256: hash,
    path_status: "OK",
  };
  it("requires exactly 64 hex characters for a linking fingerprint", () => {
    expect(validHash(hash)).toBe(true);
    expect(validHash("g".repeat(64))).toBe(false);
    expect(validHash("a".repeat(63))).toBe(false);
  });
  it.each(["MISSING", "AMBIGUOUS", "UNSAFE", "UNKNOWN"])("blocks %s files", (status) =>
    expect(fileProblem({ ...file, path_status: status })).toBe(status),
  );
  it("blocks files without a baseline", () =>
    expect(fileProblem({ ...file, sha256: "" })).toBe("NO_BASELINE"));
  it("accepts OK files with a valid baseline", () => expect(fileProblem(file)).toBe(null));
  it("requires collection.row record IDs", () => {
    expect(recordFrom({ id: "finding.42", files: [] }).id).toBe("finding.42");
    expect(() => recordFrom({ id: "42" })).toThrow();
  });
  it("prevents unsafe ZIP paths", () => {
    expect(safeName("../../secrets.txt")).not.toContain("/");
    expect(safeName("../../secrets.txt")).not.toMatch(/^\./);
  });
  it("rejects non-HTTPS and credential-bearing gateways", () => {
    const source = { enabled: true, gateway_url: "http://vault.local" } as Source;
    expect(() => gatewayBase(source)).toThrow();
    expect(() =>
      gatewayBase({ ...source, gateway_url: "https://user:password@vault.local" }),
    ).toThrow();
  });
});
