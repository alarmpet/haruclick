-- ============================================================
-- 🧹 보안 정책 초기화 및 재설정 (전체 적용)
-- 기존의 모든 정책을 확실히 삭제하고, 올바른 보안 규칙을 다시 적용합니다.
-- ============================================================

-- 1. Ledger 테이블 정책 재설정
DROP POLICY IF EXISTS "Allow public access for demo ledger" ON public.ledger;
DROP POLICY IF EXISTS "Users can only access their own ledger" ON public.ledger;
DROP POLICY IF EXISTS "Admins can view all ledger" ON public.ledger;
DROP POLICY IF EXISTS "Admins can update all ledger" ON public.ledger;
-- 혹시 모를 다른 이름의 정책들도 삭제 (수동 확인 필요할 수 있음)

ALTER TABLE public.ledger ENABLE ROW LEVEL SECURITY;

-- [Rule 1] 본인 데이터만 보기/수정
CREATE POLICY "Users can only access their own ledger"
ON public.ledger
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- [Rule 2] 관리자(특정 이메일)는 모든 데이터 보기
CREATE POLICY "Admins can view all ledger"
ON public.ledger
FOR SELECT
USING (auth.jwt() ->> 'email' IN ('petblo12@gmail.com', 'admin@minsim.com'));

-- [Rule 3] 관리자 수정 권한
CREATE POLICY "Admins can update all ledger"
ON public.ledger
FOR UPDATE
USING (auth.jwt() ->> 'email' IN ('petblo12@gmail.com', 'admin@minsim.com'));


-- 2. Bank Transactions 테이블 정책 재설정
DROP POLICY IF EXISTS "Allow public access for demo bank_transactions" ON public.bank_transactions;
DROP POLICY IF EXISTS "Users can only access their own bank transactions" ON public.bank_transactions;
DROP POLICY IF EXISTS "Admins can view all bank transactions" ON public.bank_transactions;

ALTER TABLE public.bank_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can only access their own bank transactions"
ON public.bank_transactions
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can view all bank transactions"
ON public.bank_transactions
FOR SELECT
USING (auth.jwt() ->> 'email' IN ('petblo12@gmail.com', 'admin@minsim.com'));


-- 3. Events 테이블 정책 재설정
DROP POLICY IF EXISTS "Allow public access for demo events" ON public.events;
DROP POLICY IF EXISTS "Users can only access their own events" ON public.events;
DROP POLICY IF EXISTS "Admins can view all events" ON public.events;

ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can only access their own events"
ON public.events
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can view all events"
ON public.events
FOR SELECT
USING (auth.jwt() ->> 'email' IN ('petblo12@gmail.com', 'admin@minsim.com'));


-- 4. Polls 테이블 (민심광장) - 관리자는 삭제 가능
DROP POLICY IF EXISTS "Admins can delete any poll" ON public.polls;

CREATE POLICY "Admins can delete any poll"
ON public.polls
FOR DELETE
USING (auth.jwt() ->> 'email' IN ('petblo12@gmail.com', 'admin@minsim.com'));


-- 5. 완료 확인
SELECT tablename, policyname, cmd FROM pg_policies 
WHERE tablename IN ('ledger', 'bank_transactions', 'events', 'polls')
ORDER BY tablename;
