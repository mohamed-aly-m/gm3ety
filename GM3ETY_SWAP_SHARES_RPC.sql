-- =============================================================================
-- GM3ETY — Atomic & Safe Turn Swapping Procedure (swap_share_turns)
-- File Name: GM3ETY_SWAP_SHARES_RPC.sql
-- Description:
-- Swaps turn order (share_order) between two shares atomically within a transaction.
-- CRITICAL GUARANTEE: NEVER deletes or modifies share_contributors, contribution_obligations,
-- payment_allocations, payments, or any primary key IDs.
-- =============================================================================

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

-- Revoke permissions from public/anon roles
REVOKE ALL ON FUNCTION public.swap_share_turns(TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.swap_share_turns(TEXT, TEXT) FROM anon;

-- Grant execution ONLY to authenticated users
GRANT EXECUTE ON FUNCTION public.swap_share_turns(TEXT, TEXT) TO authenticated;

-- Reload schema cache in Supabase PostgREST
NOTIFY pgrst, 'reload schema';
