-- ============================================================
-- Calendar Chat Verification Checklist
-- Run in Supabase SQL Editor after migrations.
-- ============================================================

-- 1) Table + columns
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'calendar_chat_messages'
ORDER BY ordinal_position;

-- 2) FK delete behavior (calendar_id/user_id should be CASCADE)
SELECT
  c.conname,
  a.attname AS constrained_column,
  pg_get_constraintdef(c.oid) AS constraint_def,
  c.confdeltype
FROM pg_constraint c
JOIN pg_class t ON c.conrelid = t.oid
JOIN pg_namespace n ON n.oid = t.relnamespace
JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(c.conkey)
WHERE n.nspname = 'public'
  AND t.relname = 'calendar_chat_messages'
  AND c.contype = 'f';

-- 3) Realtime publication attachment
SELECT *
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
  AND schemaname = 'public'
  AND tablename = 'calendar_chat_messages';

-- 4) RLS enabled + policy list
SELECT relname, relrowsecurity
FROM pg_class
WHERE oid = 'public.calendar_chat_messages'::regclass;

SELECT policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'calendar_chat_messages'
ORDER BY policyname;

-- 5) RPC function existence
SELECT proname, proargnames, pg_get_functiondef(p.oid)
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
  AND p.proname = 'get_calendar_members_with_profile';

-- 6) Legacy policy residue check (should return 0 rows)
SELECT policyname
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'calendar_chat_messages'
  AND policyname IN (
    'Members can view messages',
    'Members can insert messages',
    'Users can update own messages',
    'Members can update chat',
    'Members can delete chat'
  );
