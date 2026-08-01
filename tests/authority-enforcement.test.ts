import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (file: string) => readFileSync(resolve(__dirname, "..", file), "utf8");

describe("authority enforcement", () => {
  it("menyediakan resolver direct dan delegated authority", () => {
    const migration = read("supabase/migrations/037_authority_enforcement_snapshots.sql");
    expect(migration).toContain("resolve_effective_authority");
    expect(migration).toContain("authorization_source");
    expect(migration).toContain("d.status = 'active'");
  });

  it("memblokir assignment material tanpa authority", () => {
    expect(read("src/app/api/work-items/[id]/assign/route.ts")).toContain("INSUFFICIENT_APPROVAL_AUTHORITY");
    expect(read("src/app/api/work-items/[id]/assign/route.ts")).toContain("authorization_snapshot");
  });
});
