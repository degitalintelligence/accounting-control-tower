import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (file: string) => readFileSync(resolve(__dirname, "..", file), "utf8");

describe("async AI intake", () => {
  it("mengembalikan queued response dan tidak memanggil provider dari route", () => {
    const route = read("src/app/api/ai-intake/route.ts");
    expect(route).toContain('status: "pending"');
    expect(route).toContain("enqueue_ai_intake");
    expect(route).toContain("status: 202");
    expect(route).not.toContain("extractTasksFromMessage");
  });

  it("menyediakan durable enqueue dan worker event", () => {
    const migration = read("supabase/migrations/041_async_ai_intake.sql");
    const worker = read("src/lib/whatsapp/ai-extraction-worker.ts");
    expect(migration).toContain("ai_intake_requested");
    expect(migration).toContain("enqueue_ai_intake");
    expect(worker).toContain("processAiIntake");
    expect(worker).toContain('"ai_intake_requested"');
  });
});
