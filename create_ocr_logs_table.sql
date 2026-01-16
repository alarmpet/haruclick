-- OCR 파이프라인 분석 로그 테이블
-- 각 OCR 단계별 성공/실패 및 폴백 이유를 수집

CREATE TABLE IF NOT EXISTS ocr_pipeline_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL,
    user_id UUID REFERENCES auth.users(id),
    
    -- 처리 단계 (4단계 파이프라인)
    stage TEXT NOT NULL CHECK (stage IN ('ml_kit', 'openai_text', 'google_vision', 'openai_vision')),
    stage_order INT NOT NULL, -- 1, 2, 3, 4
    
    -- 결과
    success BOOLEAN NOT NULL,
    fallback_reason TEXT, -- 다음 단계로 넘어간 이유
    
    -- 메타데이터
    text_length INT, -- 추출된 텍스트 길이
    result_type TEXT, -- INVITATION, GIFTICON, STORE_PAYMENT 등
    processing_time_ms INT, -- 처리 시간
    image_size_kb INT, -- 이미지 크기
    
    -- 추가 정보
    error_message TEXT, -- 에러 발생 시 메시지
    raw_metadata JSONB, -- 기타 추가 정보
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_ocr_logs_session ON ocr_pipeline_logs(session_id);
CREATE INDEX IF NOT EXISTS idx_ocr_logs_stage ON ocr_pipeline_logs(stage);
CREATE INDEX IF NOT EXISTS idx_ocr_logs_success ON ocr_pipeline_logs(success);
CREATE INDEX IF NOT EXISTS idx_ocr_logs_created ON ocr_pipeline_logs(created_at DESC);

-- RLS 정책
ALTER TABLE ocr_pipeline_logs ENABLE ROW LEVEL SECURITY;

-- 인증된 사용자는 모든 로그 조회 가능 (관리자 페이지에서 접근)
CREATE POLICY "Authenticated users can read ocr logs" 
ON ocr_pipeline_logs FOR SELECT 
TO authenticated 
USING (true);

-- 인증된 사용자는 자신의 로그 INSERT 가능
CREATE POLICY "Users can insert own ocr logs" 
ON ocr_pipeline_logs FOR INSERT 
TO authenticated 
WITH CHECK (user_id = auth.uid() OR user_id IS NULL);

-- 비인증 사용자도 INSERT 가능 (데모/테스트용)
CREATE POLICY "Allow anonymous insert" 
ON ocr_pipeline_logs FOR INSERT 
TO anon 
WITH CHECK (user_id IS NULL);

-- 통계 뷰 생성 (관리자 대시보드용)
CREATE OR REPLACE VIEW ocr_pipeline_stats AS
SELECT 
    stage,
    COUNT(*) as total_attempts,
    COUNT(*) FILTER (WHERE success = true) as success_count,
    ROUND(100.0 * COUNT(*) FILTER (WHERE success = true) / NULLIF(COUNT(*), 0), 2) as success_rate,
    ROUND(AVG(processing_time_ms), 0) as avg_processing_time_ms,
    ROUND(AVG(text_length), 0) as avg_text_length
FROM ocr_pipeline_logs
WHERE created_at > NOW() - INTERVAL '30 days'
GROUP BY stage
ORDER BY MIN(stage_order);

-- 일별 통계 뷰
CREATE OR REPLACE VIEW ocr_daily_stats AS
SELECT 
    DATE(created_at) as date,
    COUNT(*) as total_scans,
    COUNT(*) FILTER (WHERE stage = 'ml_kit' AND success = true) as ml_kit_success,
    COUNT(*) FILTER (WHERE stage = 'google_vision') as vision_fallbacks,
    COUNT(DISTINCT session_id) as unique_sessions
FROM ocr_pipeline_logs
WHERE created_at > NOW() - INTERVAL '30 days'
GROUP BY DATE(created_at)
ORDER BY date DESC;
