-- ocr_corrections 테이블 생성 (없는 경우)
-- Supabase SQL Editor에서 실행하세요

CREATE TABLE IF NOT EXISTS ocr_corrections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id TEXT,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    image_hash TEXT,
    source TEXT DEFAULT 'scan_result',
    item_index INTEGER DEFAULT 0,
    was_selected BOOLEAN DEFAULT true,
    original_data JSONB,
    corrected_data JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_ocr_corrections_user_id ON ocr_corrections(user_id);
CREATE INDEX IF NOT EXISTS idx_ocr_corrections_created_at ON ocr_corrections(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ocr_corrections_session ON ocr_corrections(session_id);

-- RLS
ALTER TABLE ocr_corrections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert corrections" ON ocr_corrections
    FOR INSERT WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

CREATE POLICY "Authenticated can read all corrections" ON ocr_corrections
    FOR SELECT USING (auth.role() = 'authenticated');

-- 필드별 수정 빈도 분석 뷰
CREATE OR REPLACE VIEW ocr_field_correction_stats AS
SELECT 
    key as field_name,
    COUNT(*) as correction_count,
    COUNT(DISTINCT session_id) as unique_sessions
FROM ocr_corrections,
    jsonb_each(corrected_data) 
WHERE original_data IS NOT NULL 
  AND original_data->>key IS DISTINCT FROM corrected_data->>key
GROUP BY key
ORDER BY correction_count DESC;
