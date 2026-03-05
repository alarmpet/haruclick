-- ============================================================
-- Migration: 정부지원 카테고리 (중앙부처 / 지자체)
-- Date: 2026-03-05
-- Why: 관심 탭에서 정부지원 정책 일정을 중앙부처와 지자체로
--      분류하여 구독 또는 선택 스크랩 기능을 지원하기 위함
-- ============================================================

DO $$
DECLARE
    admin_user_id UUID;
    gov_root_id   UUID;
    national_cal_id UUID;
    local_cal_id  UUID;
    national_cat_id UUID;
    local_cat_id  UUID;
BEGIN
    -- 1. 관리자 계정 조회
    SELECT id INTO admin_user_id FROM auth.users ORDER BY created_at ASC LIMIT 1;
    IF admin_user_id IS NULL THEN
        RAISE EXCEPTION 'No admin user found. Please create a user first.';
    END IF;

    -- 2. 루트 카테고리: 정부지원
    SELECT id INTO gov_root_id FROM interest_categories WHERE name = '🏛️ 정부지원' LIMIT 1;
    IF gov_root_id IS NULL THEN
        INSERT INTO interest_categories (name, parent_id, icon, theme_color, is_leaf, sort_order)
        VALUES ('🏛️ 정부지원', NULL, '🏛️', '#10B981', false, 50)
        RETURNING id INTO gov_root_id;
    END IF;

    -- 3-1. 공용 캘린더 생성 (중앙부처)
    SELECT id INTO national_cal_id FROM calendars WHERE name = '📋 정부지원 (중앙부처)' AND owner_id = admin_user_id LIMIT 1;
    IF national_cal_id IS NULL THEN
        INSERT INTO calendars (name, owner_id, color, calendar_type)
        VALUES ('📋 정부지원 (중앙부처)', admin_user_id, '#3B82F6', 'interest')
        RETURNING id INTO national_cal_id;
    END IF;

    -- 3-2. 공용 캘린더 생성 (지자체)
    SELECT id INTO local_cal_id FROM calendars WHERE name = '📋 정부지원 (지자체)' AND owner_id = admin_user_id LIMIT 1;
    IF local_cal_id IS NULL THEN
        INSERT INTO calendars (name, owner_id, color, calendar_type)
        VALUES ('📋 정부지원 (지자체)', admin_user_id, '#8B5CF6', 'interest')
        RETURNING id INTO local_cal_id;
    END IF;

    -- 4. 리프 카테고리: 중앙부처
    SELECT id INTO national_cat_id FROM interest_categories WHERE name = '🇰🇷 중앙부처' AND parent_id = gov_root_id LIMIT 1;
    IF national_cat_id IS NULL THEN
        INSERT INTO interest_categories (name, parent_id, target_calendar_id, icon, theme_color, is_leaf, sort_order)
        VALUES ('🇰🇷 중앙부처', gov_root_id, national_cal_id, '🇰🇷', '#3B82F6', true, 51)
        RETURNING id INTO national_cat_id;
    ELSE
        UPDATE interest_categories SET target_calendar_id = national_cal_id WHERE id = national_cat_id;
    END IF;

    -- 5. 리프 카테고리: 지자체
    SELECT id INTO local_cat_id FROM interest_categories WHERE name = '🏙️ 지자체' AND parent_id = gov_root_id LIMIT 1;
    IF local_cat_id IS NULL THEN
        INSERT INTO interest_categories (name, parent_id, target_calendar_id, icon, theme_color, is_leaf, sort_order)
        VALUES ('🏙️ 지자체', gov_root_id, local_cal_id, '🏙️', '#8B5CF6', true, 52)
        RETURNING id INTO local_cat_id;
    ELSE
        UPDATE interest_categories SET target_calendar_id = local_cal_id WHERE id = local_cat_id;
    END IF;

    RAISE NOTICE 'Done: gov_root=%, national=%, local=%', gov_root_id, national_cat_id, local_cat_id;
END $$;
