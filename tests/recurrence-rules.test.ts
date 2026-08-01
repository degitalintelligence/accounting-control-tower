import { describe, expect, it } from "vitest";
import { previewOccurrences, validateRRule } from "@/lib/recurrence/rules";

describe("recurrence rules", () => {
  it("memvalidasi rule harian dan weekly wajib memiliki weekday", () => {
    expect(validateRRule("FREQ=DAILY;INTERVAL=1")).toBeNull();
    expect(validateRRule("FREQ=WEEKLY;INTERVAL=1")).toContain("BYDAY");
    expect(validateRRule("FREQ=MONTHLY;BYMONTHDAY=32")).toContain("BYMONTHDAY");
  });

  it("menghasilkan weekday berikutnya sesuai timezone", () => {
    const result = previewOccurrences("FREQ=WEEKLY;BYDAY=MO,WE", "Asia/Jakarta", new Date("2026-08-02T18:00:00Z"), 2);
    expect(result.map((item) => item.date)).toEqual(["2026-08-03", "2026-08-05"]);
  });

  it("memindahkan occurrence hari libur ke hari kerja berikutnya", () => {
    const result = previewOccurrences("FREQ=DAILY", "Asia/Jakarta", new Date("2026-08-02T17:00:00Z"), 1, { holidayHandling: "next_working_day", holidays: ["2026-08-03"] });
    expect(result[0]).toEqual({ date: "2026-08-04", adjusted_from: "2026-08-03" });
  });

  it("membedakan instant UTC dari tanggal lokal timezone", () => {
    const result = previewOccurrences("FREQ=DAILY;INTERVAL=1", "Asia/Jakarta", new Date("2026-08-02T16:59:59Z"), 1);
    expect(result[0].date).toBe("2026-08-02");
  });

  it("memilih versi efektif terakhir untuk occurrence", async () => {
    const { selectTemplateVersion } = await import("@/lib/recurrence/rules");
    expect(selectTemplateVersion([{ version_number: 1, effective_from: "2026-01-01" }, { version_number: 2, effective_from: "2026-09-01" }], "2026-08-02")?.version_number).toBe(1);
  });
});
