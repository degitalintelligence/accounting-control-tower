-- Fix: handle_new_user trigger to be more robust and multi-tenant friendly.
-- 1. Removes hardcoded 'kreasheet' slug auto-membership.
-- 2. Ensures profile creation is robust.
-- 3. Sets explicit search_path for security.

CREATE OR REPLACE FUNCTION acct_ctrl.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = acct_ctrl, public
AS $$
DECLARE
  v_display_name TEXT;
BEGIN
  -- Determine display name from metadata or email
  v_display_name := COALESCE(
    NEW.raw_user_meta_data ->> 'full_name',
    NEW.raw_user_meta_data ->> 'name',
    split_part(NEW.email, '@', 1),
    'User'
  );

  -- Ensure profile exists in acct_ctrl.profiles
  INSERT INTO profiles (id, display_name, email)
  VALUES (
    NEW.id,
    v_display_name,
    NEW.email
  )
  ON CONFLICT (id) DO UPDATE
  SET 
    display_name = EXCLUDED.display_name,
    email = EXCLUDED.email,
    updated_at = now();

  -- Note: We removed the auto-membership to 'kreasheet' slug.
  -- Users will now either create their own organization or be invited
  -- via the invitations/memberships system which handles its own logic.

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Log error to Postgres log but don't block user creation
  RAISE WARNING 'Error in handle_new_user for user %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;
