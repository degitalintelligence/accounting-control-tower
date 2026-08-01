import { describe, expect, it } from "vitest";

describe("WhatsApp connection retirement migration", () => {
  it("menyediakan uniqueness provider dan session pada koneksi aktif maupun retired", async () => {
    const migration = await import("node:fs/promises").then((fs) => fs.readFile("supabase/migrations/045_whatsapp_connection_retirement.sql", "utf8"));
    expect(migration).toContain("CREATE UNIQUE INDEX IF NOT EXISTS idx_integration_connections_provider_session");
    expect(migration).toContain("WHERE session_id IS NOT NULL");
  });

  it("meretire koneksi dan menonaktifkan grup melalui satu RPC", async () => {
    const migration = await import("node:fs/promises").then((fs) => fs.readFile("supabase/migrations/045_whatsapp_connection_retirement.sql", "utf8"));
    expect(migration).toContain("status = 'retired'");
    expect(migration).toContain("SET is_active = false");
  });
});
