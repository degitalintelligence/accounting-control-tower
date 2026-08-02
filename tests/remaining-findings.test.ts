import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (file: string) => readFileSync(resolve(__dirname, "..", file), "utf8");

describe("remaining findings", () => {
  it("meneruskan seluruh field bisnis ke RPC assignment", () => {
    const route = read("src/app/api/work-items/route.ts");
    for (const field of ["p_business_period", "p_amount", "p_currency_code", "p_approval_requirement", "p_required_approval_level", "p_approval_policy_id", "p_approval_policy_version", "p_policy_evaluated_at", "p_checklist_template_id"]) expect(route).toContain(field);
  });

  it("membatasi digest dan summary pada organisasi", () => {
    const scheduling = read("src/lib/notification/scheduling.ts");
    const worker = read("src/lib/whatsapp/ai-extraction-worker.ts");
    expect(scheduling).toContain("byOrganization");
    expect(scheduling).toContain("digest:${organizationId}");
    expect(worker).toContain('eq("wa_groups.organization_id", organizationId)');
  });

  it("menyediakan deduplikasi draft dan decision untuk retry", () => {
    const migration = read("supabase/migrations/065_complete_work_item_ai_retry_isolation.sql");
    const worker = read("src/lib/whatsapp/ai-extraction-worker.ts");
    expect(migration).toContain("idx_ai_draft_items_intake_task_key");
    expect(migration).toContain("idx_whatsapp_decisions_topic_identity");
    expect(worker).toContain('onConflict: "intake_id,source_task_key"');
    expect(worker).toContain('onConflict: "topic_id,title,decision_value"');
  });
});
