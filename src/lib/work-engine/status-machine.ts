import type {
  WorkItemStatus,
  AssignmentRole,
  StatusTransition,
  TransitionResult,
} from '@/types/work-item';

/**
 * Semua transisi status yang valid beserta role yang diizinkan.
 * - 'system' = otomatis oleh sistem / admin
 * - Assignment role = maker, checker, approver
 */
const TRANSITIONS: StatusTransition[] = [
  // Draft → Assigned (system/admin)
  {
    from: 'draft',
    to: 'assigned',
    allowedRoles: ['system', 'administrator'],
  },

  // Assigned → In Progress (maker)
  {
    from: 'assigned',
    to: 'in_progress',
    allowedRoles: ['maker'],
  },

  // In Progress → Blocked (maker/system)
  {
    from: 'in_progress',
    to: 'blocked',
    allowedRoles: ['maker', 'system'],
    requiresReason: true,
  },

  // In Progress → Submitted (maker)
  {
    from: 'in_progress',
    to: 'submitted',
    allowedRoles: ['maker'],
  },

  // Blocked → In Progress (maker/system)
  {
    from: 'blocked',
    to: 'in_progress',
    allowedRoles: ['maker', 'system'],
  },

  // Submitted → Under Review (checker)
  {
    from: 'submitted',
    to: 'under_review',
    allowedRoles: ['checker'],
  },

  // Submitted → Revision Required (checker)
  {
    from: 'submitted',
    to: 'revision_required',
    allowedRoles: ['checker'],
    requiresReason: true,
  },

  // Under Review → Approved (checker/approver)
  {
    from: 'under_review',
    to: 'approved',
    allowedRoles: ['checker', 'approver'],
  },

  // Under Review → Revision Required (checker)
  {
    from: 'under_review',
    to: 'revision_required',
    allowedRoles: ['checker'],
    requiresReason: true,
  },

  // Revision Required → In Progress (maker, untuk revisi ulang)
  {
    from: 'revision_required',
    to: 'in_progress',
    allowedRoles: ['maker'],
  },

  // Revision Required → Submitted (maker, langsung submit ulang)
  {
    from: 'revision_required',
    to: 'submitted',
    allowedRoles: ['maker'],
  },

  // Approved → Completed (system/admin, auto-complete)
  {
    from: 'approved',
    to: 'completed',
    allowedRoles: ['system', 'administrator'],
  },

  // Approved → Awaiting Approval (system, high-risk flow)
  {
    from: 'approved',
    to: 'awaiting_approval',
    allowedRoles: ['system'],
    highRiskOnly: true,
  },

  // Awaiting Approval → Completed (approver)
  {
    from: 'awaiting_approval',
    to: 'completed',
    allowedRoles: ['approver'],
  },

  // Awaiting Approval → Revision Required (approver, tolak)
  {
    from: 'awaiting_approval',
    to: 'revision_required',
    allowedRoles: ['approver'],
    requiresReason: true,
  },
];

/** Status yang bukan terminal (belum completed/cancelled) */
const ACTIVE_STATUSES: WorkItemStatus[] = [
  'draft',
  'assigned',
  'in_progress',
  'blocked',
  'submitted',
  'under_review',
  'revision_required',
  'awaiting_approval',
  'approved',
];

// Generate cancel transitions for all active statuses
const CANCEL_TRANSITIONS: StatusTransition[] = ACTIVE_STATUSES.map((from) => ({
  from,
  to: 'cancelled' as WorkItemStatus,
  allowedRoles: ['administrator'],
  requiresReason: true,
}));

const ALL_TRANSITIONS = [...TRANSITIONS, ...CANCEL_TRANSITIONS];

/**
 * Cek apakah transisi dari status `from` ke `to` valid untuk role tertentu.
 */
export function canTransition(
  from: WorkItemStatus,
  to: WorkItemStatus,
  userRole: AssignmentRole | 'system' | 'administrator'
): boolean {
  const transition = ALL_TRANSITIONS.find((t) => t.from === from && t.to === to);
  if (!transition) return false;
  return transition.allowedRoles.includes(userRole);
}

/**
 * Ambil daftar status yang bisa dituju dari status saat ini untuk role tertentu.
 */
export function getAvailableTransitions(
  currentStatus: WorkItemStatus,
  userRole: AssignmentRole | 'system' | 'administrator'
): StatusTransition[] {
  return ALL_TRANSITIONS.filter(
    (t) => t.from === currentStatus && t.allowedRoles.includes(userRole)
  );
}

/**
 * Ambil definisi transisi spesifik (untuk cek requiresReason, highRiskOnly, dll).
 */
export function getTransition(
  from: WorkItemStatus,
  to: WorkItemStatus
): StatusTransition | undefined {
  return ALL_TRANSITIONS.find((t) => t.from === from && t.to === to);
}

/**
 * Validasi dan eksekusi transisi work item.
 * Tidak melakukan update database — hanya validasi dan return result.
 *
 * Caller bertanggung jawab untuk:
 * 1. Cek assignment conflict (maker-checker) via `validateAssignment`
 * 2. Simpan status baru ke database
 * 3. Insert status history
 */
export function transitionWorkItem(
  item: { status: WorkItemStatus; risk_level?: string; priority?: string },
  newStatus: WorkItemStatus,
  userRole: AssignmentRole | 'system' | 'administrator',
  reason?: string
): TransitionResult {
  // Transisi ke status yang sama = no-op
  if (item.status === newStatus) {
    return {
      success: false,
      error: 'Sudah berada di status yang dituju',
    };
  }

  // Cari transisi yang valid
  const transition = getTransition(item.status, newStatus);
  if (!transition) {
    return {
      success: false,
      error: `Transisi dari "${item.status}" ke "${newStatus}" tidak diizinkan`,
    };
  }

  // Cek role
  if (!transition.allowedRoles.includes(userRole)) {
    return {
      success: false,
      error: `Role "${userRole}" tidak diizinkan melakukan transisi ini`,
    };
  }

  // Cek requiresReason
  if (transition.requiresReason && (!reason || reason.trim().length === 0)) {
    return {
      success: false,
      error: `Alasan wajib diisi untuk transisi ke "${newStatus}"`,
    };
  }

  // Cek highRiskOnly — based on risk_level, not priority
  if (transition.highRiskOnly && item.risk_level !== 'critical' && item.risk_level !== 'high') {
    return {
      success: false,
      error: 'Transisi ini hanya untuk work item berisiko tinggi/kritis',
    };
  }

  return {
    success: true,
    newStatus,
  };
}
