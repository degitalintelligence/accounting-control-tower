import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const migration = readFileSync(resolve(__dirname, "../supabase/migrations/030_business_task_duplicate_warning.sql"), "utf8");

describe("business task duplicate warning", () => {
  it("menyimpan business identity dan normalisasi judul", () => {
    expect(migration).toContain("business_period TEXT");
    expect(migration).toContain("title_normalized TEXT");
    expect(migration).toContain("regexp_replace(btrim(p_title)");
    expect(migration).toContain("trg_set_work_item_title_normalized");
  });

  it("membatasi kandidat pada tenant, business key, dan status aktif", () => {
    expect(migration).toContain("wi.organization_id = p_organization_id");
    expect(migration).toContain("wi.client_id = p_client_id");
    expect(migration).toContain("wi.type = p_type");
    expect(migration).toContain("wi.entity_id IS NOT DISTINCT FROM p_entity_id");
    expect(migration).toContain("wi.section_id IS NOT DISTINCT FROM p_section_id");
    expect(migration).toContain("wi.status NOT IN ('completed', 'cancelled')");
  });

  it("menghasilkan warning server-side sebelum override", () => {
    const route = readFileSync(resolve(__dirname, "../src/app/api/work-items/route.ts"), "utf8");
    expect(route).toContain("find_business_task_duplicates");
    expect(route).toContain("DUPLICATE_BUSINESS_TASK");
    expect(route).toContain('duplicateAction !== "allow"');
  });
});
