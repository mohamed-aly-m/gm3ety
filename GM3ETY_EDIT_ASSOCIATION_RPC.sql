-- =============================================================================
-- GM3ETY — Atomic Edit Association Structure RPC
-- File Name: GM3ETY_EDIT_ASSOCIATION_RPC.sql
-- Target Database: Supabase PostgreSQL (Public Schema)
--
-- DESCRIPTION:
-- Executes a 100% ATOMIC, ALL-OR-NOTHING transaction to edit an existing association
-- before collection begins.
--
-- GUARANTEES:
-- 1. Keeps the exact same association_id (NEVER creates a new association).
-- 2. Strictly forbidden after collection has started (payments count > 0 OR allocations > 0).
-- 3. Strict owner authorization (owner_id = auth.uid()).
-- 4. Enforces core rule: total_shares === duration_months === number_of_cycles.
-- 5. Safely clears and rebuilds:
--    contribution_obligations -> share_contributors -> shares
-- 6. Synchronizes association_cycles (due dates, inserts missing, trims excess).
-- 7. Synchronizes people (adds, updates, removes without touching other associations).
-- 8. Rebuilds contribution_obligations (cycles x share_contributors).
-- 9. Complete ROLLBACK if ANY assertion or step fails.
--
-- NOTE: REVIEW ONLY. DO NOT EXECUTE DIRECTLY UNLESS CONFIRMED BY USER.
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.edit_association_structure(
  p_association_id       TEXT,
  p_name                 TEXT,
  p_share_value          INTEGER,
  p_total_shares         INTEGER,
  p_start_date           DATE,
  p_people               JSONB,
  p_shares               JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user UUID := auth.uid();
  v_assoc public.associations%ROWTYPE;
  v_payments_count INTEGER;
  v_allocations_count INTEGER;
  v_shares_count INTEGER;
  v_cycles_count INTEGER;
  v_expected_obligations INTEGER;
  v_actual_obligations INTEGER;
  v_contributors_count INTEGER := 0;
  v_cycle_idx INTEGER;
  v_due_date DATE;
  v_cycle_id TEXT;
  v_share_id TEXT;
  v_contrib_id TEXT;
  v_person_id TEXT;
  v_existing_person_id TEXT;
  v_share_item JSONB;
  v_contrib_item JSONB;
  v_person_item JSONB;
  v_share_order INTEGER;
  v_share_sum INTEGER;
  v_share_contributors_count INTEGER;
  v_person_name TEXT;
  v_person_phone TEXT;
BEGIN
  -- ---------------------------------------------------------------------------
  -- 1. AUTHENTICATION & INPUT VALIDATION
  -- ---------------------------------------------------------------------------
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Unauthenticated: You must be logged in to edit this association'
      USING ERRCODE = '42501';
  END IF;

  IF p_association_id IS NULL OR btrim(p_association_id) = '' THEN
    RAISE EXCEPTION 'Invalid association ID' USING ERRCODE = '22023';
  END IF;

  IF p_name IS NULL OR char_length(btrim(p_name)) < 3 THEN
    RAISE EXCEPTION 'Association name must be at least 3 characters' USING ERRCODE = '22023';
  END IF;

  IF p_share_value IS NULL OR p_share_value <= 0 THEN
    RAISE EXCEPTION 'Share value must be greater than zero' USING ERRCODE = '22023';
  END IF;

  IF p_total_shares IS NULL OR p_total_shares <= 0 THEN
    RAISE EXCEPTION 'Total shares must be greater than zero' USING ERRCODE = '22023';
  END IF;

  IF p_start_date IS NULL THEN
    RAISE EXCEPTION 'Start date is required' USING ERRCODE = '22023';
  END IF;

  IF jsonb_typeof(p_people) <> 'array' OR jsonb_array_length(p_people) = 0 THEN
    RAISE EXCEPTION 'People array cannot be empty' USING ERRCODE = '22023';
  END IF;

  IF jsonb_typeof(p_shares) <> 'array' OR jsonb_array_length(p_shares) <> p_total_shares THEN
    RAISE EXCEPTION 'Shares array length (%) must equal total_shares (%)',
      jsonb_array_length(p_shares), p_total_shares
      USING ERRCODE = '22023';
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
  -- 3. STRICT COLLECTION LOCK GUARD (NO PAYMENTS OR ALLOCATIONS)
  -- ---------------------------------------------------------------------------
  SELECT COUNT(*) INTO v_payments_count
  FROM public.payments
  WHERE association_id = p_association_id
    AND payment_type = 'payment';

  IF v_payments_count > 0 THEN
    RAISE EXCEPTION 'Cannot edit association after collection has started (% payments recorded)',
      v_payments_count
      USING ERRCODE = '22000';
  END IF;

  SELECT COUNT(*) INTO v_allocations_count
  FROM public.payment_allocations
  WHERE association_id = p_association_id;

  IF v_allocations_count > 0 THEN
    RAISE EXCEPTION 'Cannot edit association: payment allocations exist (%)',
      v_allocations_count
      USING ERRCODE = '22000';
  END IF;

  -- ---------------------------------------------------------------------------
  -- 4. VALIDATE SHARES & CONTRIBUTORS TOTAL INTEGRITY
  -- ---------------------------------------------------------------------------
  FOR v_share_item IN SELECT * FROM jsonb_array_elements(p_shares) LOOP
    v_share_order := (v_share_item->>'share_order')::INTEGER;
    IF v_share_order < 1 OR v_share_order > p_total_shares THEN
      RAISE EXCEPTION 'Invalid share_order (%) out of range 1..%', v_share_order, p_total_shares
        USING ERRCODE = '22023';
    END IF;

    IF jsonb_typeof(v_share_item->'contributors') <> 'array' OR jsonb_array_length(v_share_item->'contributors') = 0 THEN
      RAISE EXCEPTION 'Share (%) has no contributors', v_share_order USING ERRCODE = '22023';
    END IF;

    v_share_sum := 0;
    FOR v_contrib_item IN SELECT * FROM jsonb_array_elements(v_share_item->'contributors') LOOP
      v_share_sum := v_share_sum + (v_contrib_item->>'monthly_contribution')::INTEGER;
    END LOOP;

    IF v_share_sum <> p_share_value THEN
      RAISE EXCEPTION 'Share (%) total contributions (%) does not equal share value (%)',
        v_share_order, v_share_sum, p_share_value
        USING ERRCODE = '22023';
    END IF;
  END LOOP;

  -- ---------------------------------------------------------------------------
  -- 5. CLEANUP OLD CHILD FINANCIAL STRUCTURE (DAG REVERSE ORDER)
  -- ---------------------------------------------------------------------------
  DELETE FROM public.contribution_obligations WHERE association_id = p_association_id;
  DELETE FROM public.share_contributors WHERE association_id = p_association_id;
  DELETE FROM public.shares WHERE association_id = p_association_id;

  -- ---------------------------------------------------------------------------
  -- 6. SYNC ASSOCIATION_CYCLES (1 .. p_total_shares)
  -- ---------------------------------------------------------------------------
  -- Trim excess cycles if total_shares reduced
  DELETE FROM public.association_cycles
  WHERE association_id = p_association_id
    AND cycle_index > p_total_shares;

  -- Update due_date of existing cycles & insert missing cycles
  FOR v_cycle_idx IN 1..p_total_shares LOOP
    v_due_date := (p_start_date + ((v_cycle_idx - 1) || ' month')::interval)::date;

    IF EXISTS (
      SELECT 1 FROM public.association_cycles
      WHERE association_id = p_association_id AND cycle_index = v_cycle_idx
    ) THEN
      UPDATE public.association_cycles
      SET due_date = v_due_date
      WHERE association_id = p_association_id AND cycle_index = v_cycle_idx;
    ELSE
      v_cycle_id := gen_random_uuid()::text;
      INSERT INTO public.association_cycles (id, association_id, cycle_index, due_date, status, created_at)
      VALUES (v_cycle_id, p_association_id, v_cycle_idx, v_due_date, 'open', now());
    END IF;
  END LOOP;

  -- ---------------------------------------------------------------------------
  -- 7. SYNC PEOPLE (ADD, UPDATE, DELETE ONLY THIS ASSOC'S MEMBERS)
  -- ---------------------------------------------------------------------------
  -- Delete members not in incoming p_people
  DELETE FROM public.people
  WHERE association_id = p_association_id
    AND id NOT IN (
      SELECT value->>'id' FROM jsonb_array_elements(p_people)
      WHERE value->>'id' IS NOT NULL AND value->>'id' NOT LIKE 'temp_%' AND value->>'id' NOT LIKE 'p_temp_%'
    );

  -- Upsert incoming people
  FOR v_person_item IN SELECT * FROM jsonb_array_elements(p_people) LOOP
    v_person_id := v_person_item->>'id';
    v_person_name := btrim(COALESCE(v_person_item->>'name', 'عضو الجمعية'));
    v_person_phone := btrim(COALESCE(v_person_item->>'phone', 'غير مسجل'));

    IF v_person_id IS NULL OR v_person_id LIKE 'temp_%' OR v_person_id LIKE 'p_temp_%' THEN
      v_person_id := gen_random_uuid()::text;
      INSERT INTO public.people (id, association_id, name, phone, created_at)
      VALUES (v_person_id, p_association_id, v_person_name, v_person_phone, now());
    ELSE
      IF EXISTS (
        SELECT 1 FROM public.people
        WHERE id = v_person_id AND association_id = p_association_id
      ) THEN
        UPDATE public.people
        SET name = v_person_name, phone = v_person_phone
        WHERE id = v_person_id AND association_id = p_association_id;
      ELSE
        INSERT INTO public.people (id, association_id, name, phone, created_at)
        VALUES (v_person_id, p_association_id, v_person_name, v_person_phone, now());
      END IF;
    END IF;
  END LOOP;

  -- ---------------------------------------------------------------------------
  -- 8. UPDATE ASSOCIATION BASIC ATTRIBUTES
  -- PRESERVES status, started_at, id
  -- ---------------------------------------------------------------------------
  UPDATE public.associations
  SET
    name = btrim(p_name),
    monthly_share_amount = p_share_value,
    total_shares = p_total_shares,
    duration_months = p_total_shares,
    start_date = p_start_date
  WHERE id = p_association_id;

  -- ---------------------------------------------------------------------------
  -- 9. INSERT NEW SHARES & CONTRIBUTORS
  -- ---------------------------------------------------------------------------
  FOR v_share_item IN SELECT * FROM jsonb_array_elements(p_shares) LOOP
    v_share_id := COALESCE(v_share_item->>'id', gen_random_uuid()::text);
    IF v_share_id LIKE 'temp_%' OR v_share_id LIKE 'sh_temp_%' THEN
      v_share_id := gen_random_uuid()::text;
    END IF;

    v_share_order := (v_share_item->>'share_order')::INTEGER;

    INSERT INTO public.shares (id, association_id, share_order, created_at)
    VALUES (v_share_id, p_association_id, v_share_order, now());

    FOR v_contrib_item IN SELECT * FROM jsonb_array_elements(v_share_item->'contributors') LOOP
      v_contrib_id := COALESCE(v_contrib_item->>'id', gen_random_uuid()::text);
      IF v_contrib_id LIKE 'temp_%' OR v_contrib_id LIKE 'sc_temp_%' THEN
        v_contrib_id := gen_random_uuid()::text;
      END IF;

      v_person_id := v_contrib_item->>'person_id';

      -- Verify person belongs to this association
      IF NOT EXISTS (
        SELECT 1 FROM public.people
        WHERE id = v_person_id AND association_id = p_association_id
      ) THEN
        RAISE EXCEPTION 'Contributor person (%) does not belong to association (%)',
          v_person_id, p_association_id
          USING ERRCODE = '22000';
      END IF;

      INSERT INTO public.share_contributors (id, association_id, share_id, person_id, monthly_contribution, created_at)
      VALUES (
        v_contrib_id,
        p_association_id,
        v_share_id,
        v_person_id,
        (v_contrib_item->>'monthly_contribution')::INTEGER,
        now()
      );

      v_contributors_count := v_contributors_count + 1;
    END LOOP;
  END LOOP;

  -- ---------------------------------------------------------------------------
  -- 10. REBUILD CONTRIBUTION OBLIGATIONS (CYCLES x CONTRIBUTORS)
  -- ---------------------------------------------------------------------------
  INSERT INTO public.contribution_obligations (
    id,
    association_id,
    cycle_id,
    share_contributor_id,
    person_id,
    due_amount,
    created_at
  )
  SELECT
    gen_random_uuid()::text,
    p_association_id,
    c.id,
    sc.id,
    sc.person_id,
    sc.monthly_contribution,
    now()
  FROM public.association_cycles c
  CROSS JOIN public.share_contributors sc
  WHERE c.association_id = p_association_id
    AND sc.association_id = p_association_id;

  GET DIAGNOSTICS v_actual_obligations = ROW_COUNT;

  -- ---------------------------------------------------------------------------
  -- 11. FINAL ASSERTION & INTEGRITY AUDIT
  -- ---------------------------------------------------------------------------
  SELECT COUNT(*) INTO v_cycles_count
  FROM public.association_cycles
  WHERE association_id = p_association_id;

  IF v_cycles_count <> p_total_shares THEN
    RAISE EXCEPTION 'Integrity failure: cycles count (%) != total_shares (%)',
      v_cycles_count, p_total_shares
      USING ERRCODE = '22000';
  END IF;

  SELECT COUNT(*) INTO v_shares_count
  FROM public.shares
  WHERE association_id = p_association_id;

  IF v_shares_count <> p_total_shares THEN
    RAISE EXCEPTION 'Integrity failure: shares count (%) != total_shares (%)',
      v_shares_count, p_total_shares
      USING ERRCODE = '22000';
  END IF;

  v_expected_obligations := v_cycles_count * v_contributors_count;
  IF v_actual_obligations <> v_expected_obligations THEN
    RAISE EXCEPTION 'Integrity failure: obligations inserted (%) != expected (%)',
      v_actual_obligations, v_expected_obligations
      USING ERRCODE = '22000';
  END IF;

  -- Return success payload
  RETURN jsonb_build_object(
    'success', true,
    'association_id', p_association_id,
    'total_shares', p_total_shares,
    'cycles_count', v_cycles_count,
    'contributors_count', v_contributors_count,
    'obligations_count', v_actual_obligations
  );
END;
$$;

-- Security & Permissions
REVOKE ALL ON FUNCTION public.edit_association_structure(TEXT, TEXT, INTEGER, INTEGER, DATE, JSONB, JSONB) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.edit_association_structure(TEXT, TEXT, INTEGER, INTEGER, DATE, JSONB, JSONB) TO authenticated;

COMMIT;

-- Reload Schema Cache
NOTIFY pgrst, 'reload schema';
