-- ============================================================
-- Fix: Ledger RLS category_group mismatch
-- Date: 2026-02-10
-- Issue: RLS checks for 'expense' but actual values are 
--        'fixed_expense', 'variable_expense', 'income', 'asset_transfer'
-- ============================================================

-- 1. Fix SELECT Policy
DROP POLICY IF EXISTS "Users can view ledger" ON public.ledger;
CREATE POLICY "Users can view ledger" ON public.ledger FOR SELECT
USING (
    -- Personal ledger (all types)
    (calendar_id IS NULL AND user_id = auth.uid())
    -- Shared ledger (expense types only + permission check)
    OR (
        calendar_id IN (SELECT public.get_my_calendar_ids())
        AND public.can_view_event_category(calendar_id, 'expense')
        AND category_group IN ('fixed_expense', 'variable_expense') -- ✅ FIX: Changed from = 'expense'
    )
);

-- 2. Fix INSERT Policy
DROP POLICY IF EXISTS "Users can insert ledger" ON public.ledger;
CREATE POLICY "Users can insert ledger" ON public.ledger FOR INSERT
WITH CHECK (
    -- Personal ledger (all types)
    (calendar_id IS NULL AND user_id = auth.uid())
    -- Shared ledger (expense types + editor permission)
    OR (
        calendar_id IN (SELECT public.get_my_editable_calendar_ids())
        AND public.can_view_event_category(calendar_id, 'expense')
        AND user_id = auth.uid()
        AND category_group IN ('fixed_expense', 'variable_expense') -- ✅ FIX: Changed from = 'expense'
    )
);

-- 3. Fix UPDATE Policy
DROP POLICY IF EXISTS "Users can update ledger" ON public.ledger;
CREATE POLICY "Users can update ledger" ON public.ledger FOR UPDATE
USING (
    (calendar_id IS NULL AND user_id = auth.uid())
    OR (
        calendar_id IN (SELECT public.get_my_editable_calendar_ids())
        AND public.can_view_event_category(calendar_id, 'expense')
    )
)
WITH CHECK (
    (calendar_id IS NULL AND user_id = auth.uid())
    OR (
        calendar_id IN (SELECT public.get_my_editable_calendar_ids())
        AND public.can_view_event_category(calendar_id, 'expense')
        AND category_group IN ('fixed_expense', 'variable_expense') -- ✅ FIX: Ensure only expense types in shared
    )
);

-- 4. Fix DELETE Policy (keep as is, no category_group check needed for deletion)
DROP POLICY IF EXISTS "Users can delete ledger" ON public.ledger;
CREATE POLICY "Users can delete ledger" ON public.ledger FOR DELETE
USING (
    (calendar_id IS NULL AND user_id = auth.uid())
    OR (
        calendar_id IN (SELECT public.get_my_editable_calendar_ids())
        AND public.can_view_event_category(calendar_id, 'expense')
    )
);

-- ============================================================
-- 5. Add missing indexes (P2)
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_event_comments_event_id 
    ON public.event_comments(event_id);

CREATE INDEX IF NOT EXISTS idx_ledger_calendar_date 
    ON public.ledger(calendar_id, transaction_date);

COMMENT ON INDEX idx_event_comments_event_id IS 'Performance index for event comment queries';
COMMENT ON INDEX idx_ledger_calendar_date IS 'Composite index for shared ledger date range queries';
