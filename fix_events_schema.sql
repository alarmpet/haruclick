-- Fix events table schema for Invitation saving
-- Add missing columns that are used in supabase.ts

-- 1. recurrence_rule: 반복 규칙
ALTER TABLE public.events 
ADD COLUMN IF NOT EXISTS recurrence_rule TEXT;

-- 2. group_id: 반복 일정 그룹핑 ID
ALTER TABLE public.events 
ADD COLUMN IF NOT EXISTS group_id TEXT;

-- 3. alarm_minutes: 알림 설정
ALTER TABLE public.events 
ADD COLUMN IF NOT EXISTS alarm_minutes INTEGER;

-- 4. is_all_day: 하루 종일 일정 여부
ALTER TABLE public.events 
ADD COLUMN IF NOT EXISTS is_all_day BOOLEAN DEFAULT FALSE;

-- 5. image_url: 이미지 URL (청첩장 이미지 등)
ALTER TABLE public.events 
ADD COLUMN IF NOT EXISTS image_url TEXT;

-- 6. category: 카테고리 (혹시 누락되었을 경우)
ALTER TABLE public.events 
ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'ceremony';
