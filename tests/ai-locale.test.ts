import { describe, expect, it, vi } from "vitest";
import { resolveOrganizationLocale } from "@/lib/ai/locale";
import { buildInsightsSystemPrompt, buildReviewAssistantSystemPrompt, buildTaskExtractionSystemPrompt, buildWhatsAppSummarySystemPrompt } from "@/lib/ai/prompts";

describe("locale AI organisasi", () => {
  it.each([
    ["id-ID", "Bahasa Indonesia"],
    ["en-US", "English (United States)"],
  ] as const)("membangun system prompt untuk %s", (locale, expected) => {
    expect(buildTaskExtractionSystemPrompt(locale)).toContain(expected);
    expect(buildReviewAssistantSystemPrompt(locale)).toContain(expected);
    expect(buildInsightsSystemPrompt(locale)).toContain(expected);
    expect(buildWhatsAppSummarySystemPrompt(locale)).toContain(expected);
  });

  it("menggunakan id-ID sebagai fallback untuk locale organisasi yang tidak valid", async () => {
    const admin = {
      from: vi.fn(() => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: { settings: { locale: "fr-FR" } }, error: null }),
          }),
        }),
      })),
    } as never;
    await expect(resolveOrganizationLocale(admin, "org-1")).resolves.toBe("id-ID");
  });

  it("fallback saat lookup organisasi gagal", async () => {
    const admin = {
      from: vi.fn(() => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: null, error: { message: "database unavailable" } }),
          }),
        }),
      })),
    } as never;
    await expect(resolveOrganizationLocale(admin, "org-1")).resolves.toBe("id-ID");
  });
});
