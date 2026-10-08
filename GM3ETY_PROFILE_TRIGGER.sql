-- =============================================================================
-- GM3ETY — Automatic Profile Creation Trigger on auth.users (Optional DB Automation)
-- File Name: GM3ETY_PROFILE_TRIGGER.sql
-- Target Database: Supabase PostgreSQL (Public Schema & Auth Schema)
-- Description:
-- 1. Creates handle_new_user() function with SECURITY DEFINER to create a profile
--    record in public.profiles whenever a user is inserted in auth.users.
-- 2. Strictly idempotent: uses ON CONFLICT (id) DO UPDATE.
-- 3. Complies with name CHECK constraint (char_length(btrim(name)) >= 2).
-- 4. Backfills existing auth.users who currently lack a profile record.
-- NOTE: REVIEW ONLY. DO NOT EXECUTE DIRECTLY UNLESS REQUESTED.
-- =============================================================================

BEGIN;

-- 1. Trigger Function
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_name TEXT;
  v_mobile TEXT;
BEGIN
  -- Extract name from raw metadata with safe fallback
  v_name := COALESCE(
    new.raw_user_meta_data->>'name',
    new.raw_user_meta_data->>'full_name',
    split_part(new.email, '@', 1),
    'منظم الجمعية'
  );
  v_name := btrim(v_name);
  -- Ensure minimum 2 characters to satisfy profiles_name_check
  IF char_length(v_name) < 2 THEN
    v_name := 'منظم الجمعية';
  END IF;

  -- Extract mobile from raw metadata
  v_mobile := COALESCE(
    new.raw_user_meta_data->>'mobile',
    new.raw_user_meta_data->>'phone_number',
    ''
  );

  -- Idempotently insert into public.profiles
  INSERT INTO public.profiles (id, name, mobile, email, created_at)
  VALUES (
    new.id,
    v_name,
    NULLIF(v_mobile, ''),
    new.email,
    now()
  )
  ON CONFLICT (id) DO UPDATE
  SET
    email = EXCLUDED.email,
    name = CASE 
      WHEN public.profiles.name IS NULL OR public.profiles.name = '' 
      THEN EXCLUDED.name 
      ELSE public.profiles.name 
    END;

  RETURN new;
END;
$$;

-- 2. Trigger Attachment on auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- 3. Safe Backfill for Any Existing Auth Users Missing a Profile
INSERT INTO public.profiles (id, name, mobile, email, created_at)
SELECT
  u.id,
  CASE 
    WHEN char_length(btrim(COALESCE(u.raw_user_meta_data->>'name', u.raw_user_meta_data->>'full_name', split_part(u.email, '@', 1), 'منظم الجمعية'))) >= 2 
    THEN btrim(COALESCE(u.raw_user_meta_data->>'name', u.raw_user_meta_data->>'full_name', split_part(u.email, '@', 1), 'منظم الجمعية'))
    ELSE 'منظم الجمعية'
  END,
  NULLIF(COALESCE(u.raw_user_meta_data->>'mobile', u.raw_user_meta_data->>'phone_number', ''), ''),
  u.email,
  u.created_at
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL
ON CONFLICT (id) DO NOTHING;

COMMIT;
