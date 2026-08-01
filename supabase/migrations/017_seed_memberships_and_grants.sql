-- Ensure application roles can use the application schema and seed users receive access.
GRANT USAGE ON SCHEMA acct_ctrl TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA acct_ctrl TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA acct_ctrl TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA acct_ctrl TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA acct_ctrl TO authenticated;

CREATE OR REPLACE FUNCTION acct_ctrl.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO acct_ctrl.profiles (id, display_name, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.raw_user_meta_data ->> 'name', split_part(NEW.email, '@', 1)),
    NEW.email
  )
  ON CONFLICT (id) DO UPDATE
  SET display_name = EXCLUDED.display_name, email = EXCLUDED.email;

  INSERT INTO acct_ctrl.memberships (profile_id, organization_id, role, is_active)
  SELECT NEW.id, o.id, 'finance_staff', true
  FROM acct_ctrl.organizations o
  WHERE o.slug = 'kreasheet'
  ON CONFLICT (profile_id, organization_id, client_id, entity_id, role) DO UPDATE
  SET is_active = true;

  RETURN NEW;
END;
$$;

INSERT INTO acct_ctrl.memberships (profile_id, organization_id, role, is_active)
SELECT p.id, o.id, 'finance_staff', true
FROM acct_ctrl.profiles p
JOIN auth.users u ON u.id = p.id
JOIN acct_ctrl.organizations o ON o.slug = 'kreasheet'
WHERE u.email IN ('admin@kreasheet.com', 'manager@kreasheet.com', 'staff@kreasheet.com')
ON CONFLICT (profile_id, organization_id, client_id, entity_id, role) DO UPDATE
SET is_active = true;
