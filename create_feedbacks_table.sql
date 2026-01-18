-- feedbacks 테이블 생성 (처음 생성하는 경우)
-- Supabase SQL Editor에서 실행하세요

-- 1. feedbacks 테이블 생성
CREATE TABLE IF NOT EXISTS feedbacks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL DEFAULT 'other', -- 'bug', 'feature', 'ocr', 'other'
    content TEXT NOT NULL,
    metadata TEXT, -- OCR 컨텍스트 (JSON 형태)
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_feedbacks_user_id ON feedbacks(user_id);
CREATE INDEX IF NOT EXISTS idx_feedbacks_type ON feedbacks(type);
CREATE INDEX IF NOT EXISTS idx_feedbacks_created_at ON feedbacks(created_at DESC);

-- 3. RLS (Row Level Security) 활성화
ALTER TABLE feedbacks ENABLE ROW LEVEL SECURITY;

-- 4. RLS 정책: 사용자는 자신의 피드백만 생성 가능
CREATE POLICY "Users can insert own feedback" ON feedbacks
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- 5. RLS 정책: 관리자는 모든 피드백 조회 가능 (anon은 불가)
CREATE POLICY "Authenticated users can read all feedback" ON feedbacks
    FOR SELECT USING (auth.role() = 'authenticated');

-- 6. 확인 쿼리
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'feedbacks';
