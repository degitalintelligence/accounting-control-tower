import "server-only";

export type ExplicitTaskCommand = {
  title: string;
  clientRef: string;
  dueAt: string | null;
  makerParticipantId: string | null;
  checkerParticipantId: string | null;
};

export type ExplicitWorkItemCommand = {
  action: "update" | "submit" | "status";
  workItemId: string;
  status: string | null;
  reason: string | null;
};

function parseParts(value: string) {
  return value.split("|").map((part) => part.trim()).filter(Boolean);
}

export function parseExplicitCommand(content: string | null): ExplicitTaskCommand | null {
  if (!content?.trim().toLowerCase().startsWith("/task ")) return null;
  const parts = parseParts(content.trim().slice(6));
  const title = parts.shift()?.trim() ?? "";
  const values = new Map<string, string>();
  for (const part of parts) {
    const separator = part.indexOf(":");
    if (separator < 1) return null;
    values.set(part.slice(0, separator).trim().toLowerCase(), part.slice(separator + 1).trim());
  }
  const clientRef = values.get("client") ?? "";
  const due = values.get("due") ?? null;
  if (!title || !clientRef || (due && !/^\d{4}-\d{2}-\d{2}$/.test(due))) return null;
  return {
    title: title.slice(0, 500),
    clientRef: clientRef.slice(0, 200),
    dueAt: due ? `${due}T23:59:59.000Z` : null,
    makerParticipantId: values.get("maker") ?? null,
    checkerParticipantId: values.get("checker") ?? null,
  };
}

export function parseExplicitWorkItemCommand(content: string | null): ExplicitWorkItemCommand | null {
  const match = content?.trim().match(/^\/(update|submit|status)\s+([^\s|]+)(?:\s*\|\s*(.*))?$/i);
  if (!match || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(match[2])) return null;
  const values = new Map<string, string>();
  for (const part of (match[3] ?? "").split("|").map((part) => part.trim()).filter(Boolean)) {
    const separator = part.indexOf(":");
    if (separator < 1) return null;
    values.set(part.slice(0, separator).trim().toLowerCase(), part.slice(separator + 1).trim());
  }
  return { action: match[1].toLowerCase() as ExplicitWorkItemCommand["action"], workItemId: match[2], status: values.get("status") ?? null, reason: values.get("reason") ?? null };
}

export function explicitCommandHelp() {
  return "Format: /task Judul tugas | client:<nama atau slug client> | due:YYYY-MM-DD | maker:<participant> | checker:<participant>. Update: /update <work_item_id> | status:<status> | reason:<alasan>. Submit: /submit <work_item_id>. Status: /status <work_item_id>.";
}
