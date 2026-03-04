-- ============================================================
-- Fix: calendar_chat_messages FK + Realtime safety patch
-- Date: 2026-02-12
-- Description:
--   - Ensure user_id FK uses ON DELETE CASCADE (not SET NULL)
--   - Ensure table is present in supabase_realtime publication
--   - Safe for environments where 20260211 was already applied
-- ============================================================

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

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = 'calendar_chat_messages'
    )
    AND NOT EXISTS (
        SELECT 1
        FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = 'calendar_chat_messages'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.calendar_chat_messages;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_chat_calendar_created
    ON public.calendar_chat_messages(calendar_id, created_at DESC, id DESC);
