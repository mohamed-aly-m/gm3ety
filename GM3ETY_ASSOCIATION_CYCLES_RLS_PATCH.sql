-- =============================================================================
-- GM3ETY — Association Cycles RLS & Permissions Patch
-- File Name: GM3ETY_ASSOCIATION_CYCLES_RLS_PATCH.sql
-- Target Database: Supabase PostgreSQL (Public Schema)
--
-- PURPOSE:
-- 1. Remove duplicate SELECT policies on public.association_cycles:
--    - association_cycles_owner_read
--    - association_cycles_select_own_assoc
--    And replace them with exactly ONE strict SELECT policy:
--    - association_cycles_select_own_assoc
--
-- 2. Grant SELECT, INSERT, UPDATE, DELETE to 'authenticated' role only.
--    Explicitly revoke all permissions from 'anon' and 'PUBLIC'.
--
-- 3. Add strict RLS policies for INSERT, UPDATE, and DELETE:
--    Restricting operations strictly to the association owner:
--    associations.owner_id = auth.uid()
--    - UPDATE policy validates ownership in BOTH USING and WITH CHECK clauses.
--
-- NOTE: REVIEW ONLY. DO NOT EXECUTE DIRECTLY UNLESS CONFIRMED BY USER.
-- =============================================================================

BEGIN;

-- 1. Table Permissions: Allow authenticated users only; revoke anon and PUBLIC
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.association_cycles TO authenticated;
REVOKE ALL ON TABLE public.association_cycles FROM anon;
REVOKE ALL ON TABLE public.association_cycles FROM PUBLIC;

ALTER TABLE IF EXISTS public.association_cycles ENABLE ROW LEVEL SECURITY;

-- 2. Drop existing SELECT policies to prevent duplication
DROP POLICY IF EXISTS "association_cycles_owner_read"
    ON public.association_cycles;

DROP POLICY IF EXISTS "association_cycles_select_own_assoc"
    ON public.association_cycles;

-- 3. Create SINGLE unified SELECT policy for association owner
CREATE POLICY "association_cycles_select_own_assoc"
    ON public.association_cycles
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1
            FROM public.associations a
            WHERE a.id = association_cycles.association_id
              AND a.owner_id = auth.uid()
        )
    );

-- 4. INSERT Policy: Strict owner verification (WITH CHECK)
DROP POLICY IF EXISTS "association_cycles_insert_own_assoc"
    ON public.association_cycles;

CREATE POLICY "association_cycles_insert_own_assoc"
    ON public.association_cycles
    FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM public.associations a
            WHERE a.id = association_cycles.association_id
              AND a.owner_id = auth.uid()
        )
    );

-- 5. UPDATE Policy: Strict owner verification in BOTH USING and WITH CHECK
DROP POLICY IF EXISTS "association_cycles_update_own_assoc"
    ON public.association_cycles;

CREATE POLICY "association_cycles_update_own_assoc"
    ON public.association_cycles
    FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1
            FROM public.associations a
            WHERE a.id = association_cycles.association_id
              AND a.owner_id = auth.uid()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM public.associations a
            WHERE a.id = association_cycles.association_id
              AND a.owner_id = auth.uid()
        )
    );

-- 6. DELETE Policy: Strict owner verification (USING)
DROP POLICY IF EXISTS "association_cycles_delete_own_assoc"
    ON public.association_cycles;

CREATE POLICY "association_cycles_delete_own_assoc"
    ON public.association_cycles
    FOR DELETE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1
            FROM public.associations a
            WHERE a.id = association_cycles.association_id
              AND a.owner_id = auth.uid()
        )
    );

COMMIT;

-- 7. Reload schema cache in Supabase PostgREST
NOTIFY pgrst, 'reload schema';
