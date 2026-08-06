export const escalationLevels = ["maker", "team_lead", "accounting_manager", "owner"] as const;
export const escalationPriorities = ["low", "medium", "high", "critical"] as const;

type EscalationLevel = (typeof escalationLevels)[number];
type EscalationPriority = (typeof escalationPriorities)[number];

export type EscalationRuleInput = {
  threshold_hours: number;
  level: EscalationLevel;
  priority: EscalationPriority;
  recipient_roles?: string[];
};

const levelRank: Record<EscalationLevel, number> = {
  maker: 0,
  team_lead: 1,
  accounting_manager: 2,
  owner: 3,
};

export function validateEscalationRules(value: unknown): { rules: EscalationRuleInput[] | null; error: string | null } {
  if (!Array.isArray(value) || value.length === 0) return { rules: null, error: "Minimal satu aturan eskalasi wajib diisi." };

  const rules: EscalationRuleInput[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") return { rules: null, error: "Format aturan eskalasi tidak valid." };
    const candidate = item as Record<string, unknown>;
    const threshold = candidate.threshold_hours;
    const level = candidate.level;
    const priority = candidate.priority;
    const recipientRoles = candidate.recipient_roles;
    if (typeof threshold !== "number" || !Number.isFinite(threshold) || threshold <= 0) return { rules: null, error: "threshold_hours harus berupa angka lebih besar dari 0." };
    if (typeof level !== "string" || !escalationLevels.includes(level as EscalationLevel)) return { rules: null, error: "level eskalasi tidak valid." };
    if (typeof priority !== "string" || !escalationPriorities.includes(priority as EscalationPriority)) return { rules: null, error: "priority eskalasi tidak valid." };
    if (recipientRoles !== undefined && (!Array.isArray(recipientRoles) || recipientRoles.some((role) => typeof role !== "string" || !role.trim()))) return { rules: null, error: "recipient_roles harus berupa daftar role yang valid." };
    rules.push({ threshold_hours: threshold, level: level as EscalationLevel, priority: priority as EscalationPriority, ...(recipientRoles === undefined ? {} : { recipient_roles: recipientRoles as string[] }) });
  }

  for (let index = 1; index < rules.length; index++) {
    if (rules[index].threshold_hours <= rules[index - 1].threshold_hours) return { rules: null, error: "threshold_hours harus meningkat di setiap level." };
    if (levelRank[rules[index].level] < levelRank[rules[index - 1].level]) return { rules: null, error: "level eskalasi tidak boleh menurun." };
  }

  return { rules, error: null };
}
