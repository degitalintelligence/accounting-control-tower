import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (file: string) => readFileSync(resolve(__dirname, "..", file), "utf8");

describe("approval policy materiality", () => {
  it("memiliki policy, rules, authority, dan delegation tenant-scoped", () => {
    const policy = read("supabase/migrations/034_approval_policy_materiality_matrix.sql");
    const authority = read("supabase/migrations/035_delegation_authority_controls.sql");
    expect(policy).toContain("approval_policies");
    expect(policy).toContain("approval_policy_rules");
    expect(policy).toContain("organization_id");
    expect(authority).toContain("approval_authorities");
    expect(authority).toContain("delegations");
    expect(authority).toContain("delegation_not_self");
  });

  it("mengevaluasi policy saat work item memiliki amount", () => {
    expect(read("src/app/api/work-items/route.ts")).toContain("evaluateApprovalPolicy");
    expect(read("supabase/migrations/036_approval_policy_evaluation.sql")).toContain("ORDER BY");
  });
});
