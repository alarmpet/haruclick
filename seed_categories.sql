-- 하루클릭 앱 [관심 캘린더 관리] 화면 첫 진입 시 표시될 기본 카테고리 데이터입니다.
-- Supabase Studio > SQL Editor 콘솔에서 새 쿼리를 열고 단 한 번 실행해 주시면 됩니다.
-- ※ 스포츠 카테고리는 seed_sports_categories.sql 에서 별도 관리됩니다.

INSERT INTO interest_categories (name, is_leaf, sort_order, icon, theme_color)
VALUES 
    ('공연 (연극/뮤지컬)', false, 1, '🎭', '#FF6B6B'),
    ('전시 (미술/박물관)', false, 2, '🖼️', '#4D96FF'),
    ('지역 축제', false, 3, '🎪', '#6BCB77'),
    ('팝업 스토어', false, 4, '🛍️', '#FFD93D')
    -- 스포츠 관련은 seed_sports_categories.sql 참조
ON CONFLICT DO NOTHING;

