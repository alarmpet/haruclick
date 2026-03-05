-- migrations/20260305_category_restructure_v2.sql
-- 카테고리 계층 구조 정리 스크립트
-- Supabase Dashboard > SQL Editor 에서 실행하세요.

DO $$
DECLARE
    movie_root_id UUID;
    movie_leaf_id UUID;
    pe_root_id UUID;
BEGIN
    -- ==========================================================
    -- 1. "영화 (개봉예정)" 단일 리프 노드로 단순화
    -- ==========================================================
    
    -- 1-1. 기존 '개봉 예정' 리프의 모든 정보를 먼저 확보하고 최상위로 올림
    SELECT id, parent_id INTO movie_leaf_id, movie_root_id
    FROM interest_categories 
    WHERE name = '개봉 예정';

    IF movie_leaf_id IS NOT NULL AND movie_root_id IS NOT NULL THEN
        -- 개봉 예정을 '영화 (개봉예정)'으로 바꾸고 parent_id를 풀어서 루트로 만듦
        UPDATE interest_categories
        SET name = '영화 (개봉예정)',
            parent_id = NULL,
            icon = '🎬',
            sort_order = 200 -- 최상단 정렬을 위해 덮어씀
        WHERE id = movie_leaf_id;
        
        -- 더 이상 필요 없는 기존 '영화' 껍데기 루트 제거
        DELETE FROM interest_categories WHERE id = movie_root_id;
    END IF;

    -- ==========================================================
    -- 2. "공연-전시" 아코디언 그룹화 및 하위 독립 분리
    -- ==========================================================

    -- 2-1. '공연-전시' 라는 새로운 빈 껍데기 루트 노드 생성
    INSERT INTO interest_categories (name, icon, is_leaf, sort_order, theme_color)
    VALUES ('공연-전시', '🎫', false, 10, '#8B5CF6')
    ON CONFLICT (name, parent_id) DO NOTHING
    RETURNING id INTO pe_root_id;

    IF pe_root_id IS NULL THEN
        SELECT id INTO pe_root_id FROM interest_categories WHERE name = '공연-전시' AND parent_id IS NULL LIMIT 1;
    END IF;

    -- 2-2. 기존 '공연 (연극/뮤지컬)' 캘린더를 분리
    -- 기존 '연극/뮤지컬'을 '연극'으로 이름 바꾸고 부모를 '공연-전시'로 지정
    UPDATE interest_categories
    SET name = '연극', parent_id = pe_root_id, sort_order = 11, icon = '🎭'
    WHERE name = '공연 (연극/뮤지컬)';

    -- 새로운 '뮤지컬' 리프 노드 생성 (부모: 공연-전시) => 캘린더는 나중에 연결해도 됨
    INSERT INTO interest_categories (name, parent_id, icon, is_leaf, sort_order)
    VALUES ('뮤지컬', pe_root_id, '🎤', true, 12)
    ON CONFLICT (name, parent_id) DO NOTHING;

    -- 2-3. 기존 '전시 (미술/박물관)' 캘린더를 분리
    -- 기존 '미술/박물관'을 '미술'로 이름 바꾸고 부모를 '공연-전시'로 지정
    UPDATE interest_categories
    SET name = '미술', parent_id = pe_root_id, sort_order = 13, icon = '🖼️'
    WHERE name = '전시 (미술/박물관)';

    -- 새로운 '박물관' 리프 노드 생성 (부모: 공연-전시) => 캘린더 나중에 연결 
    INSERT INTO interest_categories (name, parent_id, icon, is_leaf, sort_order)
    VALUES ('박물관', pe_root_id, '🏛️', true, 14)
    ON CONFLICT (name, parent_id) DO NOTHING;

    -- 참고: '지역 축제'는 건드리지 않았으므로 그대로 유지(독립 메뉴) 됨

END $$;

-- 결과 확인
SELECT name, parent_id, is_leaf, sort_order
FROM interest_categories
ORDER BY parent_id NULLS FIRST, sort_order ASC;
