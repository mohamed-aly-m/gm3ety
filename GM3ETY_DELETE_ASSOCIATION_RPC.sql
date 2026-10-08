-- =============================================================================
-- GM3ETY — Atomic Delete Association RPC
-- File Name: GM3ETY_DELETE_ASSOCIATION_RPC.sql
-- Target Database: Supabase PostgreSQL (Public Schema)
--
-- DESCRIPTION:
-- Executes a 100% ATOMIC, ALL-OR-NOTHING transaction to delete an association
-- and all its dependent child records in strict reverse-dependency (DAG) order.
--
-- GUARANTEES:
-- 1. SECURITY DEFINER with search_path = public, pg_temp.
-- 2. Strictly verifies auth.uid() IS NOT NULL.
-- 3. Locks association row FOR UPDATE and verifies owner_id = auth.uid().
-- 4. Reversible execution: Full ROLLBACK on ANY error.
-- 5. Strict reverse-dependency deletion order:
--    a) payment_adjustments (if table exists)
--    b) payment_allocations
--    c) payout_disbursements
--    d) cycle_payout_recipients
--    e) payout_schedule_changes
--    f) cycle_payouts
--    g) payments (reversal payments first, then remaining payments)
--    h) contribution_obligations
--    i) share_contributors
--    j) shares
--    k) association_cycles
--    l) people (exclusive to this association; never deletes members shared with other associations)
--    m) associations
-- 6. Permissions: REVOKE ALL from anon, PUBLIC; GRANT EXECUTE to authenticated ONLY.
--
-- NOTE: REVIEW ONLY. DO NOT EXECUTE DIRECTLY UNLESS CONFIRMED BY USER.
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.delete_association(
  p_association_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user UUID := auth.uid();
  v_assoc public.associations%ROWTYPE;
BEGIN
  -- ---------------------------------------------------------------------------
  -- 1. AUTHENTICATION CHECK
  -- ---------------------------------------------------------------------------
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Unauthenticated: You must be logged in to delete this association'
      USING ERRCODE = '42501';
  END IF;

  IF p_association_id IS NULL OR btrim(p_association_id) = '' THEN
    RAISE EXCEPTION 'Invalid association ID' USING ERRCODE = '22023';
  END IF;

  -- ---------------------------------------------------------------------------
  -- 2. LOCK ASSOCIATION & VERIFY OWNERSHIP
  -- ---------------------------------------------------------------------------
  SELECT * INTO v_assoc
  FROM public.associations
  WHERE id = p_association_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Association (%) not found', p_association_id USING ERRCODE = 'P0002';
  END IF;

  IF v_assoc.owner_id <> v_user THEN
    RAISE EXCEPTION 'Access denied: You are not the owner of this association'
      USING ERRCODE = '42501';
  END IF;

  -- ---------------------------------------------------------------------------
  -- 3. REVERSE-DAG DEPENDENCY DELETION
  -- ---------------------------------------------------------------------------

  -- Step 3.1: payment_adjustments (if table exists)
  IF to_regclass('public.payment_adjustments') IS NOT NULL THEN
    EXECUTE 'DELETE FROM public.payment_adjustments WHERE association_id = $1' USING p_association_id;
  END IF;

  -- Step 3.2: payment_allocations (must be deleted before payments and contribution_obligations)
  IF to_regclass('public.payment_allocations') IS NOT NULL THEN
    EXECUTE 'DELETE FROM public.payment_allocations WHERE association_id = $1' USING p_association_id;
  END IF;

  -- Step 3.3: Payout tables
  IF to_regclass('public.payout_disbursements') IS NOT NULL THEN
    EXECUTE 'DELETE FROM public.payout_disbursements WHERE association_id = $1' USING p_association_id;
  END IF;

  IF to_regclass('public.cycle_payout_recipients') IS NOT NULL THEN
    EXECUTE 'DELETE FROM public.cycle_payout_recipients WHERE association_id = $1' USING p_association_id;
  END IF;

  IF to_regclass('public.payout_schedule_changes') IS NOT NULL THEN
    EXECUTE 'DELETE FROM public.payout_schedule_changes WHERE association_id = $1' USING p_association_id;
  END IF;

  IF to_regclass('public.cycle_payouts') IS NOT NULL THEN
    EXECUTE 'DELETE FROM public.cycle_payouts WHERE association_id = $1' USING p_association_id;
  END IF;

  -- Step 3.4: payments (reversal payments first due to self-referencing FK, then remaining payments)
  IF to_regclass('public.payments') IS NOT NULL THEN
    DELETE FROM public.payments
    WHERE association_id = p_association_id
      AND payment_type = 'reversal';

    DELETE FROM public.payments
    WHERE association_id = p_association_id;
  END IF;

  -- Step 3.5: contribution_obligations (must be deleted BEFORE share_contributors and cycles)
  IF to_regclass('public.contribution_obligations') IS NOT NULL THEN
    EXECUTE 'DELETE FROM public.contribution_obligations WHERE association_id = $1' USING p_association_id;
  END IF;

  -- Step 3.6: share_contributors (must be deleted before shares and people)
  DELETE FROM public.share_contributors
  WHERE association_id = p_association_id;

  -- Step 3.7: shares
  DELETE FROM public.shares
  WHERE association_id = p_association_id;

  -- Step 3.8: association_cycles
  DELETE FROM public.association_cycles
  WHERE association_id = p_association_id;

  -- Step 3.9: people (ONLY members exclusive to this association; NEVER delete members shared with another association)
  DELETE FROM public.people
  WHERE association_id = p_association_id
    AND id NOT IN (
      SELECT id FROM public.people WHERE association_id <> p_association_id
    );

  -- Step 3.10: associations (root record)
  DELETE FROM public.associations
  WHERE id = p_association_id;

  -- Return success response
  RETURN jsonb_build_object(
    'success', true,
    'deleted_association_id', p_association_id
  );
END;
$$;

-- Security & Permissions
REVOKE ALL ON FUNCTION public.delete_association(TEXT) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_association(TEXT) TO authenticated;

COMMIT;

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
