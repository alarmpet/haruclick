-- ============================================================
-- 📲 푸시 토큰 저장소 생성
-- 유저의 Expo Push Token을 저장할 테이블을 만듭니다.
-- ============================================================

-- 1. 테이블 생성
CREATE TABLE IF NOT EXISTS public.user_push_tokens (
    push_token TEXT PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    device_type TEXT, -- 'ios' or 'android'
    last_updated TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. RLS 활성화
ALTER TABLE public.user_push_tokens ENABLE ROW LEVEL SECURITY;

-- 3. 정책 설정
-- [유저] 본인의 토큰만 등록/수정/삭제 가능
CREATE POLICY "Users can manage their own push tokens"
ON public.user_push_tokens
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- [관리자] 모든 토큰 조회 가능 (발송용)
CREATE POLICY "Admins can view all push tokens"
ON public.user_push_tokens
FOR SELECT
USING (auth.jwt() ->> 'email' IN ('petblo12@gmail.com', 'admin@minsim.com'));

-- 4. 인덱스 (조회 속도 향상)
CREATE INDEX IF NOT EXISTS idx_push_tokens_user_id ON public.user_push_tokens(user_id);
