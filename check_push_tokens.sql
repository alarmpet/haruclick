-- check_push_tokens.sql
SELECT count(*) FROM public.user_push_tokens;

-- Check if RLS is enabled
SELECT tablename, rowsecurity FROM pg_tables WHERE tablename = 'user_push_tokens';

-- Check policies
select * from pg_policies where tablename = 'user_push_tokens';
