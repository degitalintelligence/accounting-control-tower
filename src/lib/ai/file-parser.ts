import "server-only";

import { parseOffice } from "officeparser";

const MAX_OUTPUT_LENGTH = 50_000;
const textExtensions = new Set(["txt", "csv", "json", "md", "log"]);
const officeExtensions = new Set(["pdf", "docx", "xlsx", "pptx"]);
const ocrLanguage = process.env.OCR_LANGUAGE?.trim() || "ind+eng";

export class FileParserError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FileParserError";
  }
}

function extensionOf(filename: string): string {
  return filename.toLowerCase().split(".").pop() ?? "";
}

function normalizeText(value: string): string {
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, " ")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, MAX_OUTPUT_LENGTH);
}

export function isSupportedDocument(filename: string, mimeType: string | null): boolean {
  const extension = extensionOf(filename);
  return textExtensions.has(extension) || officeExtensions.has(extension) || mimeType?.startsWith("text/") === true;
}

export async function extractTextFromFile(buffer: Buffer, filename: string, mimeType: string | null): Promise<string> {
  const extension = extensionOf(filename);
  if (!isSupportedDocument(filename, mimeType)) {
    throw new FileParserError("Format file belum didukung. Gunakan TXT, CSV, JSON, MD, LOG, Word, PDF, Excel, atau PowerPoint.");
  }

  if (textExtensions.has(extension) || (mimeType?.startsWith("text/") && !officeExtensions.has(extension))) {
    return normalizeText(buffer.toString("utf8"));
  }

  try {
    const parsed = await parseOffice(buffer, {
      includeRawContent: false,
      extractAttachments: true,
      ocr: true,
      ocrConfig: {
        language: ocrLanguage,
        timeout: {
          workerLoad: 60_000,
          recognition: 30_000,
          autoTerminate: 10_000,
        },
      },
    });
    const text = parsed.toText();
    return normalizeText(typeof text === "string" ? text : String(text));
  } catch {
    throw new FileParserError(`File ${filename} tidak dapat dibaca. Pastikan file tidak rusak atau diproteksi password.`);
  }
}
