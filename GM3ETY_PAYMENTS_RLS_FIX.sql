-- =============================================================================
-- GM3ETY — Standalone Payments Table RLS & Privilege Fix
-- File Name: GM3ETY_PAYMENTS_RLS_FIX.sql
-- Target Database: Supabase PostgreSQL (Public Schema)
-- Description:
-- Fixes error "permission denied for table payments (42501)" by ensuring:
-- 1. Schema and Table level privileges (SELECT, INSERT, UPDATE, DELETE) are granted to authenticated.
-- 2. Anonymous/public access is explicitly revoked (no anon access).
-- 3. Row Level Security is active with strict multi-tenant ownership validation:
--    - User can only insert payments for an association they own (associations.owner_id = auth.uid()).
--    - The member (person_id) must belong to that same association.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Grant Schema & Table Privileges to authenticated role
-- -----------------------------------------------------------------------------
GRANT USAGE ON SCHEMA public TO authenticated;

-- Ensure table-level permissions exist so PostgreSQL does not reject with 42501 before RLS evaluation
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.payments TO authenticated;

-- Explicitly revoke permissions from anon and PUBLIC
REVOKE ALL ON TABLE public.payments FROM anon;
REVOKE ALL ON TABLE public.payments FROM PUBLIC;

-- -----------------------------------------------------------------------------
-- 2. Enable Row Level Security (RLS) on public.payments
-- -----------------------------------------------------------------------------
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- 3. Re-create Clean, Strict RLS Policies for public.payments
-- -----------------------------------------------------------------------------

-- Drop existing policies to prevent conflicts
DROP POLICY IF EXISTS "payments_select_own_assoc" ON public.payments;
DROP POLICY IF EXISTS "payments_insert_own_assoc" ON public.payments;
DROP POLICY IF EXISTS "payments_update_own_assoc" ON public.payments;
DROP POLICY IF EXISTS "payments_delete_own_assoc" ON public.payments;

-- Policy 1: SELECT (Owner can read all payments belonging to their associations)
CREATE POLICY "payments_select_own_assoc"
    ON public.payments
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.associations a
            WHERE a.id = payments.association_id
              AND a.owner_id = auth.uid()
        )
    );

-- Policy 2: INSERT (Owner can only insert payments into their own associations AND member belongs to that association)
CREATE POLICY "payments_insert_own_assoc"
    ON public.payments
    FOR INSERT
    TO authenticated
    WITH CHECK (
        -- Verify association ownership
        EXISTS (
            SELECT 1 FROM public.associations a
            WHERE a.id = payments.association_id
              AND a.owner_id = auth.uid()
        )
        AND
        -- Verify person belongs to the same association
        EXISTS (
            SELECT 1 FROM public.people p
            WHERE p.id = payments.person_id
              AND p.association_id = payments.association_id
        )
    );

-- Policy 3: UPDATE (Owner can update payments within their associations)
CREATE POLICY "payments_update_own_assoc"
    ON public.payments
    FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.associations a
            WHERE a.id = payments.association_id
              AND a.owner_id = auth.uid()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.associations a
            WHERE a.id = payments.association_id
              AND a.owner_id = auth.uid()
        )
        AND
        EXISTS (
            SELECT 1 FROM public.people p
            WHERE p.id = payments.person_id
              AND p.association_id = payments.association_id
        )
    );

-- Policy 4: DELETE (Owner can delete payments within their associations)
CREATE POLICY "payments_delete_own_assoc"
    ON public.payments
    FOR DELETE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.associations a
            WHERE a.id = payments.association_id
              AND a.owner_id = auth.uid()
        )
    );

COMMIT;

-- -----------------------------------------------------------------------------
-- 4. Reload PostgREST Schema Cache
-- -----------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';
