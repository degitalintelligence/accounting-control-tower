import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (file: string) => readFileSync(resolve(__dirname, "..", file), "utf8");

describe("planned leave workflow", () => {
  it("memiliki RPC transactional untuk approve, reject, cancel", () => {
    const migration = read("supabase/migrations/033_planned_leave_workflow.sql");
    expect(migration).toContain("approve_planned_leave");
    expect(migration).toContain("reject_planned_leave");
    expect(migration).toContain("cancel_planned_leave");
    expect(migration).toContain("Self approval tidak diizinkan");
  });

  it("membatasi API berdasarkan organization context", () => {
    const route = read("src/app/api/settings/planned-leaves/route.ts");
    expect(route).toContain("getAuthContext");
    expect(route).toContain("eq(\"organization_id\", organizationId)");
    expect(route).toContain("PLANNED_LEAVE_OVERLAP");
  });
});
