-- Migration: Update OCR Schema (2026-01-18)
-- Description: Adds detailed logging columns, standardized fallback reasons, and advanced caching logic.

-- 1. Update ocr_pipeline_logs Table
ALTER TABLE ocr_pipeline_logs ADD COLUMN IF NOT EXISTS image_hash TEXT;
ALTER TABLE ocr_pipeline_logs ADD COLUMN IF NOT EXISTS doc_type_predicted TEXT; -- GIFTICON, etc.
ALTER TABLE ocr_pipeline_logs ADD COLUMN IF NOT EXISTS confidence FLOAT;
ALTER TABLE ocr_pipeline_logs ADD COLUMN IF NOT EXISTS processing_time_ms INT;
ALTER TABLE ocr_pipeline_logs ADD COLUMN IF NOT EXISTS retry_count INT DEFAULT 0;
ALTER TABLE ocr_pipeline_logs ADD COLUMN IF NOT EXISTS cost_estimated_usd FLOAT DEFAULT 0;
ALTER TABLE ocr_pipeline_logs ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::JSONB;
ALTER TABLE ocr_pipeline_logs ADD COLUMN IF NOT EXISTS fallback_reason TEXT; 
-- Note: fallback_reason already exists in some versions, IF NOT EXISTS handles it.

-- Create Indexes for Logs
CREATE INDEX IF NOT EXISTS idx_ocr_logs_session_id ON ocr_pipeline_logs(session_id);
CREATE INDEX IF NOT EXISTS idx_ocr_logs_stage_success ON ocr_pipeline_logs(stage, success);
CREATE INDEX IF NOT EXISTS idx_ocr_logs_doc_type ON ocr_pipeline_logs(doc_type_predicted);
CREATE INDEX IF NOT EXISTS idx_ocr_logs_fallback ON ocr_pipeline_logs(fallback_reason);
CREATE INDEX IF NOT EXISTS idx_ocr_logs_created_at ON ocr_pipeline_logs(created_at);


-- 2. Update ocr_cache Table
-- Re-creating or altering table to match new robust structure. 
-- Assuming existing simple KV structure, we add columns.

ALTER TABLE ocr_cache ADD COLUMN IF NOT EXISTS image_hash TEXT;
-- If image_hash represents the key, ensure standard naming.
-- If existing PK is 'key' or similar, we might need a migration strategy. 
-- For now, adding columns directly.

ALTER TABLE ocr_cache ADD COLUMN IF NOT EXISTS doc_type TEXT;
ALTER TABLE ocr_cache ADD COLUMN IF NOT EXISTS confidence FLOAT;
ALTER TABLE ocr_cache ADD COLUMN IF NOT EXISTS source TEXT; -- SCREENSHOT / PHOTO
ALTER TABLE ocr_cache ADD COLUMN IF NOT EXISTS pipeline_version TEXT;
ALTER TABLE ocr_cache ADD COLUMN IF NOT EXISTS cost_total_usd FLOAT DEFAULT 0;
ALTER TABLE ocr_cache ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE ocr_cache ADD COLUMN IF NOT EXISTS last_accessed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Create Indexes for Cache
CREATE INDEX IF NOT EXISTS idx_ocr_cache_hash ON ocr_cache(image_hash);
CREATE INDEX IF NOT EXISTS idx_ocr_cache_confidence ON ocr_cache(confidence);
CREATE INDEX IF NOT EXISTS idx_ocr_cache_expires_at ON ocr_cache(expires_at);

-- 3. Views for Analytics (Optional but recommended)
CREATE OR REPLACE VIEW view_ocr_failure_stats AS
SELECT 
    stage,
    fallback_reason,
    COUNT(*) as fail_count,
    AVG(processing_time_ms) as avg_time
FROM ocr_pipeline_logs
WHERE success = false
GROUP BY stage, fallback_reason
ORDER BY fail_count DESC;

CREATE OR REPLACE VIEW view_ocr_cost_daily AS
SELECT 
    DATE(created_at) as log_date,
    SUM(cost_estimated_usd) as total_cost,
    COUNT(*) as total_requests
FROM ocr_pipeline_logs
GROUP BY DATE(created_at)
ORDER BY log_date DESC;
