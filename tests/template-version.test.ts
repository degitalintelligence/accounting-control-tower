import { describe, expect, it } from "vitest";
import { resolveChecklistTemplateId } from "@/lib/templates/version";

describe("resolveChecklistTemplateId", () => {
  it("mewariskan checklist dari versi aktif jika versi baru tidak mengirim checklist", () => {
    expect(resolveChecklistTemplateId(undefined, "checklist-aktif")).toBe("checklist-aktif");
  });

  it("menggunakan checklist yang diminta jika tersedia", () => {
    expect(resolveChecklistTemplateId("checklist-baru", "checklist-aktif")).toBe("checklist-baru");
  });

  it("menghasilkan null jika versi aktif tidak memiliki checklist", () => {
    expect(resolveChecklistTemplateId(undefined, null)).toBeNull();
  });
});
