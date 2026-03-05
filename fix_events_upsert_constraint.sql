-- ==========================================
-- fix_events_upsert_constraint.sql
-- Issue #14: 외부 API 연동 이벤트 UPSERT 버그 픽스
-- ==========================================

-- Supabase(PostgREST) UPSERT는 WHERE 절이 있는 부분 인덱스(Partial Index)를 
-- `onConflict` 기준으로 인식하지 못하여 에러를 발생시킵니다.
-- 따라서 기존의 부분 인덱스를 완전한 UNIQUE 제약조건으로 교체합니다.
-- PostgreSQL에서는 NULL 값이 서로 다르다고 취급되므로, 
-- external_resource_id가 NULL인 개인 일정들이 충돌하지 않아 안전합니다.

-- 1. 기존의 부분 인덱스 제거
DROP INDEX IF EXISTS idx_events_calendar_external_id;

-- 2. 기존 잘못된 제약조건이 있다면 안전하게 제거
ALTER TABLE public.events DROP CONSTRAINT IF EXISTS events_calendar_external_id_key;
ALTER TABLE public.events DROP CONSTRAINT IF EXISTS uq_calendar_external_resource;

-- 3. 완전한 UNIQUE 제약조건 추가
ALTER TABLE public.events
ADD CONSTRAINT events_calendar_external_id_key 
UNIQUE (calendar_id, external_resource_id);

-- 검증용 쿼리 (아래 쿼리 실행 결과에 새로 생성된 Constraint가 보여야 성공)
SELECT conname, pg_get_constraintdef(c.oid)
FROM pg_constraint c
JOIN pg_namespace n ON n.oid = c.connamespace
WHERE conrelid = 'public.events'::regclass
  AND contype = 'u';
