-- =============================================================
-- Migration 002: Auth trigger + seed data
-- Auto-create profile on Supabase Auth signup, seed org
-- =============================================================

-- 1. Trigger function: auto-create profile when auth.users inserts
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
  );
  RETURN NEW;
END;
$$;

-- 2. Attach trigger to auth.users
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION acct_ctrl.handle_new_user();

-- 3. Seed: default organization
INSERT INTO acct_ctrl.organizations (id, name, slug, settings)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Kreasheet Accounting',
  'kreasheet',
  '{"timezone": "Asia/Jakarta", "currency": "IDR"}'::jsonb
)
ON CONFLICT (slug) DO NOTHING;
