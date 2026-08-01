import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(__dirname, "..");
const read = (file: string) => readFileSync(resolve(root, file), "utf8");

describe("planned leave validation", () => {
  it("memiliki tabel tenant-scoped, status, dan date constraint", () => {
    const migration = read("supabase/migrations/032_planned_leave_validation.sql");
    expect(migration).toContain("CREATE TABLE acct_ctrl.planned_leaves");
    expect(migration).toContain("organization_id UUID NOT NULL");
    expect(migration).toContain("planned_leave_status");
    expect(migration).toContain("start_date <= end_date");
    expect(migration).toContain("ENABLE ROW LEVEL SECURITY");
  });

  it("membedakan approved block dan pending warning", () => {
    const helper = read("src/lib/work-engine/planned-leave.ts");
    expect(helper).toContain("ASSIGNEE_ON_APPROVED_LEAVE");
    expect(helper).toContain("ASSIGNEE_LEAVE_WARNING");
    expect(helper).toContain("acknowledged");
  });
});
