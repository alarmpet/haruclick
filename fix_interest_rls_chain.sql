-- ==========================================
-- fix_interest_rls_chain.sql
-- RLS 체인 충돌 수정: interest 캘린더 공개 조회 정책 추가
-- Supabase Dashboard > SQL Editor 에서 실행
-- ==========================================

-- 인증된 유저가 interest 타입 캘린더를 조회할 수 있도록 허용
-- (기존 "Members or Owner can view calendars" 정책으로는 미가입 유저가 볼 수 없어서
--  셀프조인 INSERT 시 EXISTS 서브쿼리가 실패하는 순환 참조 문제 해결)
DROP POLICY IF EXISTS "Authenticated can view interest calendars" ON calendars;
CREATE POLICY "Authenticated can view interest calendars" ON calendars FOR SELECT
USING (
  calendar_type = 'interest' AND auth.role() = 'authenticated'
);

-- 확인용 쿼리: interest 캘린더 목록
SELECT id, name, calendar_type, owner_id FROM calendars WHERE calendar_type = 'interest';
