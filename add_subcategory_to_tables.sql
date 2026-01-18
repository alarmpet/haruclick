-- Add sub_category column to ledger table
ALTER TABLE public.ledger 
ADD COLUMN IF NOT EXISTS sub_category text;

-- Add sub_category column to bank_transactions table
ALTER TABLE public.bank_transactions 
ADD COLUMN IF NOT EXISTS sub_category text;
