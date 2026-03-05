-- ==========================================
-- fix_all_interest_issues.sql
-- 관심 채널 전체 문제 종합 수정
-- Supabase Dashboard > SQL Editor에서 실행
-- ==========================================

-- ===================================================
-- STEP 1: 진단 (먼저 실행해서 현황 파악)
-- ===================================================
SELECT
    c.id         AS calendar_id,
    c.name       AS calendar_name,
    c.calendar_type,                     -- 이게 'interest'여야 함!
    ic.name      AS category_name,
    ic.target_calendar_id,
    COUNT(e.id)  AS event_count
FROM interest_categories ic
LEFT JOIN calendars c ON c.id = ic.target_calendar_id
LEFT JOIN events e ON e.calendar_id = c.id
WHERE ic.is_leaf = true
GROUP BY c.id, c.name, c.calendar_type, ic.name, ic.target_calendar_id
ORDER BY ic.name;

-- ===================================================
-- STEP 2: calendar_type을 'interest'로 수정 (핵심!)
-- 이것이 없으면 구독 버튼이 눌러도 실제로 등록이 안 됨
-- ===================================================
UPDATE calendars
SET calendar_type = 'interest'
WHERE id IN (
    SELECT DISTINCT target_calendar_id
    FROM interest_categories
    WHERE target_calendar_id IS NOT NULL
);

-- ===================================================
-- STEP 3: 20260304_community_posts.sql 마이그레이션 확인
-- channel_posts 테이블이 없으면 아래 쿼리가 에러남
-- (에러 시 migrations/20260304_community_posts.sql을 먼저 실행)
-- ===================================================
SELECT COUNT(*) as channel_posts_count FROM channel_posts;

-- ===================================================
-- STEP 4: 이벤트 데이터 확인 (스크래핑 결과 확인)
-- ===================================================
SELECT
    c.name AS calendar_name,
    COUNT(e.id) AS event_count
FROM calendars c
JOIN interest_categories ic ON ic.target_calendar_id = c.id
LEFT JOIN events e ON e.calendar_id = c.id
WHERE ic.is_leaf = true
GROUP BY c.name
ORDER BY event_count DESC;

-- ===================================================
-- STEP 5: RLS 이벤트 조회 정책 확인 (events 테이블)
-- interest 캘린더의 이벤트는 calendar_members에 있어야 보임
-- ===================================================
SELECT schemaname, tablename, policyname, cmd, qual
FROM pg_policies
WHERE tablename = 'events'
ORDER BY policyname;
