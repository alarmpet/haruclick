-- Migration: Add OCR Feedback Loop Tables
-- Date: 2026-01-18

-- 1. Table: ocr_user_edits
-- Tracks every meaningful modification made by the user to the OCR result.
CREATE TABLE IF NOT EXISTS ocr_user_edits (
    edit_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    session_id UUID NOT NULL, -- Links to ocr_pipeline_logs.session_id mainly, but loose coupling allows just UUID
    user_id UUID REFERENCES auth.users(id), -- Optional link to user
    image_hash TEXT,
    
    original_result JSONB, -- The AI's initial output
    edited_result JSONB,   -- The final JSON saved by the user
    edited_fields TEXT[],  -- Array of field names that were changed
    edit_type TEXT,        -- 'field_fix', 'type_change', 'add_missing'
    confirmation_level TEXT, -- 'quick_confirm', 'edited_confirm', 'manual_entry'
    
    confidence_before NUMERIC check (confidence_before >= 0 and confidence_before <= 1),
    confidence_after  NUMERIC check (confidence_after >= 0 and confidence_after <= 1),
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for analytics
CREATE INDEX IF NOT EXISTS idx_ocr_user_edits_session ON ocr_user_edits(session_id);
CREATE INDEX IF NOT EXISTS idx_ocr_user_edits_created ON ocr_user_edits(created_at);


-- 2. Table: approved_fewshots
-- Stores high-quality examples derived from user edits for dynamic prompt injection.
CREATE TABLE IF NOT EXISTS approved_fewshots (
    fewshot_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    
    doc_type TEXT NOT NULL, -- 'GIFTICON', 'STORE_PAYMENT', etc.
    subtype TEXT,           -- 'CARD_APPROVAL', 'COUPON', etc.
    
    input_text TEXT NOT NULL,  -- The raw OCR text (cleaned)
    output_json JSONB NOT NULL, -- The structure truth
    
    priority INTEGER DEFAULT 1,
    source TEXT DEFAULT 'user_verified', -- 'user_verified' or 'manual_curation'
    status TEXT CHECK (status IN ('pending', 'approved', 'rejected')) DEFAULT 'pending',
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_used_at TIMESTAMPTZ
);

-- Index for fast lookup during inference
CREATE INDEX IF NOT EXISTS idx_approved_fewshots_type ON approved_fewshots(doc_type, status);
CREATE INDEX IF NOT EXISTS idx_approved_fewshots_prio ON approved_fewshots(priority DESC, created_at DESC);


-- 3. RLS Policies (Basic)
ALTER TABLE ocr_user_edits ENABLE ROW LEVEL SECURITY;
ALTER TABLE approved_fewshots ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to insert their edits
CREATE POLICY "Users can insert their own edits" ON ocr_user_edits
    FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = user_id);

-- Allow admins (or service role) to read everything (simplified for now, adjust based on actual roles)
CREATE POLICY "Service role full access edits" ON ocr_user_edits
    FOR ALL TO service_role USING (true);

-- Approved Fewshots: Read-only for authenticated, write for service
CREATE POLICY "Everyone can read approved fewshots" ON approved_fewshots
    FOR SELECT TO authenticated
    USING (status = 'approved');

CREATE POLICY "Service role full access fewshots" ON approved_fewshots
    FOR ALL TO service_role USING (true);
