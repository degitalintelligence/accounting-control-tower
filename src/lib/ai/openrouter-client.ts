import "server-only";
import { buildInsightsPrompt, buildInsightsSystemPrompt, buildReviewAssistantPrompt, buildReviewAssistantSystemPrompt, buildTaskExtractionPrompt, buildTaskExtractionSystemPrompt, buildWhatsAppSummaryPrompt, buildWhatsAppSummarySystemPrompt, INSIGHTS_SCHEMA, REVIEW_ASSISTANT_SCHEMA, TASK_EXTRACTION_SCHEMA, WHATSAPP_SUMMARY_SCHEMA } from "./prompts";
import type { AppLocale } from "@/lib/i18n";

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
export type WhatsAppSummaryResult = {
  summary: string;
  actions: { title: string; evidence: string; message_ids: string[]; confidence: number; kind?: "work_item" | "project" | "update" }[];
  topics?: { key: string; title: string; summary: string; classifications: string[]; message_ids: string[] }[];
  facts?: { topic_key: string; key: string; value: string; message_ids: string[]; confidence: number }[];
  decisions?: { topic_key: string; title: string; value: string; message_ids: string[]; confidence: number }[];
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

export function validateWhatsAppSummary(value: unknown): WhatsAppSummaryResult {
  if (!isRecord(value) || typeof value.summary !== "string" || !Array.isArray(value.actions) || value.actions.length > 5) throw new OpenRouterError("INVALID_RESPONSE", "Output AI summary WhatsApp tidak sesuai schema.");
  const actions = value.actions.filter(isRecord).map((action) => {
    if (typeof action.title !== "string" || typeof action.evidence !== "string" || !Array.isArray(action.message_ids) || !action.message_ids.every((entry) => typeof entry === "string") || typeof action.confidence !== "number" || action.confidence < 0 || action.confidence > 1) throw new OpenRouterError("INVALID_RESPONSE", "Saran tindakan WhatsApp tidak valid.");
    return { title: limitText(action.title, 240), evidence: limitText(action.evidence, 500), message_ids: action.message_ids.filter((entry): entry is string => typeof entry === "string").slice(0, 20), confidence: action.confidence };
  });
  if (actions.length !== value.actions.length) throw new OpenRouterError("INVALID_RESPONSE", "Saran tindakan WhatsApp tidak valid.");
  const topics = Array.isArray(value.topics) ? value.topics.filter(isRecord).map((topic) => ({ key: limitText(String(topic.key ?? "general"), 120), title: limitText(String(topic.title ?? "Topik percakapan"), 240), summary: limitText(String(topic.summary ?? ""), 600), classifications: Array.isArray(topic.classifications) ? topic.classifications.filter((entry): entry is string => typeof entry === "string").slice(0, 9) : [], message_ids: Array.isArray(topic.message_ids) ? topic.message_ids.filter((entry): entry is string => typeof entry === "string").slice(0, 100) : [] })) : [];
  const facts = Array.isArray(value.facts) ? value.facts.filter(isRecord).map((fact) => ({ topic_key: limitText(String(fact.topic_key ?? "general"), 120), key: limitText(String(fact.key ?? "detail"), 120), value: limitText(String(fact.value ?? ""), 500), message_ids: Array.isArray(fact.message_ids) ? fact.message_ids.filter((entry): entry is string => typeof entry === "string").slice(0, 20) : [], confidence: typeof fact.confidence === "number" ? Math.max(0, Math.min(1, fact.confidence)) : 0 } )) : [];
  const decisions = Array.isArray(value.decisions) ? value.decisions.filter(isRecord).map((decision) => ({ topic_key: limitText(String(decision.topic_key ?? "general"), 120), title: limitText(String(decision.title ?? "Keputusan"), 240), value: limitText(String(decision.value ?? ""), 500), message_ids: Array.isArray(decision.message_ids) ? decision.message_ids.filter((entry): entry is string => typeof entry === "string").slice(0, 20) : [], confidence: typeof decision.confidence === "number" ? Math.max(0, Math.min(1, decision.confidence)) : 0 } )) : [];
  return { summary: limitText(value.summary, 1200), actions, topics, facts, decisions };
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

function extractBalancedJson(text: string): string | null {
  for (let start = 0; start < text.length; start += 1) {
    if (text[start] !== "{" && text[start] !== "[") continue;
    const stack: string[] = [];
    let inString = false;
    let escaped = false;
    for (let index = start; index < text.length; index += 1) {
      const character = text[index];
      if (inString) {
        if (escaped) escaped = false;
        else if (character === "\\") escaped = true;
        else if (character === '"') inString = false;
        continue;
      }
      if (character === '"') {
        inString = true;
        continue;
      }
      if (character === "{" || character === "[") {
        stack.push(character);
        continue;
      }
      if (character !== "}" && character !== "]") continue;
      const expected = character === "}" ? "{" : "[";
      if (stack.pop() !== expected) break;
      if (!stack.length) return text.slice(start, index + 1);
    }
  }
  return null;
}

export function extractJsonValue(value: string): unknown {
  const text = value.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  try {
    return JSON.parse(text);
  } catch {
    const balanced = extractBalancedJson(text);
    if (!balanced) throw new OpenRouterError("INVALID_RESPONSE", "Provider mengembalikan JSON yang tidak valid.");
    try {
      return JSON.parse(balanced);
    } catch {
      throw new OpenRouterError("INVALID_RESPONSE", "Provider mengembalikan JSON yang tidak valid.");
    }
  }
}

function parseProviderContent(value: unknown): unknown {
  if (typeof value === "string") return extractJsonValue(value);
  if (Array.isArray(value)) {
    const text = value
      .filter(isRecord)
      .map((part) => part.text)
      .filter((part): part is string => typeof part === "string")
      .join("\n");
    if (text) return extractJsonValue(text);
  }
  if (isRecord(value)) return value;
  throw new OpenRouterError("INVALID_RESPONSE", "Content OpenRouter tidak valid.");
}

export function parseOpenRouterPayload(payload: unknown): unknown {
  if (!isRecord(payload) || !Array.isArray(payload.choices) || !isRecord(payload.choices[0])) {
    throw new OpenRouterError("INVALID_RESPONSE", "Struktur respons OpenRouter tidak valid.");
  }
  const messagePayload = payload.choices[0].message;
  if (!isRecord(messagePayload)) throw new OpenRouterError("INVALID_RESPONSE", "Content OpenRouter tidak valid.");
  if (isRecord(messagePayload.parsed)) return messagePayload.parsed;
  if (typeof messagePayload.refusal === "string" && messagePayload.refusal.trim()) {
    throw new OpenRouterError("INVALID_RESPONSE", "OpenRouter menolak menghasilkan output terstruktur.");
  }
  return parseProviderContent(messagePayload.content);
}

function isAbortError(error: unknown): boolean {
  return isRecord(error) && error.name === "AbortError";
}

export async function extractTasksFromMessage(message: string, locale: AppLocale): Promise<TaskExtraction> {
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
          { role: "system", content: buildTaskExtractionSystemPrompt(locale) },
          { role: "user", content: buildTaskExtractionPrompt(cleanMessage, locale) },
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

    return validateTaskExtraction(parseOpenRouterPayload(payload));
  } catch (error) {
    if (error instanceof OpenRouterError) throw error;
    if (isAbortError(error)) {
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
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new OpenRouterError("INVALID_RESPONSE", "Respons OpenRouter bukan JSON.");
    }
    return parseOpenRouterPayload(payload);
  } catch (error) {
    if (error instanceof OpenRouterError) throw error;
    if (isAbortError(error)) throw new OpenRouterError("TIMEOUT", "Permintaan OpenRouter timeout.");
    throw new OpenRouterError("NETWORK_ERROR", "OpenRouter tidak dapat dihubungi.");
  } finally {
    clearTimeout(timeout);
  }
}

export async function assistReview(context: string, locale: AppLocale): Promise<ReviewAssistantResult> {
  const cleanContext = limitText(context, 4_000);
  if (!cleanContext) throw new OpenRouterError("INVALID_RESPONSE", "Konteks review kosong.");
  return validateReviewAssistant(await callOpenRouter(buildReviewAssistantSystemPrompt(locale), buildReviewAssistantPrompt(cleanContext, locale), REVIEW_ASSISTANT_SCHEMA, "review_assistant"));
}

export async function generateDashboardInsights(context: string, locale: AppLocale): Promise<DashboardInsights> {
  const cleanContext = limitText(context, 4_000);
  if (!cleanContext) throw new OpenRouterError("INVALID_RESPONSE", "Konteks insights kosong.");
  return validateDashboardInsights(await callOpenRouter(buildInsightsSystemPrompt(locale), buildInsightsPrompt(cleanContext, locale), INSIGHTS_SCHEMA, "dashboard_insights"));
}

export async function generateWhatsAppSummary(context: string, locale: AppLocale): Promise<WhatsAppSummaryResult> {
  const cleanContext = limitText(context, 12_000);
  if (!cleanContext) return { summary: locale === "en-US" ? "There are no operational messages to summarize." : "Tidak ada pesan operasional yang dapat diringkas.", actions: [] };
  return validateWhatsAppSummary(await callOpenRouter(buildWhatsAppSummarySystemPrompt(locale), buildWhatsAppSummaryPrompt(cleanContext), WHATSAPP_SUMMARY_SCHEMA, "whatsapp_conversation_summary"));
}
