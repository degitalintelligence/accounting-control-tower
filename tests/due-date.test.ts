import { afterEach, describe, expect, it, vi } from 'vitest';
import { calculateDueDate, getDaysUntilDue, isAtRisk, isOverdue } from '@/lib/work-engine/due-date';

describe('due-date and escalation flags', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('calculates offsets without database or clock dependencies', () => {
    expect(calculateDueDate('2026-01-10T00:00:00.000Z', null, 3)?.toISOString()).toBe('2026-01-13T00:00:00.000Z');
    expect(calculateDueDate(null, null)).toBeNull();
    expect(calculateDueDate('invalid-date', null)).toBeNull();
  });

  it('classifies overdue and at-risk deadlines', () => {
    vi.setSystemTime(new Date('2026-01-10T12:00:00.000Z'));
    expect(isOverdue('2026-01-10T11:59:59.000Z')).toBe(true);
    expect(isOverdue('2026-01-10T12:00:01.000Z')).toBe(false);
    expect(isAtRisk('2026-01-11T11:59:59.000Z')).toBe(true);
    expect(isAtRisk('2026-01-11T12:00:01.000Z')).toBe(false);
    expect(isAtRisk('2026-01-10T11:59:59.000Z')).toBe(false);
  });

  it('reports remaining days consistently for escalation consumers', () => {
    vi.setSystemTime(new Date('2026-01-10T12:00:00.000Z'));
    expect(getDaysUntilDue('2026-01-12T12:00:00.000Z')).toBe(2);
    expect(getDaysUntilDue('2026-01-09T12:00:00.000Z')).toBe(-1);
    expect(getDaysUntilDue('not-a-date')).toBeNull();
  });
});
