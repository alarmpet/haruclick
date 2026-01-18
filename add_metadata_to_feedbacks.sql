-- feedbacks 테이블에 metadata 컬럼 추가 (없는 경우)
-- Supabase SQL Editor에서 실행하세요

-- 1. metadata 컬럼 추가 (JSON 형태로 OCR 컨텍스트 저장)
ALTER TABLE feedbacks 
ADD COLUMN IF NOT EXISTS metadata TEXT;

-- 2. 확인 쿼리
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'feedbacks';

-- 3. OCR 피드백만 조회하는 뷰 (선택사항)
CREATE OR REPLACE VIEW ocr_feedbacks AS
SELECT 
    id,
    user_id,
    content,
    metadata::jsonb as ocr_context,
    created_at
FROM feedbacks
WHERE type = 'ocr';
