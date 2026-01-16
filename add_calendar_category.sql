-- ============================================================
-- 캘린더 카테고리 필드 추가
-- Supabase SQL Editor에서 실행하세요.
-- ============================================================

-- events 테이블에 category 필드 추가
-- 기존 데이터는 'ceremony' (경조사)로 설정
ALTER TABLE public.events 
ADD COLUMN IF NOT EXISTS category text DEFAULT 'ceremony';

-- 기존 데이터 업데이트 (경조사로 설정)
UPDATE public.events 
SET category = 'ceremony' 
WHERE category IS NULL;

-- 카테고리 설명:
-- 'ceremony' = 경조사 (결혼식, 장례식, 돌잔치 등)
-- 'todo' = 할일 (체크리스트)
-- 'schedule' = 일정 (약속, 미팅 등)

-- 할일 완료 여부 필드 추가 (todo 카테고리용)
ALTER TABLE public.events 
ADD COLUMN IF NOT EXISTS is_completed boolean DEFAULT false;

-- 시간 필드 추가 (schedule 카테고리용)
ALTER TABLE public.events 
ADD COLUMN IF NOT EXISTS start_time time;

ALTER TABLE public.events 
ADD COLUMN IF NOT EXISTS end_time time;

-- 장소 필드 추가
ALTER TABLE public.events 
ADD COLUMN IF NOT EXISTS location text;
