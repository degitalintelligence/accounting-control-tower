import { describe, expect, it } from "vitest";
import { createTranslator, formatDate, isAppLocale } from "@/lib/i18n";

describe("organization UI locale", () => {
  it("accepts only supported locales", () => {
    expect(isAppLocale("id-ID")).toBe(true);
    expect(isAppLocale("en-US")).toBe(true);
    expect(isAppLocale("fr-FR")).toBe(false);
  });

  it("translates shared navigation labels", () => {
    expect(createTranslator("id-ID")("nav.summary")).toBe("Ringkasan");
    expect(createTranslator("en-US")("nav.summary")).toBe("Overview");
  });

  it("formats dates with the selected locale", () => {
    const date = new Date("2026-01-15T00:00:00.000Z");
    expect(formatDate(date, "id-ID", { month: "long" })).toBe("Januari");
    expect(formatDate(date, "en-US", { month: "long" })).toBe("January");
  });

  it("provides localized AI and WhatsApp fallback labels", () => {
    expect(createTranslator("id-ID")("common.notAvailable")).toBe("Belum ditentukan");
    expect(createTranslator("en-US")("common.notAvailable")).toBe("Not specified");
    expect(createTranslator("id-ID")("whatsapp.confirmTask")).toBe("Konfirmasi & buat tugas");
    expect(createTranslator("en-US")("whatsapp.confirmTask")).toBe("Confirm & create task");
  });
});
