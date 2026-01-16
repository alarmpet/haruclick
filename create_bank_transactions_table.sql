-- ============================================================
-- 🏦 Bank Transactions Table Setup
-- 이체/송금 내역을 별도로 관리하기 위한 테이블입니다.
-- ============================================================

CREATE TABLE public.bank_transactions (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    user_id uuid REFERENCES auth.users(id) DEFAULT auth.uid(),

    transaction_date timestamp with time zone NOT NULL,
    amount integer NOT NULL,
    transaction_type text NOT NULL CHECK (transaction_type IN ('deposit', 'withdrawal')), -- 입금, 출금
    
    sender_name text,   -- 입금자명 (입금 시)
    receiver_name text, -- 받는사람 (출금 시)
    
    balance_after integer, -- 거래 후 잔액 (선택)
    memo text,
    category text DEFAULT 'transfer', -- transfer, salary, pocket_money, etc.
    
    raw_text text -- OCR 원본 텍스트 (디버깅용)
);

-- Enable RLS
ALTER TABLE public.bank_transactions ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own bank transactions" 
    ON public.bank_transactions FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own bank transactions" 
    ON public.bank_transactions FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own bank transactions" 
    ON public.bank_transactions FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own bank transactions" 
    ON public.bank_transactions FOR DELETE USING (auth.uid() = user_id);
