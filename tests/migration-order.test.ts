import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (file: string) => readFileSync(resolve(__dirname, "..", file), "utf8");

describe("migration history policy", () => {
  it("menetapkan history append-only dan urutan migration", () => {
    const order = read("supabase/migrations/MIGRATION_ORDER.md");
    expect(order).toContain("Do not rename, delete, or edit");
    const entries = [...order.matchAll(/^([0-9]{3}_[a-z0-9_]+\.sql)$/gm)].map(([entry]) => entry);
    expect(new Set(entries).size).toBe(entries.length);
    expect(entries.slice(-6)).toEqual([
      "045_whatsapp_connection_retirement.sql",
      "046_complete_checklist_workflow.sql",
      "046_grant_ai_policies_access.sql",
      "047_grant_planned_leaves_access.sql",
      "048_whatsapp_connection_retirement.sql",
      "049_whatsapp_conversation_summaries.sql",
    ]);
    const migrationFiles = readdirSync(resolve(__dirname, "..", "supabase/migrations"))
      .filter((file) => /^\d{3}_.+\.sql$/.test(file));
    expect(entries).toEqual([...migrationFiles].sort());
  });

  it("menyediakan registry migration yang hanya dapat diakses service role", () => {
    const migration = read("supabase/migrations/040_migration_history_policy.sql");
    expect(migration).toContain("migration_history");
    expect(migration).toContain("REVOKE ALL ON TABLE");
    expect(migration).toContain("service_role");
  });
});
