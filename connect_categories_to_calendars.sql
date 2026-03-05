-- ==========================================
-- connect_categories_to_calendars.sql
-- Issue #1 + #3 + #5 통합 패치 스크립트
-- Supabase Dashboard > SQL Editor 에서 단 한 번 실행
-- ==========================================

-- ============================================================
-- STEP 1: 각 관심사 카테고리별 공용 캘린더 생성 (calendars 테이블)
-- ============================================================

-- 시스템 관리자 역할의 가상 유저 ID (Supabase 프로젝트에서 자동 생성되지 않으므로
-- 실제 로그인한 유저 ID를 사용하거나, 아래처럼 임의 UUID를 관리 계정으로 지정)
-- ⚠️ 실제 본인의 user_id로 교체해주세요! (Supabase > Auth > Users 에서 확인)
DO $$
DECLARE
  admin_user_id UUID;
  cal_id UUID;
  cat RECORD;
BEGIN
  -- 현재 로그인한 첫 번째 유저를 관리자로 사용 (1인 프로젝트 기준)
  SELECT id INTO admin_user_id FROM auth.users ORDER BY created_at ASC LIMIT 1;
  
  IF admin_user_id IS NULL THEN
    RAISE EXCEPTION '등록된 사용자가 없습니다. 먼저 앱에 회원가입 후 실행하세요.';
  END IF;

  RAISE NOTICE '관리자 유저 ID: %', admin_user_id;

  -- interest_categories 에서 target_calendar_id가 NULL인 카테고리만 처리
  FOR cat IN 
    SELECT id, name, icon, theme_color 
    FROM interest_categories 
    WHERE target_calendar_id IS NULL
  LOOP
    -- 1-1. 공용 캘린더 생성
    INSERT INTO calendars (name, owner_id, color, calendar_type)
    VALUES (
      cat.name || ' 캘린더',
      admin_user_id,
      COALESCE(cat.theme_color, '#0F172A'),
      'interest'
    )
    RETURNING id INTO cal_id;

    -- 1-2. 관리자를 owner로 등록
    INSERT INTO calendar_members (calendar_id, user_id, role)
    VALUES (cal_id, admin_user_id, 'owner')
    ON CONFLICT (calendar_id, user_id) DO NOTHING;

    -- 1-3. 카테고리에 캘린더 ID 연결
    UPDATE interest_categories
    SET target_calendar_id = cal_id
    WHERE id = cat.id;

    RAISE NOTICE '✅ [%] → 캘린더 ID: %', cat.name, cal_id;
  END LOOP;
END $$;


-- ============================================================
-- STEP 2: is_leaf 플래그 보정 (Issue #3)
-- 하위 카테고리(children)가 없는 카테고리는 leaf로 간주
-- ============================================================

UPDATE interest_categories
SET is_leaf = true
WHERE id NOT IN (
  SELECT DISTINCT parent_id FROM interest_categories WHERE parent_id IS NOT NULL
);


-- ============================================================
-- STEP 3: calendar_members RLS 정책 추가 (Issue #5)
-- Interest 타입 캘린더에 한해 유저가 자기 자신을 viewer로 추가 가능하도록 허용
-- ============================================================

DROP POLICY IF EXISTS "Users can self-join interest calendars" ON calendar_members;
CREATE POLICY "Users can self-join interest calendars"
  ON calendar_members FOR INSERT WITH CHECK (
    auth.uid() = user_id
    AND role = 'viewer'
    AND EXISTS (
      SELECT 1 FROM calendars
      WHERE id = calendar_id AND calendar_type = 'interest'
    )
  );

-- Interest 캘린더에서 유저가 자기 자신만 탈퇴(DELETE)할 수 있도록 허용
DROP POLICY IF EXISTS "Users can leave interest calendars" ON calendar_members;
CREATE POLICY "Users can leave interest calendars"
  ON calendar_members FOR DELETE USING (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM calendars
      WHERE id = calendar_id AND calendar_type = 'interest'
    )
  );

-- ============================================================
-- 완료 확인 쿼리
-- ============================================================
SELECT ic.name, ic.is_leaf, ic.target_calendar_id, c.name as calendar_name
FROM interest_categories ic
LEFT JOIN calendars c ON c.id = ic.target_calendar_id
ORDER BY ic.sort_order;
