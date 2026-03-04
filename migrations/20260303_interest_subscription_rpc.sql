-- ==========================================
-- 20260303_interest_subscription_rpc.sql
-- Issue #10: 구독/해지 RPC 원자성 전환 마이그레이션
-- Supabase Dashboard > SQL Editor 에서 실행
-- ==========================================

-- ============================================================
-- 1. 관심사 구독 RPC (subscribe)
-- category_id만 받아서 서버 측에서 매핑 검증 + 멤버 추가 + 구독 저장을 원자 처리
-- ============================================================

CREATE OR REPLACE FUNCTION public.subscribe_interest_category(p_category_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_calendar_id UUID;
BEGIN
  -- 1. 인증 확인
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'NOT_AUTHENTICATED');
  END IF;

  -- 2. 카테고리 → 캘린더 매핑 검증
  SELECT target_calendar_id INTO v_calendar_id
  FROM interest_categories
  WHERE id = p_category_id;

  IF v_calendar_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'CALENDAR_NOT_LINKED');
  END IF;

  -- 3. 캘린더 타입 검증 (interest 타입만 허용)
  IF NOT EXISTS (
    SELECT 1 FROM calendars WHERE id = v_calendar_id AND calendar_type = 'interest'
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_CALENDAR_TYPE');
  END IF;

  -- 4. 멤버 추가 (viewer) — 이미 멤버면 무시
  INSERT INTO calendar_members (calendar_id, user_id, role)
  VALUES (v_calendar_id, v_user_id, 'viewer')
  ON CONFLICT (calendar_id, user_id) DO NOTHING;

  -- 5. 구독 정보 저장
  INSERT INTO user_interest_subscriptions (user_id, category_id, calendar_id, notify_enabled)
  VALUES (v_user_id, p_category_id, v_calendar_id, true)
  ON CONFLICT (user_id, category_id) DO UPDATE SET notify_enabled = true;

  RETURN jsonb_build_object('success', true, 'calendar_id', v_calendar_id);
END;
$$;

COMMENT ON FUNCTION public.subscribe_interest_category IS
  'Interest 카테고리 구독: 멤버십+구독을 서버 트랜잭션으로 원자 처리 (SECURITY DEFINER)';


-- ============================================================
-- 2. 관심사 구독 해지 RPC (unsubscribe)
-- ============================================================

CREATE OR REPLACE FUNCTION public.unsubscribe_interest_category(p_category_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_calendar_id UUID;
BEGIN
  -- 1. 인증 확인
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'NOT_AUTHENTICATED');
  END IF;

  -- 2. 카테고리 → 캘린더 매핑 조회
  SELECT target_calendar_id INTO v_calendar_id
  FROM interest_categories
  WHERE id = p_category_id;

  IF v_calendar_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'CALENDAR_NOT_LINKED');
  END IF;

  -- 3. 구독 정보 삭제
  DELETE FROM user_interest_subscriptions
  WHERE user_id = v_user_id AND category_id = p_category_id;

  -- 4. 캘린더 멤버 탈퇴
  DELETE FROM calendar_members
  WHERE calendar_id = v_calendar_id AND user_id = v_user_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

COMMENT ON FUNCTION public.unsubscribe_interest_category IS
  'Interest 카테고리 구독 해지: 멤버십+구독 삭제를 서버 트랜잭션으로 원자 처리 (SECURITY DEFINER)';
