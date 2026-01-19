-- ============================================================
-- 🛠️ Add sub_category Column Migration
-- ============================================================

-- 1. ledger 테이블에 sub_category 컬럼 추가 (Safe)
ALTER TABLE public.ledger 
ADD COLUMN IF NOT EXISTS sub_category text;

-- 2. bank_transactions 테이블에 sub_category 컬럼 추가 (Safe)
ALTER TABLE public.bank_transactions 
ADD COLUMN IF NOT EXISTS sub_category text;

-- 3. 코멘트 추가 (Documentation)
COMMENT ON COLUMN public.ledger.sub_category IS '상세 분류 (예: 식비 -> 카페/베이커리)';
COMMENT ON COLUMN public.bank_transactions.sub_category IS '상세 분류 (예: 식비 -> 카페/베이커리)';
