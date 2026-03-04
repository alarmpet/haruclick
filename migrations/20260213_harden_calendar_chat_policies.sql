-- ============================================================
-- Calendar Chat Policy Hardening
-- Date: 2026-02-13
-- Description:
--   - Normalize policy names after iterative migration changes
--   - Remove legacy permissive policies
--   - Keep chat restricted to shared calendars only
-- ============================================================

ALTER TABLE public.calendar_chat_messages ENABLE ROW LEVEL SECURITY;

-- Remove legacy/variant policy names if present.
DROP POLICY IF EXISTS "Members can view messages" ON public.calendar_chat_messages;
DROP POLICY IF EXISTS "Members can insert messages" ON public.calendar_chat_messages;
DROP POLICY IF EXISTS "Users can update own messages" ON public.calendar_chat_messages;
DROP POLICY IF EXISTS "Members can update chat" ON public.calendar_chat_messages;
DROP POLICY IF EXISTS "Members can delete chat" ON public.calendar_chat_messages;

-- Remove current policy names before re-create (idempotent).
DROP POLICY IF EXISTS "Members can view chat" ON public.calendar_chat_messages;
DROP POLICY IF EXISTS "Members can send chat" ON public.calendar_chat_messages;
DROP POLICY IF EXISTS "Users can delete own messages" ON public.calendar_chat_messages;

-- SELECT: only shared calendar members can read.
CREATE POLICY "Members can view chat" ON public.calendar_chat_messages
FOR SELECT
USING (
    calendar_id IN (SELECT public.get_my_calendar_ids())
    AND calendar_id IN (SELECT id FROM public.calendars WHERE is_personal = false)
);

-- INSERT: only shared calendar members can write as themselves.
CREATE POLICY "Members can send chat" ON public.calendar_chat_messages
FOR INSERT
WITH CHECK (
    user_id = auth.uid()
    AND calendar_id IN (SELECT public.get_my_calendar_ids())
    AND calendar_id IN (SELECT id FROM public.calendars WHERE is_personal = false)
);

-- DELETE: author can delete own messages while still a member of shared calendar.
CREATE POLICY "Users can delete own messages" ON public.calendar_chat_messages
FOR DELETE
USING (
    user_id = auth.uid()
    AND calendar_id IN (SELECT public.get_my_calendar_ids())
    AND calendar_id IN (SELECT id FROM public.calendars WHERE is_personal = false)
);

-- Intentionally no UPDATE policy (message edit disabled by design).
