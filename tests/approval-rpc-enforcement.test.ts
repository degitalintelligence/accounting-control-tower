import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const migration = readFileSync(resolve(__dirname, "..", "supabase/migrations/038_enforce_review_approval_authority.sql"), "utf8");

describe("approval RPC enforcement", () => {
  it("memvalidasi actor melalui assignment dan separation of duties", () => {
    expect(migration).toContain("assert_review_actor");
    expect(migration).toContain("separation of duties dilanggar");
  });
  it("memvalidasi policy dan resolver authority sebelum approval", () => {
    expect(migration).toContain("resolve_effective_authority");
    expect(migration).toContain("INSUFFICIENT_APPROVAL_AUTHORITY");
    expect(migration).toContain("authority_snapshot");
    expect(migration).toContain("policy tidak memerlukan approval");
  });
  it("menggunakan approval requirement, bukan risk saja", () => {
    expect(migration).toContain("item.approval_requirement IN ('approver','multi_level')");
  });
});
