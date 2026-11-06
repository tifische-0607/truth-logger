import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CERT_CHECKS } from "./connectors";

describe("U13 connector certification", () => {
  it("screen checklist matches the database's required checks exactly", () => {
    const sql = readFileSync("drizzle/migrations/0048_fa_portal_u13_wider_sources.sql", "utf8");
    const m = /required text\[\] := ARRAY\[([^\]]+)\]/.exec(sql)!;
    const db = m[1]!.split(",").map((s) => s.trim().replace(/'/g, "")).sort();
    expect(CERT_CHECKS.map((c) => c.key).sort()).toEqual(db);
  });
  it("adds no real forum names", () => {
    const sql = readFileSync("drizzle/migrations/0048_fa_portal_u13_wider_sources.sql", "utf8");
    expect(sql).toContain("'Local forum (not chosen)'");
  });
});
