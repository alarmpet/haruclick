-- ============================================================
-- 🧨 최종 정책 정리 (에러 수정본)
-- "policy already exists" 에러를 방지하기 위해
-- 기존 정책을 먼저 삭제(DROP)하고 다시 생성합니다.
-- ============================================================

-- 1. [Events] 기존 정책 모두 삭제
DROP POLICY IF EXISTS "Allow public access for demo" ON public.events;
DROP POLICY IF EXISTS "Users can only access their own events" ON public.events;
DROP POLICY IF EXISTS "Admins can view all events" ON public.events;

-- 2. [Gifticons] 기존 정책 모두 삭제
DROP POLICY IF EXISTS "Allow public access for demo gifticons" ON public.gifticons;
DROP POLICY IF EXISTS "Users can only access their own gifticons" ON public.gifticons;

-- 3. [Polls/Votes] 기존 정책 모두 삭제
DROP POLICY IF EXISTS "Allow public access for demo polls" ON public.polls;
DROP POLICY IF EXISTS "Allow public access for demo votes" ON public.votes;
DROP POLICY IF EXISTS "Admins can delete any poll" ON public.polls;

-- 4. [Ledger] 기존 정책 모두 삭제
DROP POLICY IF EXISTS "Allow public access for demo ledger" ON public.ledger;
DROP POLICY IF EXISTS "Users can only access their own ledger" ON public.ledger;
DROP POLICY IF EXISTS "Admins can view all ledger" ON public.ledger;
DROP POLICY IF EXISTS "Admins can update all ledger" ON public.ledger;

-- 5. [Bank Transactions] 기존 정책 모두 삭제
DROP POLICY IF EXISTS "Allow public access for demo bank_transactions" ON public.bank_transactions;
DROP POLICY IF EXISTS "Users can only access their own bank transactions" ON public.bank_transactions;
DROP POLICY IF EXISTS "Admins can view all bank transactions" ON public.bank_transactions;

-- ============================================================
-- 재설정 (관리자 권한 포함)
-- ============================================================

-- RLS 활성화 확인
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gifticons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.polls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_transactions ENABLE ROW LEVEL SECURITY;

-- 1. [Events]
CREATE POLICY "Users can only access their own events"
ON public.events FOR ALL
USING (auth.uid() = user_id OR auth.jwt() ->> 'email' IN ('petblo12@gmail.com', 'admin@minsim.com'));

-- 2. [Gifticons]
CREATE POLICY "Users can only access their own gifticons"
ON public.gifticons FOR ALL
USING (auth.uid() = user_id OR auth.jwt() ->> 'email' IN ('petblo12@gmail.com', 'admin@minsim.com'));

-- 3. [Ledger]
CREATE POLICY "Users can only access their own ledger"
ON public.ledger FOR ALL
USING (auth.uid() = user_id OR auth.jwt() ->> 'email' IN ('petblo12@gmail.com', 'admin@minsim.com'));

-- 4. [Bank Transactions]
CREATE POLICY "Users can only access their own bank transactions"
ON public.bank_transactions FOR ALL
USING (auth.uid() = user_id OR auth.jwt() ->> 'email' IN ('petblo12@gmail.com', 'admin@minsim.com'));

-- 5. [Polls] 관리자 삭제 권한
CREATE POLICY "Admins can delete any poll"
ON public.polls FOR DELETE
USING (auth.jwt() ->> 'email' IN ('petblo12@gmail.com', 'admin@minsim.com'));

-- 6. 확인
SELECT tablename, policyname, roles, qual 
FROM pg_policies 
WHERE tablename IN ('events', 'gifticons', 'ledger', 'polls')
ORDER BY tablename;
