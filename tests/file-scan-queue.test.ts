import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (file: string) => readFileSync(resolve(__dirname, "..", file), "utf8");

describe("file scan queue", () => {
  it("mengizinkan worker file scan dan hanya claim event file scan", () => {
    const migration = read("supabase/migrations/039_fix_file_scan_queue_claim.sql");
    expect(migration).toContain("file-scan-%");
    expect(migration).toContain("file_scan_requested");
  });

  it("menyelesaikan job dengan claim token", () => {
    const worker = read("src/lib/files/scan-worker.ts");
    expect(worker).toContain("claim_token");
    expect(worker).toContain('.eq("claim_token", claimToken)');
  });
});
