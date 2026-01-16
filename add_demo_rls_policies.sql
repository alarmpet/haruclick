-- ============================================================
-- 데모 모드용 RLS 정책 추가
-- ledger 및 bank_transactions 테이블에 공개 접근 허용
-- ⚠️ 주의: 프로덕션에서는 반드시 제거하세요!
-- ============================================================

-- Ledger 테이블 - 데모 정책 추가
CREATE POLICY "Allow public access for demo ledger"
    ON public.ledger
    FOR ALL
    USING (true)
    WITH CHECK (true);

-- Bank Transactions 테이블 - 데모 정책 추가
CREATE POLICY "Allow public access for demo bank_transactions"
    ON public.bank_transactions
    FOR ALL
    USING (true)
    WITH CHECK (true);

-- 확인: 정책 목록 조회
-- SELECT * FROM pg_policies WHERE tablename IN ('ledger', 'bank_transactions');
