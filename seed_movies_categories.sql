-- seed_movies_categories.sql
-- 영화 개봉 예정 관심 채널 카테고리 추가
-- Supabase Dashboard > SQL Editor에서 실행하세요.

DO $$
DECLARE
    admin_user_id UUID;
    movie_id UUID;
    leaf_id UUID;
    new_cal_id UUID;
BEGIN
    -- 첫 번째 가입 유저를 관리자로 사용 (connect_categories_to_calendars.sql과 동일 방식)
    SELECT id INTO admin_user_id FROM auth.users ORDER BY created_at ASC LIMIT 1;

    IF admin_user_id IS NULL THEN
        RAISE EXCEPTION '등록된 사용자가 없습니다. 먼저 앱에 회원가입 후 실행하세요.';
    END IF;

    -- [1단계] 영화 루트 카테고리
    INSERT INTO interest_categories (name, icon, is_leaf, sort_order, theme_color)
    VALUES ('영화', '🎬', false, 200, '#E50914')
    ON CONFLICT (name, parent_id) DO NOTHING;

    SELECT id INTO movie_id
    FROM interest_categories
    WHERE name = '영화' AND parent_id IS NULL
    LIMIT 1;

    -- [2단계] 영화 > 개봉예정 leaf 채널
    INSERT INTO interest_categories (name, parent_id, icon, is_leaf, sort_order)
    VALUES ('개봉 예정', movie_id, '🎬', true, 201)
    ON CONFLICT (name, parent_id) DO NOTHING;

    SELECT id INTO leaf_id
    FROM interest_categories
    WHERE name = '개봉 예정' AND parent_id = movie_id
    LIMIT 1;

    -- [3단계] target_calendar_id가 없으면 캘린더 생성 + 연결
    IF EXISTS (
        SELECT 1 FROM interest_categories
        WHERE id = leaf_id AND target_calendar_id IS NULL
    ) THEN
        -- connect_categories_to_calendars.sql과 동일한 calendars 컬럼 구조 사용
        INSERT INTO calendars (name, owner_id, color, calendar_type)
        VALUES ('🎬 개봉 예정 영화', admin_user_id, '#E50914', 'interest')
        RETURNING id INTO new_cal_id;

        -- 관리자를 owner로 등록
        INSERT INTO calendar_members (calendar_id, user_id, role)
        VALUES (new_cal_id, admin_user_id, 'owner')
        ON CONFLICT (calendar_id, user_id) DO NOTHING;

        -- 카테고리에 캘린더 ID 연결
        UPDATE interest_categories
        SET target_calendar_id = new_cal_id
        WHERE id = leaf_id;

        RAISE NOTICE '✅ 영화 개봉 예정 캘린더 생성 완료: %', new_cal_id;
    ELSE
        RAISE NOTICE '이미 캘린더가 연결되어 있습니다.';
    END IF;
END $$;

-- 결과 확인
SELECT ic.name, ic.is_leaf, ic.sort_order, ic.target_calendar_id, c.name AS calendar_name
FROM interest_categories ic
LEFT JOIN calendars c ON c.id = ic.target_calendar_id
WHERE ic.name IN ('영화', '개봉 예정')
ORDER BY ic.sort_order;
