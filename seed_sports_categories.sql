-- ==========================================
-- seed_sports_categories.sql
-- SPORTS_DATA_INTEGRATION_PLAN (Phase 1-9) 카테고리 시딩
-- Supabase Dashboard > SQL Editor 에서 실행하세요.
-- 실행 후 connect_categories_to_calendars.sql 을 실행하면 캘린더가 매핑됩니다.
-- ==========================================

INSERT INTO interest_categories (name, icon, is_leaf, sort_order) 
VALUES ('스포츠', '⚽', false, 100) ON CONFLICT DO NOTHING;

DO $$
DECLARE
  sports_id UUID;
BEGIN
  SELECT id INTO sports_id FROM interest_categories WHERE name = '스포츠' LIMIT 1;
  
  INSERT INTO interest_categories (name, parent_id, icon, is_leaf, sort_order) 
  VALUES 
    ('KBO (프로야구)', sports_id, '⚾', true, 101),
    ('EPL (프리미어리그)', sports_id, '⚽', true, 102),
    ('K리그', sports_id, '⚽', true, 103),
    ('라리가', sports_id, '⚽', true, 104),
    ('분데스리가', sports_id, '⚽', true, 105),
    ('MLB (메이저리그)', sports_id, '⚾', true, 106),
    ('NBA (프로농구)', sports_id, '🏀', true, 107),
    ('FIFA 월드컵 2026', sports_id, '🏆', true, 108),
    ('LA 올림픽 2028', sports_id, '🥇', true, 109)
  ON CONFLICT DO NOTHING;
END $$;
