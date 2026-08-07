import { describe, expect, it } from "vitest";

describe("WAHA cleanup migration", () => {
  it("mempertahankan mapping claim worker lama dan menambahkan cleanup", async () => {
    const migration = await import("node:fs/promises").then((fs) => fs.readFile("supabase/migrations/080_waha_cleanup_after_organization_archive.sql", "utf8"));
    expect(migration).toContain("p_event_type = 'notification'");
    expect(migration).toContain("waha_session_cleanup_requested");
    expect(migration).toContain("waha-cleanup-%");
  });

  it("memperlakukan session WAHA yang sudah hilang sebagai sukses", async () => {
    const worker = await import("node:fs/promises").then((fs) => fs.readFile("src/lib/whatsapp/waha-cleanup-worker.ts", "utf8"));
    expect(worker).toContain("error.status === 404");
    expect(worker).toContain("continue;");
    expect(worker).toContain("deleteWahaSession(sessionId)");
  });
});
