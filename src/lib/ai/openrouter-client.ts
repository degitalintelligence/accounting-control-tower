import "server-only";
import { buildInsightsPrompt, buildReviewAssistantPrompt, buildTaskExtractionPrompt, INSIGHTS_SCHEMA, INSIGHTS_SYSTEM_PROMPT, REVIEW_ASSISTANT_SCHEMA, REVIEW_ASSISTANT_SYSTEM_PROMPT, TASK_EXTRACTION_SCHEMA, TASK_EXTRACTION_SYSTEM_PROMPT } from "./prompts";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_TIMEOUT_MS = 20_000;
const MAX_MESSAGE_LENGTH = 8_000;
const MAX_TITLE_LENGTH = 240;
const MAX_CONTEXT_LENGTH = 500;
const MAX_REASON_LENGTH = 240;
const MAX_REASONS = 5;
const MAX_REVIEW_TEXT_LENGTH = 500;
const MAX_REVIEW_ITEMS = 8;
const MAX_INSIGHT_TEXT_LENGTH = 400;
const MAX_INSIGHT_ITEMS = 4;

const classifications = ["action", "commitment", "deadline", "blocker", "status", "noise"] as const;
const taskTypes = ["routine", "project", "ad_hoc", "report"] as const;

export type TaskClassification = (typeof classifications)[number];
export type SuggestedTaskType = (typeof taskTypes)[number];

export type SuggestedTask = {
  title: string;
  type: SuggestedTaskType;
  maker_name: string | null;
  checker_name: string | null;
  due_date: string | null;
  client_name: string | null;
  source_context: string;
  confidence: number;
  reasons: string[];
};

export type TaskExtraction = {
  classification: TaskClassification;
  tasks: SuggestedTask[];
};

export type ReviewAssistantItem = { area: string; finding: string; severity: "low" | "medium" | "high" };
export type ReviewAssistantResult = {
  summary: string;
  completeness: ReviewAssistantItem[];
  anomalies: ReviewAssistantItem[];
  recommendations: string[];
};
export type DashboardInsights = {
  summary: string;
  priorities: string[];
  signals: string[];
};

export type OpenRouterErrorCode =
  | "CONFIGURATION_ERROR"
  | "TIMEOUT"
  | "NETWORK_ERROR"
  | "PROVIDER_ERROR"
  | "INVALID_RESPONSE";

export class OpenRouterError extends Error {
  readonly code: OpenRouterErrorCode;
  readonly status?: number;

  constructor(code: OpenRouterErrorCode, message: string, status?: number) {
    super(message);
    this.name = "OpenRouterError";
    this.code = code;
    this.status = status;
  }
}

function getConfig() {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const model = process.env.OPENROUTER_MODEL ?? process.env.OPENROUTER_TEXT_MODEL;
  if (!apiKey || !model) {
    throw new OpenRouterError("CONFIGURATION_ERROR", "OpenRouter belum dikonfigurasi.");
  }

  const timeoutValue = Number(process.env.OPENROUTER_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS);
  const timeoutMs = Number.isFinite(timeoutValue) && timeoutValue >= 1_000 && timeoutValue <= 120_000
    ? timeoutValue
    : DEFAULT_TIMEOUT_MS;

  const configuredBaseUrl = process.env.OPENROUTER_BASE_URL?.replace(/\/$/, "");
  const baseUrl = configuredBaseUrl
    ? configuredBaseUrl.endsWith("/chat/completions")
      ? configuredBaseUrl
      : `${configuredBaseUrl}/chat/completions`
    : OPENROUTER_URL;

  return {
    apiKey,
    model,
    timeoutMs,
    baseUrl,
  };
}

function limitText(value: string, maxLength: number): string {
  return value.trim().replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").slice(0, maxLength);
}

export function sanitizeMessage(message: string): string {
  return limitText(message, MAX_MESSAGE_LENGTH);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nullableText(value: unknown, maxLength: number): string | null {
  if (value === null) return null;
  if (typeof value !== "string") throw new OpenRouterError("INVALID_RESPONSE", "Output AI memiliki tipe field tidak valid.");
  const text = limitText(value, maxLength);
  return text || null;
}

function validateReviewItem(value: unknown): ReviewAssistantItem {
  if (!isRecord(value) || typeof value.area !== "string" || typeof value.finding !== "string" || !["low", "medium", "high"].includes(value.severity as string)) {
    throw new OpenRouterError("INVALID_RESPONSE", "Output AI review memiliki finding tidak valid.");
  }
  return {
    area: limitText(value.area, MAX_REVIEW_TEXT_LENGTH),
    finding: limitText(value.finding, MAX_REVIEW_TEXT_LENGTH),
    severity: value.severity as ReviewAssistantItem["severity"],
  };
}

export function validateReviewAssistant(value: unknown): ReviewAssistantResult {
  if (!isRecord(value) || typeof value.summary !== "string" || !Array.isArray(value.completeness) || !Array.isArray(value.anomalies) || !Array.isArray(value.recommendations) || value.completeness.length > MAX_REVIEW_ITEMS || value.anomalies.length > MAX_REVIEW_ITEMS || value.recommendations.length > MAX_REVIEW_ITEMS || !value.recommendations.every((entry) => typeof entry === "string")) {
    throw new OpenRouterError("INVALID_RESPONSE", "Output AI review tidak sesuai schema.");
  }
  return {
    summary: limitText(value.summary, MAX_REVIEW_TEXT_LENGTH),
    completeness: value.completeness.map(validateReviewItem),
    anomalies: value.anomalies.map(validateReviewItem),
    recommendations: value.recommendations.map((entry) => limitText(entry, MAX_REVIEW_TEXT_LENGTH)).filter(Boolean),
  };
}

export function validateDashboardInsights(value: unknown): DashboardInsights {
  if (!isRecord(value) || typeof value.summary !== "string" || !Array.isArray(value.priorities) || !Array.isArray(value.signals) || value.priorities.length > 3 || value.signals.length > MAX_INSIGHT_ITEMS || !value.priorities.every((entry) => typeof entry === "string") || !value.signals.every((entry) => typeof entry === "string")) {
    throw new OpenRouterError("INVALID_RESPONSE", "Output AI insights tidak sesuai schema.");
  }
  return {
    summary: limitText(value.summary, MAX_INSIGHT_TEXT_LENGTH),
    priorities: value.priorities.map((entry) => limitText(entry, MAX_INSIGHT_TEXT_LENGTH)).filter(Boolean),
    signals: value.signals.map((entry) => limitText(entry, MAX_INSIGHT_TEXT_LENGTH)).filter(Boolean),
  };
}

function validateTask(value: unknown): SuggestedTask {
  if (!isRecord(value)) throw new OpenRouterError("INVALID_RESPONSE", "Output AI memiliki task tidak valid.");
  const title = value.title;
  const type = value.type;
  const confidence = value.confidence;
  const sourceContext = value.source_context;
  const reasons = value.reasons;

  if (typeof title !== "string" || !title.trim() || !taskTypes.includes(type as SuggestedTaskType)) {
    throw new OpenRouterError("INVALID_RESPONSE", "Output AI memiliki task tidak valid.");
  }
  if (typeof confidence !== "number" || !Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    throw new OpenRouterError("INVALID_RESPONSE", "Confidence AI tidak valid.");
  }
  if (typeof sourceContext !== "string" || !Array.isArray(reasons) || reasons.length > MAX_REASONS) {
    throw new OpenRouterError("INVALID_RESPONSE", "Output AI memiliki konteks atau alasan tidak valid.");
  }
  if (!reasons.every((reason) => typeof reason === "string")) {
    throw new OpenRouterError("INVALID_RESPONSE", "Output AI memiliki alasan tidak valid.");
  }

  const dueDate = nullableText(value.due_date, 10);
  if (dueDate !== null && !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
    throw new OpenRouterError("INVALID_RESPONSE", "Tanggal task AI tidak valid.");
  }

  return {
    title: limitText(title, MAX_TITLE_LENGTH),
    type: type as SuggestedTaskType,
    maker_name: nullableText(value.maker_name, 120),
    checker_name: nullableText(value.checker_name, 120),
    due_date: dueDate,
    client_name: nullableText(value.client_name, 160),
    source_context: limitText(sourceContext, MAX_CONTEXT_LENGTH),
    confidence,
    reasons: reasons.map((reason) => limitText(reason, MAX_REASON_LENGTH)).filter(Boolean),
  };
}

export function validateTaskExtraction(value: unknown): TaskExtraction {
  if (!isRecord(value) || !classifications.includes(value.classification as TaskClassification) || !Array.isArray(value.tasks)) {
    throw new OpenRouterError("INVALID_RESPONSE", "Output AI tidak sesuai schema extraction.");
  }
  return {
    classification: value.classification as TaskClassification,
    tasks: value.tasks.map(validateTask),
  };
}

function parseProviderContent(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    throw new OpenRouterError("INVALID_RESPONSE", "Provider mengembalikan JSON yang tidak valid.");
  }
}

export async function extractTasksFromMessage(message: string): Promise<TaskExtraction> {
  const cleanMessage = sanitizeMessage(message);
  if (!cleanMessage) return { classification: "noise", tasks: [] };

  const config = getConfig();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const response = await fetch(config.baseUrl, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
        ...(process.env.OPENROUTER_HTTP_REFERER ? { "HTTP-Referer": process.env.OPENROUTER_HTTP_REFERER } : {}),
        ...(process.env.OPENROUTER_APP_TITLE ? { "X-Title": process.env.OPENROUTER_APP_TITLE } : {}),
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          { role: "system", content: TASK_EXTRACTION_SYSTEM_PROMPT },
          { role: "user", content: buildTaskExtractionPrompt(cleanMessage) },
        ],
        temperature: 0,
        response_format: { type: "json_schema", json_schema: { name: "task_extraction", strict: true, schema: TASK_EXTRACTION_SCHEMA } },
        provider: { data_collection: "deny" },
      }),
    });

    if (!response.ok) {
      throw new OpenRouterError("PROVIDER_ERROR", "OpenRouter mengembalikan error.", response.status);
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new OpenRouterError("INVALID_RESPONSE", "Respons OpenRouter bukan JSON.");
    }

    if (!isRecord(payload) || !Array.isArray(payload.choices) || !isRecord(payload.choices[0])) {
      throw new OpenRouterError("INVALID_RESPONSE", "Struktur respons OpenRouter tidak valid.");
    }
    const messagePayload = payload.choices[0].message;
    if (!isRecord(messagePayload)) throw new OpenRouterError("INVALID_RESPONSE", "Content OpenRouter tidak valid.");
    return validateTaskExtraction(parseProviderContent(messagePayload.content));
  } catch (error) {
    if (error instanceof OpenRouterError) throw error;
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new OpenRouterError("TIMEOUT", "Permintaan OpenRouter timeout.");
    }
    throw new OpenRouterError("NETWORK_ERROR", "OpenRouter tidak dapat dihubungi.");
  } finally {
    clearTimeout(timeout);
  }
}

async function callOpenRouter(systemPrompt: string, userPrompt: string, schema: object, schemaName: string): Promise<unknown> {
  const config = getConfig();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
  try {
    const response = await fetch(config.baseUrl, {
      method: "POST",
      signal: controller.signal,
      headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json", ...(process.env.OPENROUTER_HTTP_REFERER ? { "HTTP-Referer": process.env.OPENROUTER_HTTP_REFERER } : {}), ...(process.env.OPENROUTER_APP_TITLE ? { "X-Title": process.env.OPENROUTER_APP_TITLE } : {}) },
      body: JSON.stringify({ model: config.model, messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }], temperature: 0, response_format: { type: "json_schema", json_schema: { name: schemaName, strict: true, schema } }, provider: { data_collection: "deny" } }),
    });
    if (!response.ok) throw new OpenRouterError("PROVIDER_ERROR", "OpenRouter mengembalikan error.", response.status);
    const payload = await response.json() as unknown;
    if (!isRecord(payload) || !Array.isArray(payload.choices) || !isRecord(payload.choices[0]) || !isRecord(payload.choices[0].message)) throw new OpenRouterError("INVALID_RESPONSE", "Struktur respons OpenRouter tidak valid.");
    return parseProviderContent(payload.choices[0].message.content);
  } catch (error) {
    if (error instanceof OpenRouterError) throw error;
    if (error instanceof DOMException && error.name === "AbortError") throw new OpenRouterError("TIMEOUT", "Permintaan OpenRouter timeout.");
    throw new OpenRouterError("NETWORK_ERROR", "OpenRouter tidak dapat dihubungi.");
  } finally {
    clearTimeout(timeout);
  }
}

export async function assistReview(context: string): Promise<ReviewAssistantResult> {
  const cleanContext = limitText(context, 4_000);
  if (!cleanContext) throw new OpenRouterError("INVALID_RESPONSE", "Konteks review kosong.");
  return validateReviewAssistant(await callOpenRouter(REVIEW_ASSISTANT_SYSTEM_PROMPT, buildReviewAssistantPrompt(cleanContext), REVIEW_ASSISTANT_SCHEMA, "review_assistant"));
}

export async function generateDashboardInsights(context: string): Promise<DashboardInsights> {
  const cleanContext = limitText(context, 4_000);
  if (!cleanContext) throw new OpenRouterError("INVALID_RESPONSE", "Konteks insights kosong.");
  return validateDashboardInsights(await callOpenRouter(INSIGHTS_SYSTEM_PROMPT, buildInsightsPrompt(cleanContext), INSIGHTS_SCHEMA, "dashboard_insights"));
}
