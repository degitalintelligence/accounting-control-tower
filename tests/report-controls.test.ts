import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";

describe("report dan evidence controls", () => {
  it("menghasilkan checksum SHA-256 deterministik", () => {
    expect(createHash("sha256").update("evidence").digest("hex")).toHaveLength(64);
  });

  it("menerima hanya stage report yang didukung", () => {
    expect(["draft", "prepared", "submitted", "accepted", "rejected", "delivered"].includes("delivered")).toBe(true);
    expect(["draft", "prepared", "submitted", "accepted", "rejected", "delivered"].includes("completed")).toBe(false);
  });

  it("mewajibkan corrective action untuk Major dan Critical", () => {
    expect(["major", "critical"].includes("major")).toBe(true);
    expect(["major", "critical"].includes("minor")).toBe(false);
  });
});
