-- ============================================================
-- � Minsim 보안 및 스키마 최종 초기화 (Secure Version)
-- ⚠️ 주의: 기존 데이터가 모두 삭제됩니다!
-- ============================================================

-- 1. 기존 테이블 삭제 (의존성 순서 고려)
-- ledger 테이블 삭제 구문을 추가하여 완벽하게 초기화합니다.
DROP TABLE IF EXISTS public.ledger CASCADE;
DROP TABLE IF EXISTS public.votes CASCADE;
DROP TABLE IF EXISTS public.polls CASCADE;
DROP TABLE IF EXISTS public.gifticons CASCADE;
DROP TABLE IF EXISTS public.events CASCADE;

-- 2. EVENTS 테이블 생성 (통합 정의)
-- 나중에 추가된 컬럼들(category, is_completed 등)을 처음에 정의하여 깔끔하게 만듭니다.
create table public.events (
  id uuid default gen_random_uuid() primary key,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  user_id uuid references auth.users(id) default auth.uid(),
  
  -- 기본 정보
  type text, -- wedding, funeral, birthday, etc.
  name text, -- 대상 이름
  relation text, -- 관계
  event_date date, -- 날짜
  amount integer, -- 금액
  is_received boolean default false, -- 받은 돈 여부
  memo text, -- 메모
  
  -- ✅ 추가 필드 통합
  category text DEFAULT 'ceremony', -- 'ceremony', 'todo', 'schedule', 'expense'
  is_completed boolean DEFAULT false, -- 할일 완료 여부
  start_time time, -- 일정 시작 시간
  end_time time, -- 일정 종료 시간
  location text -- 장소
);

alter table public.events enable row level security;

-- ✅ EVENTS RLS 정책
CREATE POLICY "Users can view their own events" ON public.events FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own events" ON public.events FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own events" ON public.events FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own events" ON public.events FOR DELETE USING (auth.uid() = user_id);


-- 3. GIFTICONS 테이블 생성
create table public.gifticons (
    id uuid default gen_random_uuid() primary key,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    user_id uuid references auth.users(id) default auth.uid(),
    product_name text not null,
    sender_name text,
    expiry_date date not null,
    image_url text,
    status text default 'available',
    estimated_price integer default 0,
    barcode_number text
);

alter table public.gifticons enable row level security;

-- ✅ GIFTICONS RLS 정책
CREATE POLICY "Users can view their own gifticons" ON public.gifticons FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own gifticons" ON public.gifticons FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own gifticons" ON public.gifticons FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own gifticons" ON public.gifticons FOR DELETE USING (auth.uid() = user_id);


-- 4. POLLS & VOTES (투표 기능)
create table public.polls (
    id uuid default gen_random_uuid() primary key,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    user_id uuid references auth.users(id) default auth.uid(),
    situation_summary text not null,
    context jsonb, -- { productName, senderName, estimatedPrice, occasion }
    poll_type text default 'gift_amount',
    status text default 'active',
    total_votes integer default 0
);
alter table public.polls enable row level security;

-- 정책: 누구나 볼 수 있음 (공유 목적), 생성은 로그인 유저만
CREATE POLICY "Anyone can view polls" ON public.polls FOR SELECT USING (true);
CREATE POLICY "Users can create polls" ON public.polls FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own polls" ON public.polls FOR DELETE USING (auth.uid() = user_id);

create table public.votes (
    id uuid default gen_random_uuid() primary key,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    poll_id uuid references public.polls(id) on delete cascade not null,
    voter_id uuid references auth.users(id) default auth.uid(),
    selected_amount integer not null
);
alter table public.votes enable row level security;

-- 정책: 누구나 투표 가능
CREATE POLICY "Anyone can vote" ON public.votes FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can view votes" ON public.votes FOR SELECT USING (true);

create index votes_poll_id_idx on public.votes(poll_id);


-- 5. LEDGER (가계부) 테이블 생성
-- 별도 ALTER 구문 없이 깔끔하게 정의
CREATE TABLE public.ledger (
  id uuid default gen_random_uuid() primary key,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  user_id uuid references auth.users(id) default auth.uid(),
  
  transaction_date timestamp with time zone not null,
  amount integer not null,
  merchant_name text,
  category text,
  image_url text,
  memo text,
  raw_text text
);

alter table public.ledger enable row level security;

-- ✅ LEDGER RLS 정책
CREATE POLICY "Users can view their own ledger" ON public.ledger FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own ledger" ON public.ledger FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own ledger" ON public.ledger FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own ledger" ON public.ledger FOR DELETE USING (auth.uid() = user_id);
