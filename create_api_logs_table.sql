-- ============================================================
-- 📊 API 사용 로그 테이블 생성
-- OpenAI 등 외부 API 호출 내역을 기록하여 실제 비용을 산출합니다.
-- ============================================================

-- 1. 테이블 생성
CREATE TABLE IF NOT EXISTS public.api_usage_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL, -- 로그는 남기되 유저 삭제 시 user_id만 NULL 처리
    provider TEXT NOT NULL, -- 'openai', 'google_vision' 등
    endpoint TEXT NOT NULL, -- 'chat/completions', 'embeddings' 등
    model TEXT NOT NULL, -- 'gpt-4o-mini', 'text-embedding-3-small' 등
    tokens_input INTEGER DEFAULT 0,
    tokens_output INTEGER DEFAULT 0,
    tokens_total INTEGER DEFAULT 0,
    status TEXT DEFAULT 'success', -- 'success', 'error'
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. RLS 활성화
ALTER TABLE public.api_usage_logs ENABLE ROW LEVEL SECURITY;

-- 3. 정책 설정
-- [유저] 본인의 로그 생성(INSERT) 가능, 조회는 본인 것만
CREATE POLICY "Users can insert their own api logs"
ON public.api_usage_logs
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own api logs"
ON public.api_usage_logs
FOR SELECT
USING (auth.uid() = user_id);

-- [관리자] 모든 로그 조회 가능 (비용 분석용)
CREATE POLICY "Admins can view all api logs"
ON public.api_usage_logs
FOR SELECT
USING (auth.jwt() ->> 'email' IN ('petblo12@gmail.com', 'admin@minsim.com'));

-- 4. 인덱스 (날짜별 조회 속도 향상)
CREATE INDEX IF NOT EXISTS idx_api_logs_created_at ON public.api_usage_logs(created_at);
