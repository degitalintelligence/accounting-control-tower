import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (file: string) => readFileSync(resolve(__dirname, "..", file), "utf8");

describe("WhatsApp outbound delivery", () => {
  it("mencatat attempt append-only dan membatasi akses tenant", () => {
    const migration = read("supabase/migrations/057_whatsapp_outbound_delivery_tracking.sql");
    expect(migration).toContain("whatsapp_delivery_attempts");
    expect(migration).toContain("BEFORE UPDATE OR DELETE");
    expect(migration).toContain("organization_id");
  });

  it("mengirim menggunakan session connection, bukan konfigurasi global", () => {
    const adapter = read("src/lib/whatsapp/adapter.ts");
    const worker = read("src/lib/notification/outbox-worker.ts");
    expect(adapter).toContain("sendWahaText(session: WhatsAppSession");
    expect(adapter).toContain("requireActiveWhatsAppSession(session)");
    expect(worker).toContain("organizationId: event.organizationId");
    expect(worker).toContain("provider_message_id");
  });
});
