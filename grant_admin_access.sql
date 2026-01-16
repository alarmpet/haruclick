-- ============================================================
-- 🔓 관리자(Admin) 전용 접근 권한 부여
-- RLS가 켜져 있어도 관리자는 모든 데이터를 조회/관리할 수 있게 합니다.
-- ============================================================

-- 1. Ledger (가계부) - 관리자는 모든 데이터 조회(SELECT) 가능
CREATE POLICY "Admins can view all ledger"
ON public.ledger
FOR SELECT
USING (auth.jwt() ->> 'email' IN ('petblo12@gmail.com', 'admin@minsim.com'));

-- 관리자는 필요 시 수정/삭제 가능 (OCR 정정 등)
CREATE POLICY "Admins can update all ledger"
ON public.ledger
FOR UPDATE
USING (auth.jwt() ->> 'email' IN ('petblo12@gmail.com', 'admin@minsim.com'));


-- 2. Bank Transactions - 관리자는 모든 데이터 조회 가능
CREATE POLICY "Admins can view all bank transactions"
ON public.bank_transactions
FOR SELECT
USING (auth.jwt() ->> 'email' IN ('petblo12@gmail.com', 'admin@minsim.com'));


-- 3. Events - 관리자는 모든 데이터 조회 가능
CREATE POLICY "Admins can view all events"
ON public.events
FOR SELECT
USING (auth.jwt() ->> 'email' IN ('petblo12@gmail.com', 'admin@minsim.com'));


-- 4. Polls (민심광장) - 관리자는 삭제(DELETE) 가능
CREATE POLICY "Admins can delete any poll"
ON public.polls
FOR DELETE
USING (auth.jwt() ->> 'email' IN ('petblo12@gmail.com', 'admin@minsim.com'));


-- 5. 확인
SELECT tablename, policyname, cmd FROM pg_policies WHERE policyname LIKE 'Admins%';
