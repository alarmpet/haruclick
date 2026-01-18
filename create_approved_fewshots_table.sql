-- approved_fewshots 테이블 생성
-- 검수 완료된 Few-Shot 예제를 저장하여 동적으로 프롬프트에 주입

CREATE TABLE IF NOT EXISTS approved_fewshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    feedback_id UUID REFERENCES feedbacks(id) ON DELETE SET NULL,
    input_text TEXT NOT NULL,  -- 마스킹된 입력 텍스트
    output_json JSONB NOT NULL, -- 정답 데이터 (마스킹됨)
    document_type VARCHAR(50), -- STORE_PAYMENT, BANK_TRANSFER, INVITATION 등
    priority INTEGER DEFAULT 0, -- 높을수록 우선 선택
    is_active BOOLEAN DEFAULT true,
    approved_by TEXT, -- 승인한 관리자
    approved_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_approved_fewshots_type ON approved_fewshots(document_type);
CREATE INDEX IF NOT EXISTS idx_approved_fewshots_active ON approved_fewshots(is_active);
CREATE INDEX IF NOT EXISTS idx_approved_fewshots_priority ON approved_fewshots(priority DESC);

-- RLS
ALTER TABLE approved_fewshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read fewshots" ON approved_fewshots
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated can insert fewshots" ON approved_fewshots
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated can update fewshots" ON approved_fewshots
    FOR UPDATE USING (auth.role() = 'authenticated');

-- 활성화된 Few-Shot을 타입별로 가져오는 함수
CREATE OR REPLACE FUNCTION get_active_fewshots(max_count INTEGER DEFAULT 20)
RETURNS TABLE (
    input_text TEXT,
    output_json JSONB,
    document_type VARCHAR
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        af.input_text,
        af.output_json,
        af.document_type
    FROM approved_fewshots af
    WHERE af.is_active = true
    ORDER BY af.priority DESC, af.approved_at DESC
    LIMIT max_count;
END;
$$ LANGUAGE plpgsql;
