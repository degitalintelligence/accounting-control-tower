import { describe, expect, it } from "vitest";
import { extractJsonValue, OpenRouterError, validateTaskExtraction } from "@/lib/ai/openrouter-client";

describe("OpenRouter client", () => {
  it("mengekstrak JSON dari markdown fence dan teks pembuka", () => {
    expect(extractJsonValue('Berikut hasilnya:\n```json\n{"classification":"noise","tasks":[]}\n```')).toEqual({ classification: "noise", tasks: [] });
  });

  it("menghormati kurung di dalam string JSON", () => {
    expect(extractJsonValue('Hasil: {"text":"gunakan {tanggal}"}')).toEqual({ text: "gunakan {tanggal}" });
  });

  it("menolak content yang tidak berisi JSON", () => {
    expect(() => extractJsonValue("provider sedang sibuk")).toThrowError(OpenRouterError);
  });

  it("memvalidasi hasil setelah ekstraksi", () => {
    expect(validateTaskExtraction(extractJsonValue('{"classification":"noise","tasks":[]}'))).toEqual({ classification: "noise", tasks: [] });
  });

  it("menghasilkan error provider yang tidak memuat secret", () => {
    const error = new OpenRouterError("PROVIDER_ERROR", "OpenRouter mengembalikan error.", 429);
    expect(error.message).not.toContain("Bearer");
    expect(error.message).not.toContain("OPENROUTER_API_KEY");
  });
});
