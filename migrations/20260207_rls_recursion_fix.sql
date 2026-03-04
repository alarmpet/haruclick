-- Migration: RLS Recursion Fix
-- Date: 2026-02-07
-- Description: Introduces SECURITY DEFINER functions to prevent infinite recursion in RLS policies

-- ===========================================
-- 1. SECURITY DEFINER 함수 생성
-- ===========================================

CREATE OR REPLACE FUNCTION public.get_my_calendar_ids()
RETURNS SETOF UUID
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$ SELECT calendar_id FROM public.calendar_members WHERE user_id = auth.uid(); $$;

CREATE OR REPLACE FUNCTION public.get_my_editable_calendar_ids()
RETURNS SETOF UUID
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$ SELECT calendar_id FROM public.calendar_members WHERE user_id = auth.uid() AND role IN ('owner','editor'); $$;

-- ===========================================
-- 2. calendar_members 정책 교체
-- ===========================================

DROP POLICY IF EXISTS "Members can view other members" ON public.calendar_members;
CREATE POLICY "Members can view other members" ON public.calendar_members FOR SELECT
USING (calendar_id IN (SELECT public.get_my_calendar_ids()));

DROP POLICY IF EXISTS "Owner/Editor can add members" ON public.calendar_members;
CREATE POLICY "Owner/Editor can add members" ON public.calendar_members FOR INSERT
WITH CHECK (
  calendar_id IN (SELECT public.get_my_editable_calendar_ids())
  OR EXISTS (SELECT 1 FROM public.calendars WHERE id = calendar_id AND owner_id = auth.uid())
);

DROP POLICY IF EXISTS "Owner can remove members" ON public.calendar_members;
DROP POLICY IF EXISTS "Members can leave" ON public.calendar_members;
CREATE POLICY "Owner can remove members" ON public.calendar_members FOR DELETE
USING (
  calendar_id IN (SELECT public.get_my_editable_calendar_ids())
  OR user_id = auth.uid()
);

-- ===========================================
-- 3. calendars 정책 교체
-- ===========================================

DROP POLICY IF EXISTS "Members can view calendars" ON public.calendars;
DROP POLICY IF EXISTS "Members or Owner can view calendars" ON public.calendars;
CREATE POLICY "Members or Owner can view calendars" ON public.calendars FOR SELECT
USING (
  id IN (SELECT public.get_my_calendar_ids())
  OR owner_id = auth.uid()
);

-- ===========================================
-- 4. events 정책 교체
-- ===========================================

DROP POLICY IF EXISTS "Calendar members can view events" ON public.events;
CREATE POLICY "Calendar members can view events" ON public.events FOR SELECT
USING (
  calendar_id IN (SELECT public.get_my_calendar_ids())
  OR (calendar_id IS NULL AND user_id = auth.uid())
);

DROP POLICY IF EXISTS "Calendar members can insert events" ON public.events;
CREATE POLICY "Calendar members can insert events" ON public.events FOR INSERT
WITH CHECK (
  (calendar_id IN (SELECT public.get_my_editable_calendar_ids()) AND created_by = auth.uid())
  OR (calendar_id IS NULL AND user_id = auth.uid() AND created_by = auth.uid())
);

DROP POLICY IF EXISTS "Members can update events" ON public.events;
CREATE POLICY "Members can update events" ON public.events FOR UPDATE
USING (
  calendar_id IN (SELECT public.get_my_editable_calendar_ids())
  OR created_by = auth.uid()
  OR (calendar_id IS NULL AND user_id = auth.uid())
)
WITH CHECK (
  calendar_id IN (SELECT public.get_my_editable_calendar_ids())
  OR (calendar_id IS NULL AND user_id = auth.uid())
);

DROP POLICY IF EXISTS "Members can delete events" ON public.events;
CREATE POLICY "Members can delete events" ON public.events FOR DELETE
USING (
  calendar_id IN (SELECT public.get_my_editable_calendar_ids())
  OR created_by = auth.uid()
  OR (calendar_id IS NULL AND user_id = auth.uid())
);

-- ===========================================
-- 5. event_comments 정책 교체
-- ===========================================

DROP POLICY IF EXISTS "Calendar members can view comments" ON public.event_comments;
CREATE POLICY "Calendar members can view comments" ON public.event_comments FOR SELECT
USING (
  event_id IN (
    SELECT id FROM public.events
    WHERE calendar_id IN (SELECT public.get_my_calendar_ids())
  )
);

DROP POLICY IF EXISTS "Calendar members can add comments" ON public.event_comments;
CREATE POLICY "Calendar members can add comments" ON public.event_comments FOR INSERT
WITH CHECK (
  event_id IN (
    SELECT id FROM public.events
    WHERE calendar_id IN (SELECT public.get_my_calendar_ids())
  )
);
