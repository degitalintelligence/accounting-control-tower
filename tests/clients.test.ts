import { describe, expect, it } from "vitest";
import { isValidIanaTimezone, slugifyClientName, shouldUpdateClientSlug } from "@/lib/clients";
import { clientArchiveSchema, clientCreateSchema, clientUpdateSchema } from "@/lib/validation/schemas";

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

  it("memvalidasi timezone IANA", () => {
    expect(isValidIanaTimezone("Asia/Jakarta")).toBe(true);
    expect(isValidIanaTimezone("Not/A_Timezone")).toBe(false);
    expect(clientCreateSchema.safeParse({ name: "PT Maju Jaya", timezone: "Not/A_Timezone" }).success).toBe(false);
    expect(clientUpdateSchema.safeParse({ timezone: "Asia/Singapore" }).success).toBe(true);
  });

  it("mewajibkan alasan saat archive", () => {
    expect(clientArchiveSchema.safeParse({ reason: "" }).success).toBe(false);
    expect(clientArchiveSchema.safeParse({ reason: "Client tidak lagi aktif" }).success).toBe(true);
  });
});
