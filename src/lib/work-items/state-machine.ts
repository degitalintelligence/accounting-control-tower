/**
 * State machine untuk validasi transisi status work item.
 * Enum values sesuai migration 001.
 */

export type WorkItemStatus =
  | "draft"
  | "assigned"
  | "in_progress"
  | "blocked"
  | "submitted"
  | "under_review"
  | "revision_required"
  | "awaiting_approval"
  | "approved"
  | "completed"
  | "cancelled";

/**
 * Peta transisi yang diizinkan: dari status → daftar status tujuan.
 */
const TRANSITIONS: Record<WorkItemStatus, WorkItemStatus[]> = {
  draft: ["assigned", "cancelled"],
  assigned: ["in_progress", "draft", "cancelled"],
  in_progress: ["blocked", "submitted", "cancelled"],
  blocked: ["in_progress", "cancelled"],
  submitted: ["under_review", "in_progress"],
  under_review: ["approved", "revision_required", "cancelled"],
  revision_required: ["in_progress", "cancelled"],
  awaiting_approval: ["approved", "cancelled"],
  approved: ["completed", "awaiting_approval"],
  completed: [],
  cancelled: [],
};

/**
 * Peran assignment yang diperbolehkan untuk melakukan transisi.
 * Kunci = "fromStatus->toStatus", value = role yang boleh.
 * Jika tidak ada di map, siapapun dengan membership boleh.
 */
const ROLE_GUARDS: Partial<Record<string, string[]>> = {
  "submitted->under_review": ["checker"],
  "under_review->approved": ["checker", "approver"],
  "under_review->revision_required": ["checker"],
  "approved->awaiting_approval": ["approver"],
  "awaiting_approval->approved": ["approver"],
  "approved->completed": ["approver"],
};

/**
 * Cek apakah transisi dari `from` ke `to` valid.
 */
export function isValidTransition(
  from: WorkItemStatus,
  to: WorkItemStatus
): boolean {
  const allowed = TRANSITIONS[from];
  if (!allowed) return false;
  return allowed.includes(to);
}

/**
 * Ambil daftar status tujuan yang valid dari status saat ini.
 */
export function getAllowedTransitions(
  current: WorkItemStatus
): WorkItemStatus[] {
  return TRANSITIONS[current] ?? [];
}

/**
 * Cek apakah transisi membutuhkan role tertentu.
 * Return null jika tidak ada guard (siapapun boleh).
 */
export function getRequiredRolesForTransition(
  from: WorkItemStatus,
  to: WorkItemStatus
): string[] | null {
  const key = `${from}->${to}`;
  return ROLE_GUARDS[key] ?? null;
}
