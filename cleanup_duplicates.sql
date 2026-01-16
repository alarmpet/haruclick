-- ============================================================
-- 🧹 중복 정책 정리 (스크린샷 기반)
-- Ledger 테이블에 여러 개의 쪼개진 정책들이 남아있어서 정리합니다.
-- ============================================================

-- 스크린샷에 보이는 구형 정책들 삭제
DROP POLICY IF EXISTS "Users can view their own ledger" ON public.ledger;
DROP POLICY IF EXISTS "Users can insert their own ledger" ON public.ledger;
DROP POLICY IF EXISTS "Users can update their own ledger" ON public.ledger;
DROP POLICY IF EXISTS "Users can delete their own ledger" ON public.ledger;

-- Bank Transactions 정책도 혹시 모르니 확인 후 삭제
DROP POLICY IF EXISTS "Users can view their own bank transactions" ON public.bank_transactions;
DROP POLICY IF EXISTS "Users can insert their own bank transactions" ON public.bank_transactions;
DROP POLICY IF EXISTS "Users can update their own bank transactions" ON public.bank_transactions;
DROP POLICY IF EXISTS "Users can delete their own bank transactions" ON public.bank_transactions;


-- 최종 확인: 이제 각 테이블당 1개의 통합 정책만 남아야 합니다.
SELECT tablename, policyname, cmd, qual
FROM pg_policies 
WHERE tablename = 'ledger';
