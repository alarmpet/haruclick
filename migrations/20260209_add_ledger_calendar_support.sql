-- ============================================================
-- Phase 2: Add Calendar Support to Ledger (Expense Only)
-- Date: 2026-02-09
-- Description: Enables ledger sharing in calendars, restricted to expense type only
-- ============================================================

-- 1. Add calendar_id to ledger
ALTER TABLE public.ledger
ADD COLUMN IF NOT EXISTS calendar_id UUID REFERENCES public.calendars(id) ON DELETE CASCADE;

COMMENT ON COLUMN public.ledger.calendar_id IS 
'NULL = 개인 가계부, UUID = 공유 캘린더 가계부 (지출만 허용)';

CREATE INDEX IF NOT EXISTS ledger_calendar_id_idx ON public.ledger(calendar_id);

-- ============================================================
-- 2. Update RLS Policies for Ledger (with category_group restriction)
-- ============================================================

-- 2.1 Ledger SELECT Policy
DROP POLICY IF EXISTS "Users can view their own ledger" ON public.ledger;
DROP POLICY IF EXISTS "Users can view ledger" ON public.ledger;

CREATE POLICY "Users can view ledger" ON public.ledger FOR SELECT
USING (
    -- Personal ledger (all types)
    (calendar_id IS NULL AND user_id = auth.uid())
    -- Shared ledger (expense only + permission check)
    OR (
        calendar_id IN (SELECT public.get_my_calendar_ids())
        AND public.can_view_event_category(calendar_id, 'expense')
        AND category_group = 'expense' -- Only expense shared
    )
);

-- 2.2 Ledger INSERT Policy
DROP POLICY IF EXISTS "Users can insert their own ledger" ON public.ledger;
DROP POLICY IF EXISTS "Users can insert ledger" ON public.ledger;

CREATE POLICY "Users can insert ledger" ON public.ledger FOR INSERT
WITH CHECK (
    -- Personal ledger (all types)
    (calendar_id IS NULL AND user_id = auth.uid())
    -- Shared ledger (editors + expense permission + expense type only)
    OR (
        calendar_id IN (SELECT public.get_my_editable_calendar_ids())
        AND public.can_view_event_category(calendar_id, 'expense')
        AND user_id = auth.uid()
        AND category_group = 'expense' -- Restrict to expense only
    )
);

-- 2.3 Ledger UPDATE Policy
DROP POLICY IF EXISTS "Users can update their own ledger" ON public.ledger;
DROP POLICY IF EXISTS "Users can update ledger" ON public.ledger;

CREATE POLICY "Users can update ledger" ON public.ledger FOR UPDATE
USING (
    (calendar_id IS NULL AND user_id = auth.uid())
    OR (
        calendar_id IN (SELECT public.get_my_editable_calendar_ids())
        AND public.can_view_event_category(calendar_id, 'expense')
    )
);

-- 2.4 Ledger DELETE Policy
DROP POLICY IF EXISTS "Users can delete their own ledger" ON public.ledger;
DROP POLICY IF EXISTS "Users can delete ledger" ON public.ledger;

CREATE POLICY "Users can delete ledger" ON public.ledger FOR DELETE
USING (
    (calendar_id IS NULL AND user_id = auth.uid())
    OR (
        calendar_id IN (SELECT public.get_my_editable_calendar_ids())
        AND public.can_view_event_category(calendar_id, 'expense')
    )
);
