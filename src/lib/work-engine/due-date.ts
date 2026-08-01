import type { Json } from '@/types/work-item';

/** Threshold default untuk "at risk" = 24 jam sebelum deadline */
const DEFAULT_AT_RISK_HOURS = 24;

/**
 * Hitung due date berikutnya berdasarkan scheduled date dan recurrence rule.
 *
 * Recurrence rule format (sederhana, bisa diperluas):
 * - `{ frequency: 'daily' }`
 * - `{ frequency: 'weekly', day: 1 }` (0=Min, 1=Sen, ..., 6=Sab)
 * - `{ frequency: 'monthly', day: 15 }` (tanggal dalam bulan)
 * - `{ frequency: 'quarterly' }`
 * - `{ frequency: 'yearly' }`
 *
 * Jika tidak ada recurrence, return scheduledDate + offsetDays.
 */
export function calculateDueDate(
  scheduledDate: string | null,
  recurrenceRule: Json | null,
  offsetDays: number = 0
): Date | null {
  if (!scheduledDate) return null;

  const base = new Date(scheduledDate);
  if (isNaN(base.getTime())) return null;

  // Tanpa recurrence → offset dari scheduled date
  if (!recurrenceRule) {
    const result = new Date(base);
    result.setDate(result.getDate() + offsetDays);
    return result;
  }

  const rule = recurrenceRule as Record<string, unknown>;
  const frequency = rule.frequency as string | undefined;

  if (!frequency) {
    const result = new Date(base);
    result.setDate(result.getDate() + offsetDays);
    return result;
  }

  const now = new Date();
  const next = new Date(base);

  switch (frequency) {
    case 'daily':
      // Cari hari berikutnya setelah sekarang
      while (next <= now) {
        next.setDate(next.getDate() + 1);
      }
      break;

    case 'weekly': {
      const targetDay = (rule.day as number) ?? 1; // default Senin
      while (next.getDay() !== targetDay || next <= now) {
        next.setDate(next.getDate() + 1);
      }
      break;
    }

    case 'monthly': {
      const targetDate = (rule.day as number) ?? 1;
      next.setDate(targetDate);
      if (next <= now) {
        next.setMonth(next.getMonth() + 1);
        next.setDate(targetDate);
      }
      break;
    }

    case 'quarterly': {
      const currentMonth = now.getMonth();
      const nextQuarterStart = Math.ceil((currentMonth + 1) / 3) * 3;
      next.setMonth(nextQuarterStart);
      next.setDate(1);
      if (next <= now) {
        next.setMonth(nextQuarterStart + 3);
      }
      break;
    }

    case 'yearly':
      next.setFullYear(next.getFullYear() + 1);
      while (next <= now) {
        next.setFullYear(next.getFullYear() + 1);
      }
      break;

    default: {
      // Fallback: offset days
      const result = new Date(base);
      result.setDate(result.getDate() + offsetDays);
      return result;
    }
  }

  return next;
}

/**
 * Cek apakah work item sudah melewati due date.
 */
export function isOverdue(dueDate: string | null): boolean {
  if (!dueDate) return false;
  const due = new Date(dueDate);
  if (isNaN(due.getTime())) return false;
  return due.getTime() < Date.now();
}

/**
 * Cek apakah work item mendekati deadline (dalam threshold jam).
 */
export function isAtRisk(
  dueDate: string | null,
  hoursThreshold: number = DEFAULT_AT_RISK_HOURS
): boolean {
  if (!dueDate) return false;
  const due = new Date(dueDate);
  if (isNaN(due.getTime())) return false;

  const now = Date.now();
  const thresholdMs = hoursThreshold * 60 * 60 * 1000;

  // Sudah overdue
  if (due.getTime() < now) return false;

  // Dalam threshold
  return due.getTime() - now <= thresholdMs;
}

/**
 * Hitung sisa hari sampai due date (positif = belum jatuh tempo, negatif = overdue).
 */
export function getDaysUntilDue(dueDate: string | null): number | null {
  if (!dueDate) return null;
  const due = new Date(dueDate);
  if (isNaN(due.getTime())) return null;

  const diffMs = due.getTime() - Date.now();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}
