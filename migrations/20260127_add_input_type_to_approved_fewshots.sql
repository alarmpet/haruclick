-- Add input_type column to approved_fewshots table
-- This allows distinguishing between VOICE and OCR (text/image) fewshots

-- Add the input_type column (nullable for backward compatibility)
ALTER TABLE approved_fewshots 
ADD COLUMN IF NOT EXISTS input_type VARCHAR(20);

-- Add index for efficient filtering by input_type
CREATE INDEX IF NOT EXISTS idx_approved_fewshots_input_type 
ON approved_fewshots(input_type);

-- Add comment to clarify usage
COMMENT ON COLUMN approved_fewshots.input_type IS 
'Input source type: "VOICE" for voice/STT inputs, NULL for legacy OCR/text inputs';
