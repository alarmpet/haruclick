-- ==========================================
-- fix_interest_calendar_type.sql
-- 관심 채널 캘린더가 캘린더 뷰에서 안 보이는 문제 수정
-- ==========================================

-- 1. 현재 상태 진단 (먼저 실행해서 문제 확인)
SELECT
    c.id,
    c.name,
    c.calendar_type,          -- 이게 'interest'이어야 구독이 작동함
    c.owner_id,
    ic.name AS category_name,
    COUNT(e.id) AS event_count
FROM calendars c
JOIN interest_categories ic ON ic.target_calendar_id = c.id
LEFT JOIN events e ON e.calendar_id = c.id
GROUP BY c.id, c.name, c.calendar_type, c.owner_id, ic.name
ORDER BY ic.name;

-- ==========================================
-- 위 쿼리에서 calendar_type이 'interest'가 아닌 것들이 있으면
-- 아래 쿼리를 실행해서 수정하세요
-- ==========================================

-- 2. 관심 카테고리에 연결된 캘린더를 모두 'interest' 타입으로 변경
UPDATE calendars
SET calendar_type = 'interest'
WHERE id IN (
    SELECT DISTINCT target_calendar_id
    FROM interest_categories
    WHERE target_calendar_id IS NOT NULL
);

-- 3. 수정 확인
SELECT
    c.name AS calendar_name,
    c.calendar_type,
    ic.name AS category_name,
    COUNT(e.id) AS total_events
FROM calendars c
JOIN interest_categories ic ON ic.target_calendar_id = c.id
LEFT JOIN events e ON e.calendar_id = c.id
GROUP BY c.name, c.calendar_type, ic.name
ORDER BY ic.name;
