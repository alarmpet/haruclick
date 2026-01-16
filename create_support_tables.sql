-- ============================================================
-- 📞 고객센터 (1:1 문의 & 공지사항) 테이블 생성
-- ============================================================

-- 1. 공지사항 (Notices)
CREATE TABLE IF NOT EXISTS public.notices (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    title TEXT NOT NULL,
    content TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.notices ENABLE ROW LEVEL SECURITY;

-- [정책] 누구나 읽기 가능 / 관리자만 쓰기 가능
CREATE POLICY "Public can view active notices" 
ON public.notices FOR SELECT 
USING (true);

CREATE POLICY "Admins can manage notices" 
ON public.notices FOR ALL 
USING (auth.jwt() ->> 'email' IN ('petblo12@gmail.com', 'admin@minsim.com'));


-- 2. 1:1 문의 (Inquiries)
CREATE TABLE IF NOT EXISTS public.inquiries (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    answer TEXT, -- 관리자 답변
    status TEXT DEFAULT 'pending', -- 'pending', 'answered'
    created_at TIMESTAMPTZ DEFAULT NOW(),
    answered_at TIMESTAMPTZ
);

ALTER TABLE public.inquiries ENABLE ROW LEVEL SECURITY;

-- [정책] 유저는 본인 것만 / 관리자는 전체 조회 및 수정(답변)
CREATE POLICY "Users can manage own inquiries" 
ON public.inquiries FOR ALL 
USING (auth.uid() = user_id);

CREATE POLICY "Admins can view and answer all inquiries" 
ON public.inquiries FOR ALL 
USING (auth.jwt() ->> 'email' IN ('petblo12@gmail.com', 'admin@minsim.com'));
