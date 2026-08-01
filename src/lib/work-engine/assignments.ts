import { createServiceRoleClient } from '@/lib/supabase/server';
import type { Assignment, AssignmentRole } from '@/types/work-item';

/**
 * Helper type cast — Supabase generic inference returns `never` due to
 * `[key: string]: unknown` catch-all in Database type.
 */
type SupabaseResult<T> = { data: T | null; error: { message: string } | null };

/**
 * Assign user ke work item dengan role tertentu.
 * Validasi: maker tidak boleh jadi checker, checker tidak boleh jadi approver.
 */
export async function assignUser(
  workItemId: string,
  profileId: string,
  role: AssignmentRole,
  assignedBy?: string
): Promise<{ data: Assignment | null; error: string | null }> {
  // Validasi conflict sebelum insert
  const conflictCheck = await validateAssignment(workItemId, profileId, role);
  if (!conflictCheck.valid) {
    return { data: null, error: conflictCheck.error };
  }

  const supabase = createServiceRoleClient();

  const result = await supabase
    .from('assignments')
    .insert({
      work_item_id: workItemId,
      profile_id: profileId,
      role,
      assigned_by: assignedBy ?? null,
    } as never)
    .select()
    .single();

  const { data, error } = result as unknown as SupabaseResult<Assignment>;

  if (error) {
    return { data: null, error: error.message };
  }

  return { data, error: null };
}

/**
 * Unassign user dari work item (soft delete — set unassigned_at).
 */
export async function unassignUser(
  workItemId: string,
  profileId: string,
  role: AssignmentRole
): Promise<{ error: string | null }> {
  const supabase = createServiceRoleClient();

  const result = await supabase
    .from('assignments')
    .update({ unassigned_at: new Date().toISOString() } as never)
    .eq('work_item_id', workItemId)
    .eq('profile_id', profileId)
    .eq('role', role)
    .is('unassigned_at', null);

  const { error } = result as unknown as { error: { message: string } | null };

  if (error) {
    return { error: error.message };
  }

  return { error: null };
}

/**
 * Ambil semua assignment aktif (belum di-unassign) untuk work item.
 */
export async function getAssignments(
  workItemId: string
): Promise<{ data: Assignment[]; error: string | null }> {
  const supabase = createServiceRoleClient();

  const result = await supabase
    .from('assignments')
    .select('id, work_item_id, profile_id, role, assigned_by, assigned_at, unassigned_at, reason')
    .eq('work_item_id', workItemId)
    .is('unassigned_at', null);

  const { data, error } = result as unknown as {
    data: Assignment[] | null;
    error: { message: string } | null;
  };

  if (error) {
    return { data: [], error: error.message };
  }

  return { data: data ?? [], error: null };
}

/**
 * Validasi apakah assignment baru akan menimbulkan conflict.
 * Rules:
 * - Maker tidak boleh jadi checker pada work item yang sama
 * - Checker tidak boleh jadi approver pada work item yang sama
 * - Satu profile tidak boleh punya role yang sama dua kali
 */
export async function validateAssignment(
  workItemId: string,
  profileId: string,
  newRole: AssignmentRole
): Promise<{ valid: boolean; error: string | null }> {
  const { data: existing, error } = await getAssignments(workItemId);
  if (error) {
    return { valid: false, error: `Gagal mengambil assignment: ${error}` };
  }

  const userAssignments = existing.filter((a) => a.profile_id === profileId);
  const userRoles = userAssignments.map((a) => a.role);

  // Sudah punya role yang sama
  if (userRoles.includes(newRole)) {
    return {
      valid: false,
      error: 'User sudah memiliki role ini pada work item yang sama',
    };
  }

  // Maker tidak boleh jadi checker
  if (newRole === 'checker' && userRoles.includes('maker')) {
    return {
      valid: false,
      error: 'Maker tidak boleh menjadi checker pada work item yang sama (separation of duties)',
    };
  }

  // Checker tidak boleh jadi approver
  if (newRole === 'approver' && userRoles.includes('checker')) {
    return {
      valid: false,
      error: 'Checker tidak boleh menjadi approver pada work item yang sama',
    };
  }

  // Reverse checks: user sudah jadi checker, tidak boleh jadi maker
  if (newRole === 'maker' && userRoles.includes('checker')) {
    return {
      valid: false,
      error: 'Checker tidak boleh menjadi maker pada work item yang sama (separation of duties)',
    };
  }

  // User sudah jadi approver, tidak boleh jadi checker
  if (newRole === 'checker' && userRoles.includes('approver')) {
    return {
      valid: false,
      error: 'Approver tidak boleh menjadi checker pada work item yang sama',
    };
  }

  return { valid: true, error: null };
}

/**
 * Ambil role user pada work item tertentu (hanya assignment aktif).
 */
export async function getUserRole(
  workItemId: string,
  profileId: string
): Promise<AssignmentRole | null> {
  const supabase = createServiceRoleClient();

  const result = await supabase
    .from('assignments')
    .select('role')
    .eq('work_item_id', workItemId)
    .eq('profile_id', profileId)
    .is('unassigned_at', null)
    .single();

  const { data } = result as unknown as { data: { role: string } | null };

  return (data?.role as AssignmentRole) ?? null;
}
