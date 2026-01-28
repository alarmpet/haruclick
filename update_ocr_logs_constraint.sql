-- OCR Pipeline Logs 제약 조건 업데이트
-- 새로운 stage 값 (openai_text, openai_vision) 지원

-- 기존 제약 조건 삭제
ALTER TABLE ocr_pipeline_logs 
DROP CONSTRAINT IF EXISTS ocr_pipeline_logs_stage_check;

-- 새 제약 조건 추가 (음성 포함)
ALTER TABLE ocr_pipeline_logs 
ADD CONSTRAINT ocr_pipeline_logs_stage_check 
CHECK (stage IN (
  'ml_kit',
  'openai_text',
  'google_vision',
  'openai_vision',
  'voice_local',
  'voice_whisper',
  'voice_confirm'
));
