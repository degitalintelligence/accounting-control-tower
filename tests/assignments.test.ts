import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { validateAssignment } from '@/lib/work-engine/assignments';

vi.mock('@/lib/supabase/server', () => ({
  createServiceRoleClient: vi.fn(),
}));

const mockedCreateServiceRoleClient = vi.mocked(createServiceRoleClient);

function mockAssignments(assignments: Array<{ profile_id: string; role: 'maker' | 'checker' | 'approver' }>) {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    is: vi.fn(() => query),
    then: (resolve: (value: unknown) => unknown) => resolve({ data: assignments, error: null }),
  };
  mockedCreateServiceRoleClient.mockReturnValue({ from: vi.fn(() => query) } as never);
}

describe('assignment separation of duties', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects assigning a maker as checker', async () => {
    mockAssignments([{ profile_id: 'user-1', role: 'maker' }]);
    await expect(validateAssignment('item-1', 'user-1', 'checker')).resolves.toMatchObject({ valid: false });
  });

  it('rejects assigning a checker as approver and reverse conflicts', async () => {
    mockAssignments([{ profile_id: 'user-1', role: 'checker' }]);
    await expect(validateAssignment('item-1', 'user-1', 'approver')).resolves.toMatchObject({ valid: false });

    mockAssignments([{ profile_id: 'user-1', role: 'approver' }]);
    await expect(validateAssignment('item-1', 'user-1', 'checker')).resolves.toMatchObject({ valid: false });
  });

  it('rejects duplicate roles but allows independent profiles', async () => {
    mockAssignments([{ profile_id: 'user-1', role: 'maker' }]);
    await expect(validateAssignment('item-1', 'user-1', 'maker')).resolves.toMatchObject({ valid: false });

    mockAssignments([{ profile_id: 'user-1', role: 'maker' }]);
    await expect(validateAssignment('item-1', 'user-2', 'checker')).resolves.toEqual({ valid: true, error: null });
  });
});
