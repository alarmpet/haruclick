-- ============================================================
-- 🔄 Minsim 전체 스키마 초기화 및 재생성
-- Supabase SQL Editor에서 이 파일 전체를 복사하여 실행하세요.
-- ⚠️ 주의: 기존 데이터가 모두 삭제됩니다!
-- ============================================================

-- 1. 기존 테이블 삭제 (의존성 순서 고려: 자식 테이블부터)
DROP TABLE IF EXISTS public.votes CASCADE;
DROP TABLE IF EXISTS public.polls CASCADE;
DROP TABLE IF EXISTS public.ledger CASCADE;
DROP TABLE IF EXISTS public.bank_transactions CASCADE;
DROP TABLE IF EXISTS public.events CASCADE;

-- ============================================================
-- 2. 테이블 생성
-- ============================================================

-- Create a table for storing event history
create table public.events (
  id uuid default gen_random_uuid() primary key,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  user_id uuid default auth.uid(), -- If you implement auth later
  type text, -- Removed strict check to allow 'pay', 'gift', etc.
  name text,
  relation text,
  event_date date,
  amount integer,
  is_received boolean default false, -- false: given (내역), true: received (받은 돈)
  memo text
);

-- Enable Row Level Security (RLS)
alter table public.events enable row level security;

-- Create a policy to allow anyone to select/insert for now (since we are in demo mode without Auth)
-- WARNING: In production, you must change this to only allow authenticated users to view their own data!
create policy "Allow public access for demo"
  on public.events
  for all
  using (true)
  with check (true);

-- Polls Table (익명 민심 투표)
create table public.polls (
    id uuid default gen_random_uuid() primary key,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    user_id uuid default auth.uid(), -- Anonymous mode: will be null without auth
    situation_summary text not null,
    context jsonb, -- Store analysis data (product, sender, amount, etc.)
    poll_type text default 'gift_amount',
    status text default 'active', -- 'active' or 'closed'
    total_votes integer default 0
);

-- Enable RLS for polls
alter table public.polls enable row level security;

-- Policy for polls (Public read/write for demo)
create policy "Allow public access for demo polls"
  on public.polls
  for all
  using (true)
  with check (true);

-- Votes Table
create table public.votes (
    id uuid default gen_random_uuid() primary key,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    poll_id uuid references public.polls(id) on delete cascade not null,
    voter_id uuid default auth.uid(), -- Anonymous mode: will be null
    selected_amount integer not null -- 50000, 100000, 150000, 200000
);

-- Enable RLS for votes
alter table public.votes enable row level security;

-- Policy for votes (Public read/write for demo)
create policy "Allow public access for demo votes"
  on public.votes
  for all
  using (true)
  with check (true);

-- Create index for faster vote queries

-- ============================================================
-- 3. Ledger Table (가계부)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.ledger (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  user_id uuid REFERENCES auth.users(id) DEFAULT auth.uid(),
  
  transaction_date timestamp with time zone NOT NULL,
  amount integer NOT NULL,
  merchant_name text,
  category text,
  sub_category text, -- ✅ 추가: 소분류
  image_url text,
  memo text,
  raw_text text
);

-- Enable RLS
ALTER TABLE public.ledger ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own ledger" ON public.ledger FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own ledger" ON public.ledger FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own ledger" ON public.ledger FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own ledger" ON public.ledger FOR DELETE USING (auth.uid() = user_id);

-- ============================================================
-- 4. Bank Transactions Table
-- ============================================================
CREATE TABLE IF NOT EXISTS public.bank_transactions (
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
    sub_category text, -- ✅ 추가: 소분류
    
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

-- ============================================================
-- 5. Performance Indexes (성능 최적화)
-- ============================================================
-- RLS 및 날짜 정렬을 위한 최적화 인덱스
CREATE INDEX IF NOT EXISTS idx_events_user_date ON public.events(user_id, event_date);
CREATE INDEX IF NOT EXISTS idx_ledger_user_date ON public.ledger(user_id, transaction_date);
CREATE INDEX IF NOT EXISTS idx_bank_trans_user_date ON public.bank_transactions(user_id, transaction_date);

