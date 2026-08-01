import { describe, expect, it } from "vitest";
import { slugifyClientName, shouldUpdateClientSlug } from "@/lib/clients";
import { clientCreateSchema, clientUpdateSchema } from "@/lib/validation/schemas";

describe("client slug", () => {
  it("membuat slug dari nama client", () => {
    expect(slugifyClientName("PT Maju & Jaya, Tbk.")).toBe("pt-maju-and-jaya-tbk");
    expect(slugifyClientName("  Äccounting   Nusantara  ")).toBe("accounting-nusantara");
  });

  it("menggunakan fallback untuk nama tanpa karakter slug", () => {
    expect(slugifyClientName("!!!")).toBe("client");
  });

  it("hanya memperbarui slug manual bila masih mengikuti nama lama", () => {
    expect(shouldUpdateClientSlug("pt-maju-jaya", "PT Maju Jaya")).toBe(true);
    expect(shouldUpdateClientSlug("maju-jaya-custom", "PT Maju Jaya")).toBe(false);
  });

  it("tidak menerima slug dari payload API", () => {
    expect(clientCreateSchema.safeParse({ name: "PT Maju Jaya", slug: "custom" }).success).toBe(false);
    expect(clientUpdateSchema.safeParse({ name: "PT Maju Jaya", slug: "custom" }).success).toBe(false);
  });
});
