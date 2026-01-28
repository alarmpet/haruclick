-- Verify legacy gifticons cleanup (run in Supabase SQL Editor).
SELECT to_regclass('public.gifticons') AS gifticons_table;

SELECT schemaname, tablename, policyname
FROM pg_policies
WHERE tablename = 'gifticons';
