-- Add recurrence, alarm, and category columns to events table

-- 1. recurrence_rule: 반복 규칙 저장 (daily, weekly, monthly, yearly)
ALTER TABLE public.events 
ADD COLUMN IF NOT EXISTS recurrence_rule TEXT;

-- 2. group_id: 반복 일정 그룹핑을 위한 ID (UUID - text로 저장할 수도 있으나 형식을 맞춤)
-- Note: In supabase.ts we generate random string, usually not valid UUID format?
-- Math.random().toString(36)... is NOT a UUID. It's a string.
-- So verify column type. If using random string, type should be TEXT.
-- In supabase.ts: Math.random().toString(36).substring(2, 15) -> STRING.
-- So type MUST be TEXT, not UUID.
ALTER TABLE public.events 
ADD COLUMN IF NOT EXISTS group_id TEXT;

-- 3. alarm_minutes: 알림 설정 (분 단위, 예: 10, 60, 1440)
ALTER TABLE public.events 
ADD COLUMN IF NOT EXISTS alarm_minutes INTEGER;

-- 4. category: 일정 카테고리 (schedule, todo, ceremony)
ALTER TABLE public.events 
ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'ceremony';

-- (Optional) If you want indices for performance
CREATE INDEX IF NOT EXISTS idx_events_group_id ON public.events(group_id);
CREATE INDEX IF NOT EXISTS idx_events_category ON public.events(category);
