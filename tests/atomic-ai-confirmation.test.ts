import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (file: string) => readFileSync(resolve(__dirname, "..", file), "utf8");

describe("atomic AI draft confirmation", () => {
  it("menggunakan RPC transactional pada route", () => {
    const route = read("src/app/api/ai-intake/[id]/confirm/route.ts");
    expect(route).toContain("confirm_ai_draft_item");
    expect(route).not.toContain('.from("work_items").insert');
    expect(route).not.toContain('.from("assignments").insert');
  });

  it("mengunci draft dan mengembalikan hasil idempotent", () => {
    const migration = read("supabase/migrations/042_atomic_ai_draft_confirmation.sql");
    expect(migration).toContain("FOR UPDATE");
    expect(migration).toContain("confirmed_work_item_id");
    expect(migration).toContain("RETURN QUERY SELECT draft.id");
  });

  it("worker menyelesaikan outbox dengan claim token", () => {
    const worker = read("src/lib/whatsapp/ai-extraction-worker.ts");
    expect(worker).toContain('.eq("claim_token", row.claim_token)');
  });
});
