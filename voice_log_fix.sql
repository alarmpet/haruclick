-- Migration: Fix ocr_pipeline_logs stage constraint
-- Date: 2026-01-26
-- Description: Updates the CHECK constraint on 'stage' column to include 'voice_local' and 'voice_whisper'.

-- 1. Check existing constraints (for debugging)
-- SELECT conname, pg_get_constraintdef(c.oid) FROM pg_constraint c JOIN pg_class t ON c.conrelid = t.oid WHERE t.relname = 'ocr_pipeline_logs';

-- 2. Drop existing constraint (Warning: Name might vary, please check 'ocr_pipeline_logs_stage_check' or similar)
ALTER TABLE ocr_pipeline_logs DROP CONSTRAINT IF EXISTS ocr_pipeline_logs_stage_check;

-- 3. Add new flexible constraint
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

-- 4. (Alternative) If it is an ENUM type, use this instead:
-- ALTER TYPE ocr_stage_enum ADD VALUE IF NOT EXISTS 'voice_local';
-- ALTER TYPE ocr_stage_enum ADD VALUE IF NOT EXISTS 'voice_whisper';
