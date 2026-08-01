import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(__dirname, "..");
const read = (file: string) => readFileSync(resolve(root, file), "utf8");

describe("dashboard KPI analytics contract", () => {
  it("menerapkan tenant, client, periode, dan rollup scope", () => {
    const migration = read("supabase/migrations/029_dashboard_kpi_analytics.sql");
    expect(migration).toContain("wi.organization_id = p_organization_id");
    expect(migration).toContain("p_client_ids IS NULL OR wi.client_id = ANY(p_client_ids)");
    expect(migration).toContain("p_from IS NULL");
    expect(migration).toContain("p_to IS NULL");
    expect(migration).toContain("p_include_rollups OR NOT wi.is_rollup_parent");
  });

  it("memiliki seluruh bucket overdue aging dan hanya menghitung status aktif", () => {
    const migration = read("supabase/migrations/029_dashboard_kpi_analytics.sql");
    for (const bucket of ["1_3", "4_7", "8_14", "15_30", "30_plus"]) expect(migration).toContain(`'${bucket}'`);
    expect(migration).toContain("wi.due_at < now()");
    expect(migration).toContain("wi.status NOT IN ('completed', 'cancelled', 'draft')");
  });

  it("membatasi RPC KPI ke service role", () => {
    const migration = read("supabase/migrations/029_dashboard_kpi_analytics.sql");
    expect(migration).toContain("REVOKE ALL ON FUNCTION acct_ctrl.dashboard_kpi_analytics");
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION acct_ctrl.dashboard_kpi_analytics");
  });

  it("menyediakan empty-safe contract untuk aging di type dan UI", () => {
    const type = read("src/types/dashboard.ts");
    const component = read("src/components/dashboard/overdue-aging-card.tsx");
    expect(type).toContain("OverdueAgingBucket");
    expect(component).toContain("buckets");
    expect(component).toContain("Tidak ada item overdue");
  });
});
