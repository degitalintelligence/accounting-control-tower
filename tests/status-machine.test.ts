import { describe, expect, it } from 'vitest';
import { canTransition, getAvailableTransitions, transitionWorkItem } from '@/lib/work-engine/status-machine';

describe('status machine', () => {
  it('allows the normal maker-to-checker flow', () => {
    expect(canTransition('draft', 'assigned', 'admin')).toBe(true);
    expect(canTransition('assigned', 'in_progress', 'maker')).toBe(true);
    expect(canTransition('in_progress', 'submitted', 'maker')).toBe(true);
    expect(canTransition('submitted', 'under_review', 'checker')).toBe(true);
  });

  it('rejects invalid transitions and roles', () => {
    expect(canTransition('draft', 'in_progress', 'maker')).toBe(false);
    expect(canTransition('submitted', 'approved', 'checker')).toBe(false);
    expect(transitionWorkItem({ status: 'in_progress' }, 'blocked', 'maker').success).toBe(false);
  });

  it('requires a reason and high risk for guarded transitions', () => {
    expect(transitionWorkItem({ status: 'in_progress' }, 'blocked', 'maker')).toMatchObject({
      success: false,
    });
    expect(transitionWorkItem({ status: 'in_progress' }, 'blocked', 'maker', 'Menunggu data')).toEqual({
      success: true,
      newStatus: 'blocked',
    });
    expect(transitionWorkItem({ status: 'approved', risk_level: 'low' }, 'awaiting_approval', 'system')).toMatchObject({
      success: false,
    });
    expect(transitionWorkItem({ status: 'approved', risk_level: 'critical' }, 'awaiting_approval', 'system')).toEqual({
      success: true,
      newStatus: 'awaiting_approval',
    });
  });

  it('exposes only transitions allowed for the current role', () => {
    expect(getAvailableTransitions('submitted', 'maker')).toHaveLength(0);
    expect(getAvailableTransitions('submitted', 'checker').map((transition) => transition.to)).toEqual([
      'under_review',
      'revision_required',
    ]);
  });
});
