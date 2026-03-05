-- ==========================================
-- fix_events_rls_interest.sql
-- interest 캘린더 이벤트를 구독 멤버가 조회할 수 있도록 RLS 정책 추가
-- Supabase Dashboard > SQL Editor 에서 실행
-- ==========================================

-- 1. 현재 events 테이블 RLS 정책 확인
SELECT policyname, cmd, qual
FROM pg_policies
WHERE tablename = 'events'
ORDER BY policyname;

-- ==========================================
-- 2. interest 캘린더 멤버가 이벤트를 읽을 수 있도록 정책 추가
-- (calendar_members에 viewer로 등록된 유저는 해당 캘린더 이벤트를 조회 가능)
-- ==========================================
DROP POLICY IF EXISTS "Members can read interest calendar events" ON events;

CREATE POLICY "Members can read interest calendar events"
ON events FOR SELECT
USING (
    calendar_id IN (
        SELECT cm.calendar_id
        FROM calendar_members cm
        JOIN calendars c ON c.id = cm.calendar_id
        WHERE cm.user_id = auth.uid()
          AND c.calendar_type = 'interest'
    )
);

-- 3. 수정 확인 — 구독한 캘린더 이벤트가 조회되는지 확인
-- (아래 SELECT는 본인 auth.uid()로 실행해야 함 — RLS 우회 없이 테스트)
SELECT e.name, e.event_date, e.calendar_id, c.name as cal_name
FROM events e
JOIN calendars c ON c.id = e.calendar_id
WHERE c.calendar_type = 'interest'
ORDER BY e.event_date
LIMIT 10;
