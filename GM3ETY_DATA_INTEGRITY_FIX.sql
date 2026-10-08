-- =============================================================================
-- GM3ETY — Data Integrity Fix (Payment Cycle Foreign Key & Safe Turn Swap)
-- File Name: GM3ETY_DATA_INTEGRITY_FIX.sql
-- Target Database: Supabase PostgreSQL (Public Schema)
-- Description:
-- 1. Grants and RLS for association_cycles so authenticated users can read real cycle rows.
-- 2. Strict RLS policy on public.payments validating association ownership, person, and cycle.
-- 3. Completely redesigned atomic swap_share_turns RPC that swaps share_order WITHOUT deleting
--    or recreating share_contributors or any child financial records.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. ASSOCIATION_CYCLES: Grants & RLS
-- -----------------------------------------------------------------------------
GRANT SELECT ON TABLE public.association_cycles TO authenticated;
REVOKE ALL ON TABLE public.association_cycles FROM anon;
REVOKE ALL ON TABLE public.association_cycles FROM PUBLIC;

ALTER TABLE IF EXISTS public.association_cycles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "association_cycles_select_own_assoc" ON public.association_cycles;
CREATE POLICY "association_cycles_select_own_assoc"
    ON public.association_cycles
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.associations a
            WHERE a.id = association_cycles.association_id
              AND a.owner_id = auth.uid()
        )
    );

-- -----------------------------------------------------------------------------
-- 2. PAYMENTS: Table Grants & Strict Insert Validation Policy
-- -----------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.payments TO authenticated;
REVOKE ALL ON TABLE public.payments FROM anon;
REVOKE ALL ON TABLE public.payments FROM PUBLIC;

ALTER TABLE IF EXISTS public.payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "payments_insert_own_assoc" ON public.payments;
CREATE POLICY "payments_insert_own_assoc"
    ON public.payments
    FOR INSERT
    TO authenticated
    WITH CHECK (
        -- Verify association belongs to the authenticated user
        EXISTS (
            SELECT 1 FROM public.associations a
            WHERE a.id = payments.association_id
              AND a.owner_id = auth.uid()
        )
        AND
        -- Verify member belongs to the same association
        EXISTS (
            SELECT 1 FROM public.people p
            WHERE p.id = payments.person_id
              AND p.association_id = payments.association_id
        )
        AND
        -- Verify cycle belongs to the same association
        EXISTS (
            SELECT 1 FROM public.association_cycles c
            WHERE c.id = payments.cycle_id
              AND c.association_id = payments.association_id
        )
    );

-- -----------------------------------------------------------------------------
-- 3. ATOMIC & SAFE SWAP RPC: swap_share_turns
-- SWAPS share_order ONLY. NEVER DELETES OR MODIFIES share_contributors.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.swap_share_turns(
  p_share_id_a TEXT,
  p_share_id_b TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user UUID := auth.uid();
  v_assoc_a TEXT;
  v_assoc_b TEXT;
  v_order_a INTEGER;
  v_order_b INTEGER;
  v_temp_order INTEGER;
  v_owner UUID;
BEGIN
  -- 1. Verify User Authentication
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Unauthenticated: You must be logged in to swap turns'
      USING ERRCODE = '42501';
  END IF;

  -- 2. Verify inputs are valid and different
  IF p_share_id_a IS NULL OR p_share_id_b IS NULL OR p_share_id_a = p_share_id_b THEN
    RAISE EXCEPTION 'Invalid parameters: Two distinct share IDs are required'
      USING ERRCODE = '22023';
  END IF;

  -- 3. Fetch association IDs and current share orders
  SELECT association_id, share_order INTO v_assoc_a, v_order_a
  FROM public.shares
  WHERE id = p_share_id_a;

  SELECT association_id, share_order INTO v_assoc_b, v_order_b
  FROM public.shares
  WHERE id = p_share_id_b;

  -- 4. Verify existence
  IF v_assoc_a IS NULL OR v_assoc_b IS NULL THEN
    RAISE EXCEPTION 'One or both shares do not exist'
      USING ERRCODE = 'P0002';
  END IF;

  -- 5. Prevent cross-association swapping
  IF v_assoc_a <> v_assoc_b THEN
    RAISE EXCEPTION 'Security violation: Shares must belong to the same association'
      USING ERRCODE = '22000';
  END IF;

  -- 6. Ownership Verification
  SELECT owner_id INTO v_owner
  FROM public.associations
  WHERE id = v_assoc_a;

  IF v_owner IS NULL OR v_owner <> v_user THEN
    RAISE EXCEPTION 'Access Denied: You do not have permission to modify this association'
      USING ERRCODE = '42501';
  END IF;

  -- 7. Acquire transaction advisory lock for this association (prevents concurrent race conditions)
  PERFORM pg_advisory_xact_lock(hashtextextended(v_assoc_a, 0));

  -- If orders are already the same, return early without modifications
  IF v_order_a = v_order_b THEN
    RETURN jsonb_build_object(
      'success', true,
      'message', 'Shares already have the same order',
      'share_id_a', p_share_id_a,
      'share_id_b', p_share_id_b,
      'share_order', v_order_a,
      'association_id', v_assoc_a
    );
  END IF;

  -- 8. Calculate a safe temporary share_order to avoid collision on UNIQUE (association_id, share_order) & check (share_order > 0)
  SELECT COALESCE(MAX(share_order), 0) + 1000 INTO v_temp_order
  FROM public.shares
  WHERE association_id = v_assoc_a;

  -- 9. Atomic 3-step swap of share_order ONLY
  -- NEVER deletes, inserts, or modifies share_contributors, contribution_obligations, or payments!
  UPDATE public.shares
  SET share_order = v_temp_order
  WHERE id = p_share_id_a;

  UPDATE public.shares
  SET share_order = v_order_a
  WHERE id = p_share_id_b;

  UPDATE public.shares
  SET share_order = v_order_b
  WHERE id = p_share_id_a;

  -- 10. Return success payload
  RETURN jsonb_build_object(
    'success', true,
    'message', 'Turn orders swapped atomically and securely without modifying contributors or financial records',
    'share_id_a', p_share_id_a,
    'share_id_b', p_share_id_b,
    'old_order_a', v_order_a,
    'new_order_a', v_order_b,
    'old_order_b', v_order_b,
    'new_order_b', v_order_a,
    'association_id', v_assoc_a
  );
END;
$$;

-- Security permissions on RPC
REVOKE ALL ON FUNCTION public.swap_share_turns(TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.swap_share_turns(TEXT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.swap_share_turns(TEXT, TEXT) TO authenticated;

COMMIT;

-- -----------------------------------------------------------------------------
-- 4. Reload PostgREST Schema Cache
-- -----------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';
