-- ============================================================
-- 🔐 Minsim 보안 및 스키마 최종 초기화 (Secure Version)
-- ⚠️ 주의: 기존 데이터가 모두 삭제됩니다!
-- ============================================================

-- 1. 기존 테이블 삭제 (의존성 순서 고려)
DROP TABLE IF EXISTS public.votes CASCADE;
DROP TABLE IF EXISTS public.polls CASCADE;
DROP TABLE IF EXISTS public.gifticons CASCADE;
DROP TABLE IF EXISTS public.events CASCADE;

-- 2. EVENTS 테이블 생성 (보안 적용)
create table public.events (
  id uuid default gen_random_uuid() primary key,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  user_id uuid references auth.users(id) default auth.uid(), -- ✅ 사용자 ID 자동 입력 및 외래키
  type text,
  name text,
  relation text,
  event_date date,
  amount integer,
  is_received boolean default false,
  memo text
);

alter table public.events enable row level security;

-- ✅ EVENTS RLS 정책 (내 데이터만 관리)
CREATE POLICY "Users can view their own events" ON public.events FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own events" ON public.events FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own events" ON public.events FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own events" ON public.events FOR DELETE USING (auth.uid() = user_id);


-- 3. GIFTICONS 테이블 생성 (보안 적용)
create table public.gifticons (
    id uuid default gen_random_uuid() primary key,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    user_id uuid references auth.users(id) default auth.uid(), -- ✅ 사용자 ID 자동 입력 및 외래키
    product_name text not null,
    sender_name text,
    expiry_date date not null,
    image_url text,
    status text default 'available',
    estimated_price integer default 0,
    barcode_number text
);

alter table public.gifticons enable row level security;

-- ✅ GIFTICONS RLS 정책 (내 데이터만 관리)
CREATE POLICY "Users can view their own gifticons" ON public.gifticons FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own gifticons" ON public.gifticons FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own gifticons" ON public.gifticons FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own gifticons" ON public.gifticons FOR DELETE USING (auth.uid() = user_id);


-- 4. POLLS & VOTES (투표 기능)
-- 투표: 생성은 회원만, 조회는 누구나(예: 공유된 투표), 투표 참여는 누구나(로그인 안해도 가능할 수 있음)
create table public.polls (
    id uuid default gen_random_uuid() primary key,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    user_id uuid references auth.users(id) default auth.uid(),
    situation_summary text not null,
    context jsonb,
    poll_type text default 'gift_amount',
    status text default 'active',
    total_votes integer default 0
);
alter table public.polls enable row level security;

-- 정책: 누구나 볼 수 있음 (공유 목적), 생성은 로그인 유저만
CREATE POLICY "Anyone can view polls" ON public.polls FOR SELECT USING (true);
CREATE POLICY "Users can create polls" ON public.polls FOR INSERT WITH CHECK (auth.uid() = user_id);
-- (Optional) 작성자만 삭제/수정 가능
CREATE POLICY "Users can delete own polls" ON public.polls FOR DELETE USING (auth.uid() = user_id);

create table public.votes (
    id uuid default gen_random_uuid() primary key,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    poll_id uuid references public.polls(id) on delete cascade not null,
    voter_id uuid references auth.users(id) default auth.uid(), -- 익명이면 null 가능
    selected_amount integer not null
);
alter table public.votes enable row level security;

-- 정책: 누구나 투표 가능
CREATE POLICY "Anyone can vote" ON public.votes FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can view votes" ON public.votes FOR SELECT USING (true);

create index votes_poll_id_idx on public.votes(poll_id);
