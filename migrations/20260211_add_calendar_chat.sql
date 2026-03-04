-- ============================================================
-- Calendar Chat Messages Table
-- Date: 2026-02-11
-- Description: Group chat for shared calendars only
-- ============================================================

-- ============================================================
-- 1. Create Chat Messages Table
-- ============================================================
CREATE TABLE IF NOT EXISTS public.calendar_chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    calendar_id UUID NOT NULL REFERENCES public.calendars(id) ON DELETE CASCADE,
    user_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
    message TEXT NOT NULL CHECK (length(trim(message)) > 0 AND length(message) <= 2000),
    type TEXT DEFAULT 'text' CHECK (type IN ('text', 'system')),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Align FK behavior for existing databases (old ON DELETE SET NULL -> CASCADE)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'calendar_chat_messages'
          AND column_name = 'user_id'
    ) THEN
        ALTER TABLE public.calendar_chat_messages
            ALTER COLUMN user_id SET NOT NULL;

        ALTER TABLE public.calendar_chat_messages
            DROP CONSTRAINT IF EXISTS calendar_chat_messages_user_id_fkey;

        ALTER TABLE public.calendar_chat_messages
            ADD CONSTRAINT calendar_chat_messages_user_id_fkey
            FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
    END IF;
END $$;

-- Composite index for efficient pagination (calendar + time descending)
CREATE INDEX IF NOT EXISTS idx_chat_calendar_created 
    ON public.calendar_chat_messages(calendar_id, created_at DESC, id DESC);

-- ============================================================
-- 2. Enable Realtime
-- ============================================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = 'calendar_chat_messages'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.calendar_chat_messages;
    END IF;
END $$;

-- ============================================================
-- 3. RLS Policies (Shared Calendars Only)
-- ============================================================
ALTER TABLE public.calendar_chat_messages ENABLE ROW LEVEL SECURITY;

-- SELECT: Members can view messages (shared calendars only)
DROP POLICY IF EXISTS "Members can view chat" ON public.calendar_chat_messages;
CREATE POLICY "Members can view chat" ON public.calendar_chat_messages FOR SELECT
USING (
    calendar_id IN (SELECT public.get_my_calendar_ids())
    AND calendar_id IN (SELECT id FROM public.calendars WHERE is_personal = false)
);

-- INSERT: Members can send messages (shared calendars only)
-- Note: Using get_my_calendar_ids() allows viewers to chat (Option A)
-- To restrict to editors only, change to get_my_editable_calendar_ids()
DROP POLICY IF EXISTS "Members can send chat" ON public.calendar_chat_messages;
CREATE POLICY "Members can send chat" ON public.calendar_chat_messages FOR INSERT
WITH CHECK (
    user_id = auth.uid()
    AND calendar_id IN (SELECT public.get_my_calendar_ids())
    AND calendar_id IN (SELECT id FROM public.calendars WHERE is_personal = false)
);

-- DELETE: Users can delete own messages only
DROP POLICY IF EXISTS "Users can delete own messages" ON public.calendar_chat_messages;
CREATE POLICY "Users can delete own messages" ON public.calendar_chat_messages FOR DELETE
USING (user_id = auth.uid());

-- ============================================================
-- 4. Member Profile RPC (display_name 조인)
-- ============================================================
-- Drop existing function if exists
DROP FUNCTION IF EXISTS public.get_calendar_members_with_profile(UUID);
CREATE OR REPLACE FUNCTION public.get_calendar_members_with_profile(p_calendar_id UUID)
RETURNS TABLE (
    user_id UUID,
    role TEXT,
    display_name TEXT,
    joined_at TIMESTAMPTZ
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
    SELECT 
        cm.user_id,
        cm.role,
        COALESCE(u.raw_user_meta_data->>'display_name', '익명') AS display_name,
        cm.joined_at
    FROM public.calendar_members cm
    LEFT JOIN auth.users u ON cm.user_id = u.id
    WHERE cm.calendar_id = p_calendar_id
      AND p_calendar_id IN (SELECT public.get_my_calendar_ids());
$$;

COMMENT ON FUNCTION public.get_calendar_members_with_profile IS 'Get calendar members with profile information (display_name from user_metadata)';
