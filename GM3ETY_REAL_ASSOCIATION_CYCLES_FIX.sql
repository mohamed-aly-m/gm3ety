-- =============================================================================
-- GM3ETY — Safe Diagnostic & Targeted Fix for Real Association Cycles
-- File Name: GM3ETY_REAL_ASSOCIATION_CYCLES_FIX.sql
-- Target Database: Supabase PostgreSQL (Public Schema)
--
-- STRICT RULES ENFORCED:
-- 1. INSERT ONLY — Zero DELETE, Zero TRUNCATE, Zero UPDATE on existing cycles.
-- 2. No changes to associations, people, shares, contributors, payments, obligations.
-- 3. Purely IDEMPOTENT — running multiple times produces NO duplicates.
-- 4. Enforces GM3ETY rule: total_shares === duration_months === number of cycles.
-- 5. Generates only missing cycle indexes (1 .. total_shares).
-- 6. Due date = start_date + (cycle_index - 1) months, status = 'open'.
--
-- NOTE: REVIEW ONLY. DO NOT EXECUTE DIRECTLY UNLESS REQUESTED.
-- =============================================================================

-- =============================================================================
-- PART 1: DIAGNOSTIC QUERY (Run this first to inspect the real association)
-- =============================================================================
-- Copy and run this SELECT in Supabase SQL Editor to inspect your current associations:

SELECT
    a.id AS association_id,
    a.name AS association_name,
    a.start_date,
    a.total_shares,
    a.duration_months,
    COUNT(c.id) AS existing_cycles_count,
    COALESCE(
        ARRAY_AGG(c.cycle_index ORDER BY c.cycle_index) FILTER (WHERE c.id IS NOT NULL),
        ARRAY[]::integer[]
    ) AS existing_cycle_indexes,
    (a.total_shares - COUNT(c.id)::integer) AS missing_cycles_count,
    a.created_at
FROM public.associations a
LEFT JOIN public.association_cycles c ON c.association_id = a.id
GROUP BY a.id, a.name, a.start_date, a.total_shares, a.duration_months, a.created_at
ORDER BY a.created_at DESC;


-- =============================================================================
-- PART 2: TARGETED SAFE INSERT (Idempotent — inserts ONLY missing cycles)
-- =============================================================================
-- This block targets the real association lacking cycles.
-- It computes due_date accurately and inserts cycles 1..total_shares with status 'open'.
-- Existing cycles are never touched or modified. Zero records deleted.

DO $$
DECLARE
    r_assoc RECORD;
    v_idx INTEGER;
    v_due DATE;
    v_cycle_id TEXT;
    v_inserted_count INTEGER := 0;
BEGIN
    -- Select the real association that currently has missing cycles
    FOR r_assoc IN
        SELECT a.id, a.name, a.start_date, a.total_shares, a.duration_months
        FROM public.associations a
        WHERE (
            SELECT COUNT(*) 
            FROM public.association_cycles c 
            WHERE c.association_id = a.id
        ) < a.total_shares
        ORDER BY a.created_at DESC
    LOOP
        RAISE NOTICE 'Targeting Association: "%" (ID: %)', r_assoc.name, r_assoc.id;
        RAISE NOTICE 'Total Shares: %, Duration Months: %, Start Date: %', 
            r_assoc.total_shares, r_assoc.duration_months, r_assoc.start_date;

        -- Generate only missing cycles from 1 to total_shares
        FOR v_idx IN 1..r_assoc.total_shares LOOP
            -- Calculate due_date: start_date + (cycle_index - 1) months
            v_due := (r_assoc.start_date + ((v_idx - 1) || ' month')::interval)::date;

            -- Check if cycle already exists (Strict Idempotency Guard)
            IF NOT EXISTS (
                SELECT 1 FROM public.association_cycles
                WHERE association_id = r_assoc.id AND cycle_index = v_idx
            ) THEN
                v_cycle_id := gen_random_uuid()::text;
                INSERT INTO public.association_cycles
                    (id, association_id, cycle_index, due_date, status, created_at)
                VALUES
                    (v_cycle_id, r_assoc.id, v_idx, v_due, 'open', now());

                v_inserted_count := v_inserted_count + 1;
                RAISE NOTICE '  [+] Created Cycle %: ID = %, Due Date = %', v_idx, v_cycle_id, v_due;
            ELSE
                RAISE NOTICE '  [=] Cycle % already exists, skipped.', v_idx;
            END IF;
        END LOOP;
    END LOOP;

    RAISE NOTICE 'Done. Total missing cycles inserted: %', v_inserted_count;
END;
$$;


-- =============================================================================
-- PART 3: VERIFICATION QUERY (Run after Part 2 to verify all cycles exist)
-- =============================================================================
SELECT
    a.id AS association_id,
    a.name AS association_name,
    a.total_shares,
    c.cycle_index,
    c.due_date,
    c.status,
    c.id AS real_cycle_id,
    c.created_at
FROM public.associations a
JOIN public.association_cycles c ON c.association_id = a.id
ORDER BY a.created_at DESC, c.cycle_index ASC;
