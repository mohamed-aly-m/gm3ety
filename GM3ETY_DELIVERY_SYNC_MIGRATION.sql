-- =============================================================================
-- GM3ETY — Universal Delivery Synchronization Migration
-- File Name: GM3ETY_DELIVERY_SYNC_MIGRATION.sql
-- Target Database: Supabase PostgreSQL (Public Schema)
--
-- PURPOSE:
-- 1. Adds 'is_delivered' column to public.shares with NOT NULL and DEFAULT FALSE.
--    Guaranteed 100% idempotent via ADD COLUMN IF NOT EXISTS.
-- 2. Strictly general and universal:
--    - Applies to all existing and future associations.
--    - Applies to all existing and future users.
--    - Preserves existing data (default FALSE for all existing and newly created rows).
-- 3. Grants SELECT & UPDATE privileges on public.shares to authenticated users.
-- 4. Ensures strict RLS policy: Only the association owner (associations.owner_id = auth.uid())
--    can SELECT and UPDATE shares (including is_delivered).
-- =============================================================================

BEGIN;

-- 1. Add is_delivered column to public.shares idempotently
ALTER TABLE public.shares
ADD COLUMN IF NOT EXISTS is_delivered BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. Grants for authenticated users (revoke anon access)
GRANT SELECT, UPDATE ON TABLE public.shares TO authenticated;
REVOKE ALL ON TABLE public.shares FROM anon;

-- 3. Enable RLS on public.shares
ALTER TABLE IF EXISTS public.shares ENABLE ROW LEVEL SECURITY;

-- 4. Strict Owner SELECT Policy
DROP POLICY IF EXISTS "shares_select_own_assoc" ON public.shares;
CREATE POLICY "shares_select_own_assoc"
    ON public.shares
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.associations a
            WHERE a.id = shares.association_id
              AND a.owner_id = auth.uid()
        )
    );

-- 5. Strict Owner UPDATE Policy (validates owner_id in both USING and WITH CHECK)
DROP POLICY IF EXISTS "shares_update_own_assoc" ON public.shares;
CREATE POLICY "shares_update_own_assoc"
    ON public.shares
    FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.associations a
            WHERE a.id = shares.association_id
              AND a.owner_id = auth.uid()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.associations a
            WHERE a.id = shares.association_id
              AND a.owner_id = auth.uid()
        )
    );

COMMIT;
