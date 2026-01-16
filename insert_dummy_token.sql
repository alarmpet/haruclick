-- insert_dummy_token.sql
-- 실제 기기 토큰이 없어도 관리자 페이지 테스트를 위해 임시 데이터를 넣습니다.

INSERT INTO public.user_push_tokens (push_token, device_type, user_id)
SELECT 
    'ExponentPushToken[DummyTokenForTesting123]', -- 가짜 토큰
    'android',
    id -- 실제 유저 ID 아무거나 하나 가져옴
FROM auth.users
LIMIT 1;
