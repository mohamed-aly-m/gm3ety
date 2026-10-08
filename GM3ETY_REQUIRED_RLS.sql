-- =============================================================================
-- GM3ETY — Required Row Level Security (RLS) Policies
-- File Name: GM3ETY_REQUIRED_RLS.sql
-- Target Database: Supabase PostgreSQL (Public Schema)
-- Isolation Guarantee: Full multi-tenant isolation where User A CANNOT view or
-- modify any associations, members, shares, contributors, or payments belonging to User B.
-- =============================================================================

BEGIN;

-- 1. Enable Row Level Security (RLS) on all tables
ALTER TABLE IF EXISTS public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.associations ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.people ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.share_contributors ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.payments ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- 2. TABLE: public.profiles
-- id is UUID referencing auth.users(id)
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
CREATE POLICY "profiles_select_own"
    ON public.profiles
    FOR SELECT
    TO authenticated
    USING (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_insert_own" ON public.profiles;
CREATE POLICY "profiles_insert_own"
    ON public.profiles
    FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own"
    ON public.profiles
    FOR UPDATE
    TO authenticated
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

-- -----------------------------------------------------------------------------
-- 3. TABLE: public.associations
-- owner_id is UUID referencing auth.users(id)
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "associations_select_own" ON public.associations;
CREATE POLICY "associations_select_own"
    ON public.associations
    FOR SELECT
    TO authenticated
    USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS "associations_insert_own" ON public.associations;
CREATE POLICY "associations_insert_own"
    ON public.associations
    FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS "associations_update_own" ON public.associations;
CREATE POLICY "associations_update_own"
    ON public.associations
    FOR UPDATE
    TO authenticated
    USING (auth.uid() = owner_id)
    WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS "associations_delete_own" ON public.associations;
CREATE POLICY "associations_delete_own"
    ON public.associations
    FOR DELETE
    TO authenticated
    USING (auth.uid() = owner_id);

-- -----------------------------------------------------------------------------
-- 4. TABLE: public.people
-- association_id references associations(id)
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "people_select_own_assoc" ON public.people;
CREATE POLICY "people_select_own_assoc"
    ON public.people
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.associations a
            WHERE a.id = people.association_id
              AND a.owner_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "people_insert_own_assoc" ON public.people;
CREATE POLICY "people_insert_own_assoc"
    ON public.people
    FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.associations a
            WHERE a.id = people.association_id
              AND a.owner_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "people_update_own_assoc" ON public.people;
CREATE POLICY "people_update_own_assoc"
    ON public.people
    FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.associations a
            WHERE a.id = people.association_id
              AND a.owner_id = auth.uid()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.associations a
            WHERE a.id = people.association_id
              AND a.owner_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "people_delete_own_assoc" ON public.people;
CREATE POLICY "people_delete_own_assoc"
    ON public.people
    FOR DELETE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.associations a
            WHERE a.id = people.association_id
              AND a.owner_id = auth.uid()
        )
    );

-- -----------------------------------------------------------------------------
-- 5. TABLE: public.shares
-- association_id references associations(id)
-- -----------------------------------------------------------------------------
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

DROP POLICY IF EXISTS "shares_insert_own_assoc" ON public.shares;
CREATE POLICY "shares_insert_own_assoc"
    ON public.shares
    FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.associations a
            WHERE a.id = shares.association_id
              AND a.owner_id = auth.uid()
        )
    );

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

DROP POLICY IF EXISTS "shares_delete_own_assoc" ON public.shares;
CREATE POLICY "shares_delete_own_assoc"
    ON public.shares
    FOR DELETE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.associations a
            WHERE a.id = shares.association_id
              AND a.owner_id = auth.uid()
        )
    );

-- -----------------------------------------------------------------------------
-- 6. TABLE: public.share_contributors
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "share_contributors_select_own_assoc" ON public.share_contributors;
CREATE POLICY "share_contributors_select_own_assoc"
    ON public.share_contributors
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.associations a
            WHERE a.id = share_contributors.association_id
              AND a.owner_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "share_contributors_insert_own_assoc" ON public.share_contributors;
CREATE POLICY "share_contributors_insert_own_assoc"
    ON public.share_contributors
    FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.associations a
            WHERE a.id = share_contributors.association_id
              AND a.owner_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "share_contributors_update_own_assoc" ON public.share_contributors;
CREATE POLICY "share_contributors_update_own_assoc"
    ON public.share_contributors
    FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.associations a
            WHERE a.id = share_contributors.association_id
              AND a.owner_id = auth.uid()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.associations a
            WHERE a.id = share_contributors.association_id
              AND a.owner_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "share_contributors_delete_own_assoc" ON public.share_contributors;
CREATE POLICY "share_contributors_delete_own_assoc"
    ON public.share_contributors
    FOR DELETE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.associations a
            WHERE a.id = share_contributors.association_id
              AND a.owner_id = auth.uid()
        )
    );

-- -----------------------------------------------------------------------------
-- 7. TABLE: public.payments
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "payments_select_own_assoc" ON public.payments;
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

DROP POLICY IF EXISTS "payments_insert_own_assoc" ON public.payments;
CREATE POLICY "payments_insert_own_assoc"
    ON public.payments
    FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.associations a
            WHERE a.id = payments.association_id
              AND a.owner_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "payments_update_own_assoc" ON public.payments;
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
    );

DROP POLICY IF EXISTS "payments_delete_own_assoc" ON public.payments;
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
