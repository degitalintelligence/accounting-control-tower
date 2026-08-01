DELETE FROM acct_ctrl.memberships duplicate_membership
USING acct_ctrl.memberships retained_membership
WHERE duplicate_membership.profile_id = retained_membership.profile_id
  AND duplicate_membership.organization_id = retained_membership.organization_id
  AND duplicate_membership.client_id IS NOT DISTINCT FROM retained_membership.client_id
  AND duplicate_membership.entity_id IS NOT DISTINCT FROM retained_membership.entity_id
  AND duplicate_membership.role = retained_membership.role
  AND (
    duplicate_membership.created_at > retained_membership.created_at
    OR (
      duplicate_membership.created_at = retained_membership.created_at
      AND duplicate_membership.id > retained_membership.id
    )
  );

CREATE UNIQUE INDEX IF NOT EXISTS memberships_idempotency_key
ON acct_ctrl.memberships (
  profile_id,
  organization_id,
  COALESCE(client_id, '00000000-0000-0000-0000-000000000000'::uuid),
  COALESCE(entity_id, '00000000-0000-0000-0000-000000000000'::uuid),
  role
);
