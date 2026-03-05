-- ==========================================
-- 20260304_interest_subcategory_filters.sql
-- Description: 관심 이벤트 지역/유형 필터 및 유저 구독 필터 추가
-- ==========================================

-- 1. events 테이블 확장
ALTER TABLE events ADD COLUMN IF NOT EXISTS region text;
ALTER TABLE events ADD COLUMN IF NOT EXISTS detail_type text;

CREATE INDEX IF NOT EXISTS idx_events_region_interest 
ON events (region) WHERE region IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_events_detail_type_interest 
ON events (detail_type) WHERE detail_type IS NOT NULL;

-- 2. user_interest_subscriptions 테이블 확장
ALTER TABLE user_interest_subscriptions ADD COLUMN IF NOT EXISTS 
active_filters jsonb NOT NULL DEFAULT '{}'::jsonb;

-- 3. 기존 interest 이벤트 백필 (선택적, null 도 허용되지만 기본값 설정)
-- 기존 festival 로 수집된 항목들은 detail_type='festival' 지정
UPDATE events 
SET detail_type = 'festival' 
WHERE type = 'festival' AND detail_type IS NULL;
