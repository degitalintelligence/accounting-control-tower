-- Fix: create_organization_with_owner RPC failing due to missing profile for the current user.
-- This happens if the handle_new_user trigger failed or was bypassed.
-- Also ensures only the 4 streamlined system roles are created.

CREATE OR REPLACE FUNCTION acct_ctrl.create_organization_with_owner(
  p_name TEXT,
  p_slug TEXT,
  p_timezone TEXT DEFAULT 'Asia/Jakarta',
  p_currency TEXT DEFAULT 'IDR'
)
RETURNS TABLE(organization_id UUID, organization_name TEXT, organization_slug TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = acct_ctrl, public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_user_email TEXT := auth.jwt() ->> 'email';
  v_org_id UUID;
  v_slug TEXT := lower(trim(p_slug));
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = '42501';
  END IF;

  -- ENSURE PROFILE EXISTS: Fixes memberships_profile_id_fkey violation
  INSERT INTO profiles (id, display_name, email)
  VALUES (
    v_user_id,
    COALESCE(v_user_email, split_part(v_user_email, '@', 1), 'User'),
    v_user_email
  )
  ON CONFLICT (id) DO NOTHING;

  IF trim(p_name) = '' OR length(trim(p_name)) > 120 THEN
    RAISE EXCEPTION 'INVALID_ORGANIZATION_NAME' USING ERRCODE = '22023';
  END IF;

  IF v_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' OR length(v_slug) > 80 THEN
    RAISE EXCEPTION 'INVALID_ORGANIZATION_SLUG' USING ERRCODE = '22023';
  END IF;

  INSERT INTO organizations (name, slug, settings)
  VALUES (
    trim(p_name),
    v_slug,
    jsonb_build_object(
      'timezone', coalesce(nullif(trim(p_timezone), ''), 'Asia/Jakarta'),
      'currency', coalesce(nullif(trim(p_currency), ''), 'IDR'),
      'onboarding_status', 'active'
    )
  )
  RETURNING id INTO v_org_id;

  -- Streamlined roles: owner, administrator, team_leader, staff
  INSERT INTO organization_roles (organization_id, role_key, name, description, is_system)
  VALUES
    (v_org_id, 'owner', 'Owner', 'Akses penuh workspace dan kepemilikan organisasi', true),
    (v_org_id, 'administrator', 'Administrator', 'Mengelola workspace, akses, dan konfigurasi operasi', true),
    (v_org_id, 'team_leader', 'Team Leader', 'Mengelola pekerjaan, kapasitas, review, dan eskalasi tim', true),
    (v_org_id, 'staff', 'Staff', 'Menjalankan pekerjaan dan mengirimkan hasil untuk ditinjau', true)
  ON CONFLICT (organization_id, role_key) DO NOTHING;

  INSERT INTO role_permissions (role_id, permission_id)
  SELECT role.id, permission.id
  FROM organization_roles role
  CROSS JOIN permission_catalog permission
  WHERE role.organization_id = v_org_id
    AND (
      role.role_key IN ('owner', 'administrator')
      OR (
        role.role_key = 'team_leader'
        AND permission.permission_key IN (
          'workspace.view', 'members.view', 'clients.view',
          'work_items.view', 'work_items.create', 'work_items.manage',
          'work_items.review', 'work_items.approve', 'work_items.due_date.manage',
          'reports.view', 'reports.manage', 'sop.view', 'sop.manage',
          'checklists.view', 'checklists.manage', 'approval_policies.view',
          'approval_authorities.view', 'delegations.view', 'planned_leaves.view',
          'planned_leaves.manage', 'planned_leaves.approve', 'escalations.view',
          'escalations.manage', 'ai_review.view', 'ai_review.use', 'ai_review.decide'
        )
      )
      OR (
        role.role_key = 'staff'
        AND permission.permission_key IN (
          'workspace.view', 'clients.view', 'work_items.view', 'work_items.create', 'work_items.execute',
          'sop.view', 'checklists.view', 'reports.view', 'planned_leaves.view',
          'ai_review.view', 'ai_review.use'
        )
      )
    )
  ON CONFLICT DO NOTHING;

  INSERT INTO memberships (profile_id, organization_id, role, role_id, is_active)
  SELECT v_user_id, v_org_id, 'owner', role.id, true
  FROM organization_roles role
  WHERE role.organization_id = v_org_id
    AND role.role_key = 'owner'
  ON CONFLICT (profile_id, organization_id, client_id, entity_id, role) DO UPDATE
  SET role_id = EXCLUDED.role_id, is_active = true;

  INSERT INTO audit_logs (organization_id, actor_id, action, entity_type, entity_id, new_value, metadata)
  VALUES (
    v_org_id,
    v_user_id,
    'organization.created',
    'organization',
    v_org_id,
    jsonb_build_object('name', trim(p_name), 'slug', v_slug),
    '{}'::jsonb
  );

  RETURN QUERY SELECT v_org_id, trim(p_name), v_slug;
END;
$$;
