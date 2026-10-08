-- =============================================================================
-- GM3ETY — Safe Cycles Initialization & Permissions Patch
-- File Name: GM3ETY_CYCLES_FIX.sql
-- Target Database: Supabase PostgreSQL (Public Schema)
-- Description:
-- 1. Grants INSERT & SELECT privileges on association_cycles to authenticated role.
-- 2. Adds INSERT RLS policy on association_cycles so association owners can insert cycles.
-- 3. Idempotently backfills missing cycles (1 .. duration_months) for the current real association
--    (and any other association missing cycles) without modifying or deleting existing records.
--
-- NOTE: REVIEW ONLY. DO NOT EXECUTE DIRECTLY UNLESS REQUESTED.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. ASSOCIATION_CYCLES: Grants & RLS Policies
-- -----------------------------------------------------------------------------
GRANT SELECT, INSERT ON TABLE public.association_cycles TO authenticated;

ALTER TABLE IF EXISTS public.association_cycles ENABLE ROW LEVEL SECURITY;

-- 1.1 SELECT Policy: Association owner can view their cycles
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

-- 1.2 INSERT Policy: Association owner can create cycles for their own associations
DROP POLICY IF EXISTS "association_cycles_insert_own_assoc" ON public.association_cycles;
CREATE POLICY "association_cycles_insert_own_assoc"
    ON public.association_cycles
    FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.associations a
            WHERE a.id = association_cycles.association_id
              AND a.owner_id = auth.uid()
        )
    );

-- -----------------------------------------------------------------------------
-- 2. IDEMPOTENT BACKFILL: Populate Missing Cycles for Existing Associations
-- -----------------------------------------------------------------------------
-- This block inspects every association in public.associations:
-- If any cycle (1 .. duration_months) is missing, it inserts it with exact due_date.
-- If a cycle already exists, it leaves it completely untouched (NO DUPLICATES).
-- ZERO deletions. ZERO modifications to existing financial records.
DO $$
DECLARE
    r_assoc RECORD;
    v_idx INTEGER;
    v_due DATE;
    v_cycle_id TEXT;
    v_inserted_count INTEGER := 0;
BEGIN
    FOR r_assoc IN
        SELECT a.id, a.start_date, COALESCE(a.duration_months, a.total_shares, 1) AS duration_months
        FROM public.associations a
    LOOP
        FOR v_idx IN 1..r_assoc.duration_months LOOP
            -- Calculate due_date: start_date + (v_idx - 1) months
            v_due := (r_assoc.start_date + ((v_idx - 1) || ' month')::interval)::date;

            -- Insert cycle ONLY IF it does not already exist
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
            END IF;
        END LOOP;
    END LOOP;

    RAISE NOTICE 'GM3ETY Backfill complete. Inserted % missing cycles.', v_inserted_count;
END;
$$;

COMMIT;

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
