-- Migration: Fix interest event visibility in calendar
-- Date: 2026-03-04
-- Purpose:
-- 1) Normalize existing interest/culture event categories to `schedule`
-- 2) Keep category-based RLS checks compatible with legacy interest labels

-- ------------------------------------------------------------
-- 1. Normalize existing event categories in interest calendars
-- ------------------------------------------------------------
UPDATE public.events e
SET category = 'schedule'
FROM public.calendars c
WHERE e.calendar_id = c.id
  AND c.calendar_type = 'interest'
  AND e.category IS DISTINCT FROM 'schedule'
  AND (
    e.category IS NULL
    OR lower(e.category) IN ('interest', 'performance', 'exhibition', 'festival', 'popup')
  );

-- ------------------------------------------------------------
-- 2. Replace category permission helper with compatibility mapping
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_view_event_category(
    p_calendar_id UUID,
    p_category TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
    v_category TEXT;
BEGIN
    -- Personal (legacy) events are always visible to existing policies.
    IF p_calendar_id IS NULL THEN
        RETURN TRUE;
    END IF;

    v_category := lower(coalesce(p_category, 'ceremony'));

    -- Legacy interest/culture labels should behave as calendar "schedule".
    IF v_category IN ('interest', 'performance', 'exhibition', 'festival', 'popup') THEN
        v_category := 'schedule';
    END IF;

    RETURN EXISTS (
        SELECT 1
        FROM public.calendar_members
        WHERE calendar_id = p_calendar_id
          AND user_id = auth.uid()
          AND (
            shared_categories IS NULL
            OR v_category = ANY(shared_categories)
          )
    );
END;
$$;

COMMENT ON FUNCTION public.can_view_event_category IS
'Category permission helper with compatibility mapping for legacy interest/culture categories.';

