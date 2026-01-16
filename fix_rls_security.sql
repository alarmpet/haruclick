-- ============================================================
-- 🔒 보안 업데이트: 사용자 데이터 격리 (RLS 적용)
-- 이 스크립트를 Supabase SQL Editor에서 실행하여
-- 다른 사용자의 데이터가 보이지 않도록 수정하세요.
-- ============================================================

-- 1. 기존 취약한 데모 정책 삭제 (존재할 경우)
DROP POLICY IF EXISTS "Allow public access for demo ledger" ON public.ledger;
DROP POLICY IF EXISTS "Allow public access for demo bank_transactions" ON public.bank_transactions;
DROP POLICY IF EXISTS "Allow public access for demo events" ON public.events;

-- 2. 각 테이블에 RLS(Row Level Security) 강제 활성화
ALTER TABLE public.ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

-- 3. [Ledger] 본인 데이터만 CRUD 가능하도록 정책 설정
CREATE POLICY "Users can only access their own ledger"
ON public.ledger
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- 4. [Bank Transactions] 본인 데이터만 CRUD 가능하도록 정책 설정
CREATE POLICY "Users can only access their own bank transactions"
ON public.bank_transactions
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- 5. [Events] 본인 데이터만 CRUD 가능하도록 정책 설정
CREATE POLICY "Users can only access their own events"
ON public.events
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- 6. 확인용: 정책이 잘 적용되었는지 확인
SELECT tablename, policyname, permissive, roles, cmd, qual, with_check 
FROM pg_policies 
WHERE tablename IN ('ledger', 'bank_transactions', 'events');
