import "server-only";

export type ExplicitTaskCommand = {
  title: string;
  clientId: string;
  dueAt: string | null;
  makerParticipantId: string | null;
  checkerParticipantId: string | null;
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
  const clientId = values.get("client") ?? "";
  const due = values.get("due") ?? null;
  if (!title || !uuidPattern.test(clientId) || (due && !/^\d{4}-\d{2}-\d{2}$/.test(due))) return null;
  return {
    title: title.slice(0, 500),
    clientId,
    dueAt: due ? `${due}T23:59:59.000Z` : null,
    makerParticipantId: values.get("maker") ?? null,
    checkerParticipantId: values.get("checker") ?? null,
  };
}

export function explicitCommandHelp() {
  return "Format: /task Judul tugas | client:<UUID client> | due:YYYY-MM-DD | maker:<participant> | checker:<participant>";
}
