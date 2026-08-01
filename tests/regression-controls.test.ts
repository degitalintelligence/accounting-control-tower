import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(__dirname, "..");
const read = (file: string) => readFileSync(resolve(root, file), "utf8");

describe("regression controls", () => {
  it("membatasi queue event pada event_type yang diklaim", () => {
  const migration = read("supabase/migrations/028_fix_whatsapp_worker_claim.sql");
    expect(migration).toContain("o.event_type = p_event_type");
    expect(migration).toContain("p_event_type = 'notification' AND o.event_type IN");
  });

  it("mengunci analytics report pada service role dan scope tenant", () => {
    const migration = read("supabase/migrations/025_report_analytics_rpc.sql");
    expect(migration).toContain("wi.organization_id = p_organization_id");
    expect(migration).toContain("p_client_ids IS NULL OR wi.client_id = ANY(p_client_ids)");
    expect(migration).toContain("REVOKE ALL ON FUNCTION acct_ctrl.report_analytics(UUID, UUID[]) FROM PUBLIC");
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION acct_ctrl.report_analytics(UUID, UUID[]) TO service_role");
  });

  it("memastikan report hanya completed setelah delivered", () => {
    const migration = read("supabase/migrations/021_report_evidence_audit_controls.sql");
    expect(migration).toContain("NEW.status = 'completed' AND NEW.report_stage <> 'delivered'");
    expect(migration).toContain("p_stage = 'delivered' AND NULLIF(BTRIM(p_delivery_reference), '') IS NULL");
  });

  it("memastikan evidence route dan trigger menjaga lock", () => {
    const route = read("src/app/api/work-items/[id]/files/route.ts");
    const migration = read("supabase/migrations/021_report_evidence_audit_controls.sql");
    expect(route).toContain("Evidence work item sudah terkunci.");
    expect(route).toContain(".eq(\"organization_id\", organizationId)");
    expect(migration).toContain("SET is_locked = true");
  });

  it("memastikan transition dan report API mengikat organisasi serta client scope", () => {
    const transition = read("src/app/api/work-items/[id]/transition/route.ts");
    const report = read("src/app/api/reports/route.ts");
    const reportStage = read("src/app/api/work-items/[id]/report/route.ts");
    expect(transition).toContain(".eq(\"organization_id\", organizationId)");
    expect(report).toContain("p_organization_id: organizationId");
    expect(report).toContain("p_client_ids: isOrgWide ? null : clientIds");
    expect(reportStage).toContain(".eq(\"organization_id\", organizationId)");
    expect(reportStage).toContain("itemData.data.type !== \"report\"");
  });
});
