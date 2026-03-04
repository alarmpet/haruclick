-- ============================================================
-- Migration: 20260225_fix_security_warnings.sql
-- Description: 
-- 1. Drops public.users_view and creates getting admin users RPC.
-- 2. Modifies OCR analytics views to use security_invoker = on.
-- 3. Enables RLS on ocr_text_cache & ocr_cache.
-- 4. Creates an Admin RLS policy for ocr_pipeline_logs.
-- ============================================================

-- 1. `public.users_view` 삭제 및 RPC 생성
DROP VIEW IF EXISTS public.users_view;

CREATE OR REPLACE FUNCTION public.get_admin_users()
RETURNS TABLE (
    id UUID,
    email VARCHAR,
    created_at TIMESTAMPTZ,
    last_sign_in_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
    -- 보안 검증: 현재 요청자의 토큰(이메일)이 관리자인지 확인
    IF auth.jwt() ->> 'email' IN ('petblo12@gmail.com', 'admin@minsim.com') THEN
        RETURN QUERY
        SELECT
            au.id,
            au.email::VARCHAR,
            au.created_at,
            au.last_sign_in_at
        FROM auth.users au;
    ELSE
        -- 관리자가 아니면 빈 결과 반환 (또는 예외 발생)
        RETURN;
    END IF;
END;
$$;

-- Authenticated 사용자에게 실행 권한 부여
GRANT EXECUTE ON FUNCTION public.get_admin_users TO authenticated;


-- 2. 통계 뷰에 security_invoker 적용 (기존 뷰 DROP 후 CREATE)
DROP VIEW IF EXISTS public.ocr_pipeline_stats CASCADE;
CREATE OR REPLACE VIEW public.ocr_pipeline_stats WITH (security_invoker = on) AS
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

DROP VIEW IF EXISTS public.ocr_daily_stats CASCADE;
CREATE OR REPLACE VIEW public.ocr_daily_stats WITH (security_invoker = on) AS
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

DROP VIEW IF EXISTS public.view_ocr_failure_stats CASCADE;
CREATE OR REPLACE VIEW public.view_ocr_failure_stats WITH (security_invoker = on) AS
SELECT 
    stage,
    fallback_reason,
    COUNT(*) as fail_count,
    AVG(processing_time_ms) as avg_time
FROM ocr_pipeline_logs
WHERE success = false
GROUP BY stage, fallback_reason
ORDER BY fail_count DESC;

DROP VIEW IF EXISTS public.view_ocr_cost_daily CASCADE;
CREATE OR REPLACE VIEW public.view_ocr_cost_daily WITH (security_invoker = on) AS
SELECT 
    DATE(created_at) as log_date,
    SUM(cost_estimated_usd) as total_cost,
    COUNT(*) as total_requests
FROM ocr_pipeline_logs
GROUP BY DATE(created_at)
ORDER BY log_date DESC;

-- ocr_pipeline_logs 테이블에 관리자가 모든 로그를 볼 수 있는 정책(SELECT) 추가
-- 기존에는 Users can read own ocr logs와 Service role can read ocr logs만 존재함
DROP POLICY IF EXISTS "Admin can read all ocr logs" ON public.ocr_pipeline_logs;
CREATE POLICY "Admin can read all ocr logs"
ON public.ocr_pipeline_logs FOR SELECT TO authenticated
USING (auth.jwt() ->> 'email' IN ('petblo12@gmail.com', 'admin@minsim.com'));


-- 3. RLS가 비활성화된 테이블에 RLS 적용
ALTER TABLE public.ocr_text_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ocr_cache ENABLE ROW LEVEL SECURITY;

-- 혹시 프론트엔드에서 cache를 직접 읽어야 한다면 필요한 최소 권한 부여
-- 현재 구조를 보면 서버나 Edge Function에서 사용할 가능성이 높지만,
-- 혹시 사용자 클라이언트에서 읽을 수 있도록 읽기 권한 정책 추가 (전체 허용)
DROP POLICY IF EXISTS "Allow authenticated read on ocr_text_cache" ON public.ocr_text_cache;
CREATE POLICY "Allow authenticated read on ocr_text_cache"
ON public.ocr_text_cache FOR SELECT TO authenticated
USING (true);

DROP POLICY IF EXISTS "Allow authenticated read on ocr_cache" ON public.ocr_cache;
CREATE POLICY "Allow authenticated read on ocr_cache"
ON public.ocr_cache FOR SELECT TO authenticated
USING (true);
