-- ============================================================
-- Add category_group / income_type / asset_type to ledger
-- ============================================================

ALTER TABLE public.ledger
ADD COLUMN IF NOT EXISTS category_group text,
ADD COLUMN IF NOT EXISTS income_type text,
ADD COLUMN IF NOT EXISTS asset_type text;

COMMENT ON COLUMN public.ledger.category_group IS 'fixed_expense | variable_expense | income | asset_transfer';
COMMENT ON COLUMN public.ledger.income_type IS 'main | side | financial_other';
COMMENT ON COLUMN public.ledger.asset_type IS 'saving | investment | loan | transfer';

-- ------------------------------------------------------------
-- Backfill existing data based on current category
-- ------------------------------------------------------------
UPDATE public.ledger
SET category_group = CASE
  WHEN category IN ('주거/통신/광열', '비소비지출/금융') THEN 'fixed_expense'
  WHEN category IN ('식비', '교통/차량', '문화/여가', '쇼핑/생활', '의료/건강', '교육', '기타', '인맥', '경조사') THEN 'variable_expense'
  WHEN category IN ('수입', '입금', '월급', '용돈', '금융수입') THEN 'income'
  WHEN category IN ('이체', '자산인출') THEN 'asset_transfer'
  ELSE 'variable_expense'
END;
