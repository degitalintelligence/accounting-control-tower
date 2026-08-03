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
  v_org_id UUID;
  v_slug TEXT := lower(trim(p_slug));
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = '42501';
  END IF;

  IF trim(p_name) = '' OR length(trim(p_name)) > 120 THEN
    RAISE EXCEPTION 'INVALID_ORGANIZATION_NAME' USING ERRCODE = '22023';
  END IF;

  IF v_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' OR length(v_slug) > 80 THEN
    RAISE EXCEPTION 'INVALID_ORGANIZATION_SLUG' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1 FROM memberships
    WHERE profile_id = v_user_id AND is_active = true AND client_id IS NULL
  ) THEN
    RAISE EXCEPTION 'ORGANIZATION_ALREADY_EXISTS' USING ERRCODE = '23505';
  END IF;

  INSERT INTO organizations (name, slug, settings)
  VALUES (trim(p_name), v_slug, jsonb_build_object('timezone', coalesce(nullif(trim(p_timezone), ''), 'Asia/Jakarta'), 'currency', coalesce(nullif(trim(p_currency), ''), 'IDR'), 'onboarding_status', 'active'))
  RETURNING id INTO v_org_id;

  INSERT INTO organization_roles (organization_id, role_key, name, description, is_system)
  SELECT v_org_id, r.role_key, r.name, r.description, true
  FROM (VALUES
    ('owner', 'Owner', 'Akses penuh workspace'),
    ('admin', 'Admin', 'Mengelola workspace dan akses'),
    ('manager', 'Manager', 'Mengelola operasi dan kontrol'),
    ('finance_manager', 'Finance Manager', 'Mengelola operasi keuangan'),
    ('accounting_manager', 'Accounting Manager', 'Mengelola kontrol accounting'),
    ('finance_staff', 'Finance Staff', 'Menjalankan pekerjaan keuangan'),
    ('accounting_staff', 'Accounting Staff', 'Menjalankan pekerjaan accounting'),
    ('viewer', 'Viewer', 'Akses baca saja')
  ) AS r(role_key, name, description);

  INSERT INTO role_permissions (role_id, permission_id)
  SELECT role.id, permission.id
  FROM organization_roles role
  CROSS JOIN permission_catalog permission
  WHERE role.organization_id = v_org_id
    AND role.role_key IN ('owner', 'admin');

  INSERT INTO memberships (profile_id, organization_id, role, role_id, is_active)
  SELECT v_user_id, v_org_id, 'owner', role.id, true
  FROM organization_roles role
  WHERE role.organization_id = v_org_id AND role.role_key = 'owner';

  INSERT INTO audit_logs (organization_id, actor_id, action, entity_type, entity_id, new_value)
  VALUES (v_org_id, v_user_id, 'organization.created', 'organization', v_org_id, jsonb_build_object('name', trim(p_name), 'slug', v_slug));

  RETURN QUERY SELECT v_org_id, trim(p_name), v_slug;
END;
$$;

REVOKE ALL ON FUNCTION acct_ctrl.create_organization_with_owner(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION acct_ctrl.create_organization_with_owner(TEXT, TEXT, TEXT, TEXT) TO authenticated, service_role;
