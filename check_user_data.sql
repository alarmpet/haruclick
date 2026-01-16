
-- Check Push Token for specific email
SELECT 
    au.email,
    upt.push_token,
    upt.device_type,
    upt.last_updated
FROM auth.users au
LEFT JOIN public.user_push_tokens upt ON au.id = upt.user_id
WHERE au.email = 'petblo12@gmail.com';

-- Check Event Count for specific email
SELECT 
    au.email,
    count(e.id) as event_count
FROM auth.users au
LEFT JOIN public.events e ON au.id = e.user_id
WHERE au.email = 'petblo12@gmail.com'
GROUP BY au.email;

-- Check Ledger Count
SELECT 
    au.email,
    count(l.id) as ledger_count
FROM auth.users au
LEFT JOIN public.ledger l ON au.id = l.user_id
WHERE au.email = 'petblo12@gmail.com'
GROUP BY au.email;
