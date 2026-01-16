-- OCR correction logs for user edits in scan results

CREATE TABLE IF NOT EXISTS ocr_corrections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID,
    user_id UUID REFERENCES auth.users(id),
    image_hash TEXT,
    source TEXT,
    item_index INT NOT NULL,
    was_selected BOOLEAN NOT NULL DEFAULT false,
    original_data JSONB,
    corrected_data JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ocr_corrections_session ON ocr_corrections(session_id);
CREATE INDEX IF NOT EXISTS idx_ocr_corrections_created ON ocr_corrections(created_at DESC);

ALTER TABLE ocr_corrections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read ocr corrections"
ON ocr_corrections FOR SELECT
TO authenticated
USING (user_id = auth.uid() OR user_id IS NULL);

CREATE POLICY "Users can insert ocr corrections"
ON ocr_corrections FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid() OR user_id IS NULL);

CREATE POLICY "Allow anonymous insert ocr corrections"
ON ocr_corrections FOR INSERT
TO anon
WITH CHECK (user_id IS NULL);
