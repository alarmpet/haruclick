-- 대시보드 종합 통계용 Security Definer 함수
-- RLS를 우회하여 모든 사용자 및 로그 데이터를 집계

CREATE OR REPLACE FUNCTION get_dashboard_stats()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    result JSONB;
    v_total_users BIGINT;
    v_new_users BIGINT;
    v_dau BIGINT;
    v_mau BIGINT;
    
    -- OCR Stats
    v_ocr_total BIGINT;
    v_ocr_success BIGINT;
    v_today_scans BIGINT;
    
    -- Ledger Stats
    v_total_ledger BIGINT;
    v_total_events BIGINT;
    v_category_auto BIGINT;
    v_total_expense BIGINT;
    v_total_income BIGINT;
    
    -- Top Categories
    v_top_categories JSONB;
BEGIN
    -- 1. 사용자 통계
    SELECT count(*) INTO v_total_users FROM auth.users;
    SELECT count(*) INTO v_new_users FROM auth.users WHERE created_at >= CURRENT_DATE::timestamp;

    WITH active_today AS (
        SELECT user_id FROM events WHERE created_at >= CURRENT_DATE::timestamp
        UNION
        SELECT user_id FROM ledger WHERE created_at >= CURRENT_DATE::timestamp
    ),
    active_month AS (
        SELECT user_id FROM events WHERE created_at >= (CURRENT_DATE - INTERVAL '30 days')
        UNION
        SELECT user_id FROM ledger WHERE created_at >= (CURRENT_DATE - INTERVAL '30 days')
    )
    SELECT 
        (SELECT count(DISTINCT user_id) FROM active_today),
        (SELECT count(DISTINCT user_id) FROM active_month)
    INTO v_dau, v_mau;

    -- 2. OCR 통계 (ocr_pipeline_logs)
    -- 테이블이 존재하는지 확인 (없으면 0 처리)
    BEGIN
        SELECT count(*), count(*) FILTER (WHERE success = true), count(*) FILTER (WHERE created_at >= CURRENT_DATE::timestamp)
        INTO v_ocr_total, v_ocr_success, v_today_scans
        FROM ocr_pipeline_logs;
    EXCEPTION WHEN OTHERS THEN
        v_ocr_total := 0; v_ocr_success := 0; v_today_scans := 0;
    END;

    -- 3. 가계부/이벤트 통계
    SELECT count(*) INTO v_total_ledger FROM ledger;
    SELECT count(*) INTO v_total_events FROM events;
    SELECT count(*) INTO v_category_auto FROM ledger WHERE category IS NOT NULL AND category != '기타';

    -- 지출/수입 (최근 1000건 등으로 제한하거나 전체 집계)
    -- 성능을 위해 전체 집계는 주의 필요. 여기서는 간단히 전체 집계 시도 (인덱스 필요)
    SELECT 
        COALESCE(SUM(ABS(amount)) FILTER (WHERE category IN ('지출', '송금', '카드', '현금')), 0),
        COALESCE(SUM(ABS(amount)) FILTER (WHERE category IN ('수입', '입금')), 0)
    INTO v_total_expense, v_total_income
    FROM ledger;

    -- Top 5 카테고리
    SELECT json_agg(t) INTO v_top_categories
    FROM (
        SELECT category as name, count(*) as count
        FROM ledger
        WHERE category IS NOT NULL
        GROUP BY category
        ORDER BY count DESC
        LIMIT 5
    ) t;

    result := jsonb_build_object(
        'totalUsers', COALESCE(v_total_users, 0),
        'newUsersToday', COALESCE(v_new_users, 0),
        'dau', COALESCE(v_dau, 0),
        'mau', COALESCE(v_mau, 0),
        
        'ocrTotal', COALESCE(v_ocr_total, 0),
        'ocrSuccess', COALESCE(v_ocr_success, 0),
        'todayScans', COALESCE(v_today_scans, 0),
        
        'totalLedger', COALESCE(v_total_ledger, 0),
        'totalEvents', COALESCE(v_total_events, 0),
        'categoryAuto', COALESCE(v_category_auto, 0),
        'totalExpense', COALESCE(v_total_expense, 0),
        'totalIncome', COALESCE(v_total_income, 0),
        'topCategories', COALESCE(v_top_categories, '[]'::jsonb)
    );
    
    RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_dashboard_stats TO authenticated;
