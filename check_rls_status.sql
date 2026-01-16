-- ============================================================
-- 🕵️‍♂️ RLS 상태 및 데이터 무결성 진단 스크립트
-- 이 내용을 실행하여 현재 DB 상태를 파악해주세요.
-- ============================================================

-- 1. 활성화된 모든 RLS 정책 리스트 확인
SELECT 
    schemaname, 
    tablename, 
    policyname, 
    permissive, 
    roles, 
    cmd, 
    qual, 
    with_check 
FROM pg_policies 
WHERE tablename IN ('ledger', 'bank_transactions', 'events', 'polls');

-- 2. RLS 활성화 여부 확인 (True가 나와야 함)
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE tablename IN ('ledger', 'bank_transactions', 'events', 'polls');

-- 3. 데이터에 user_id가 제대로 들어있는지 샘플 확인
-- (개인정보 보호를 위해 ID 일부만 출력)
SELECT 
    id, 
    category, 
    amount, 
    user_id 
FROM ledger 
LIMIT 10;

-- 4. public (익명) 접근 허용 정책이 남아있는지 확인
SELECT * FROM pg_policies WHERE qual LIKE '%true%' OR with_check LIKE '%true%';
