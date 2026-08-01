type LeaveConflict = { leave_id: string; start_date: string; end_date: string; status: "pending" | "approved" };

export async function validateAssigneeAvailability(admin: unknown, organizationId: string, profileId: string, startAt: string | null, dueAt: string | null, acknowledged = false) {
  const startDate = (startAt ?? dueAt)?.slice(0, 10);
  const endDate = (dueAt ?? startAt)?.slice(0, 10);
  if (!startDate || !endDate) return { valid: true, warning: null, conflicts: [] as LeaveConflict[] };
  const result = await (((admin as { rpc: (...args: unknown[]) => unknown }).rpc("check_planned_leave_conflict", { p_organization_id: organizationId, p_profile_id: profileId, p_start_date: startDate, p_end_date: endDate })) as unknown as Promise<unknown>);
  const query = result as unknown as { data: LeaveConflict[] | null; error: { message: string; code?: string; hint?: string; details?: string } | null };
  if (query.error) throw query.error;
  const conflicts = query.data ?? [];
  const approved = conflicts.filter((conflict) => conflict.status === "approved");
  if (approved.length) return { valid: false, warning: null, code: "ASSIGNEE_ON_APPROVED_LEAVE", conflicts };
  if (conflicts.length && !acknowledged) return { valid: false, warning: "ASSIGNEE_LEAVE_WARNING", code: "ASSIGNEE_LEAVE_WARNING", conflicts };
  return { valid: true, warning: null, conflicts };
}
