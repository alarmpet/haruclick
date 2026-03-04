-- Migration: Add TimeTree-Style Shared Calendar
-- Date: 2026-02-06
-- Description: Adds tables for calendars, members, invites, and comments. Updates events table. Backfills personal calendars.

-- ============================================================
-- 1. Missing Columns Check & Add (Safety Measure)
-- ============================================================
DO $$
BEGIN
    -- start_time
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='events' AND column_name='start_time') THEN
        ALTER TABLE public.events ADD COLUMN start_time TIME;
    END IF;
    -- end_time
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='events' AND column_name='end_time') THEN
        ALTER TABLE public.events ADD COLUMN end_time TIME;
    END IF;
    -- location
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='events' AND column_name='location') THEN
        ALTER TABLE public.events ADD COLUMN location TEXT;
    END IF;
END $$;

-- ============================================================
-- 2. New Tables Definition
-- ============================================================

-- 2.1 Calendars
CREATE TABLE IF NOT EXISTS public.calendars (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    color TEXT DEFAULT '#8B5CF6', -- Default Purple
    owner_id UUID REFERENCES auth.users(id) NOT NULL,
    is_personal BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure one personal calendar per owner
CREATE UNIQUE INDEX IF NOT EXISTS uniq_personal_calendar 
ON public.calendars (owner_id) 
WHERE is_personal = true;

-- 2.2 Calendar Members
CREATE TABLE IF NOT EXISTS public.calendar_members (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    calendar_id UUID REFERENCES public.calendars(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES auth.users(id) NOT NULL,
    role TEXT DEFAULT 'viewer' CHECK (role IN ('owner', 'editor', 'viewer')),
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(calendar_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_calendar_members_calendar_user 
ON public.calendar_members(calendar_id, user_id);

CREATE INDEX IF NOT EXISTS idx_calendar_members_user 
ON public.calendar_members(user_id);

-- 2.3 Calendar Invites
CREATE TABLE IF NOT EXISTS public.calendar_invites (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    calendar_id UUID REFERENCES public.calendars(id) ON DELETE CASCADE NOT NULL,
    created_by UUID REFERENCES auth.users(id),
    expires_at TIMESTAMPTZ,
    max_uses INTEGER DEFAULT NULL, -- NULL means unlimited
    current_uses INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2.4 Event Comments
CREATE TABLE IF NOT EXISTS public.event_comments (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    event_id UUID REFERENCES public.events(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES auth.users(id),
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 3. Update Events Table
-- ============================================================

ALTER TABLE public.events ADD COLUMN IF NOT EXISTS calendar_id UUID REFERENCES public.calendars(id) ON DELETE SET NULL;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id);

CREATE INDEX IF NOT EXISTS idx_events_calendar_date 
ON public.events(calendar_id, event_date);

-- ============================================================
-- 4. Data Backfill (Migration Logic)
-- ============================================================

-- 4.1 Create Personal Calendars for existing users
INSERT INTO public.calendars (owner_id, name, color, is_personal)
SELECT DISTINCT user_id, '내 캘린더', '#8B5CF6', TRUE
FROM public.events
WHERE user_id IS NOT NULL
ON CONFLICT (owner_id) WHERE is_personal = true DO NOTHING;

-- 4.2 Auto-join owners to their personal calendars
INSERT INTO public.calendar_members (calendar_id, user_id, role)
SELECT id, owner_id, 'owner'
FROM public.calendars
ON CONFLICT (calendar_id, user_id) DO NOTHING;

-- 4.3 Link events to Personal Calendars
-- Only update events that don't have a calendar_id yet
UPDATE public.events e
SET calendar_id = (
    SELECT id FROM public.calendars c
    WHERE c.owner_id = e.user_id AND c.is_personal = TRUE
    LIMIT 1
)
WHERE e.calendar_id IS NULL AND e.user_id IS NOT NULL;

-- 4.4 Set created_by
UPDATE public.events 
SET created_by = user_id 
WHERE created_by IS NULL;

-- ============================================================
-- 5. RLS Policies
-- ============================================================

ALTER TABLE public.calendars ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calendar_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calendar_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_comments ENABLE ROW LEVEL SECURITY;

-- 5.1 Calendars
-- Members can view their calendars
CREATE POLICY "Members can view calendars" ON public.calendars FOR SELECT
USING (
    id IN (SELECT calendar_id FROM public.calendar_members WHERE user_id = auth.uid())
);

-- Only Owner can update calendar (name, color)
CREATE POLICY "Owner can update calendar" ON public.calendars FOR UPDATE
USING (owner_id = auth.uid());

-- Owner can insert (handled by triggers or direct insert usually)
CREATE POLICY "Users can create calendars" ON public.calendars FOR INSERT
WITH CHECK (owner_id = auth.uid());

-- 5.2 Calendar Members
-- Users can view members of calendars they belong to
CREATE POLICY "Members can view other members" ON public.calendar_members FOR SELECT
USING (
    calendar_id IN (SELECT calendar_id FROM public.calendar_members WHERE user_id = auth.uid())
);

-- Only Owner/Editor can add members (Usually done via invite/RPC, but strictly for table access)
-- Note: Ideally, membership is managed via RPC to prevent privilege escalation.
-- For now, we allow reading explicitly. Modification restricted.

-- 5.3 Calendar Invites
-- Only creator or owner can view invites (Strict security)
CREATE POLICY "Owner/Creator can view invites" ON public.calendar_invites FOR SELECT
USING (
    created_by = auth.uid() OR
    calendar_id IN (SELECT id FROM public.calendars WHERE owner_id = auth.uid())
);

-- 5.4 Events (Updated RLS)
-- Drop old policies if strictly switching (Optional: keep for safety if transition is gradual)
-- DROP POLICY IF EXISTS "Users can view their own events" ON public.events;

-- New Policy: Members can view events in their calendars
CREATE POLICY "Calendar members can view events" ON public.events FOR SELECT
USING (
    calendar_id IN (SELECT calendar_id FROM public.calendar_members WHERE user_id = auth.uid())
    OR (calendar_id IS NULL AND user_id = auth.uid()) -- Legacy fallback
);

-- New Policy: Members can insert events (Check role + created_by)
CREATE POLICY "Calendar members can insert events" ON public.events FOR INSERT
WITH CHECK (
    (calendar_id IN (
        SELECT calendar_id FROM public.calendar_members 
        WHERE user_id = auth.uid() AND role IN ('owner', 'editor')
    ) AND created_by = auth.uid())
    OR (calendar_id IS NULL AND user_id = auth.uid() AND created_by = auth.uid()) -- Legacy
);

-- New Policy: Editors/Owners/Creator can update (with target calendar check)
CREATE POLICY "Members can update events" ON public.events FOR UPDATE
USING (
    (calendar_id IN (
        SELECT calendar_id FROM public.calendar_members 
        WHERE user_id = auth.uid() AND role IN ('owner', 'editor')
    ))
    OR created_by = auth.uid()
    OR (calendar_id IS NULL AND user_id = auth.uid())
)
WITH CHECK (
    calendar_id IN (
        SELECT calendar_id FROM public.calendar_members 
        WHERE user_id = auth.uid() AND role IN ('owner', 'editor')
    )
    OR (calendar_id IS NULL AND user_id = auth.uid())
);

-- New Policy: Editors/Owners/Creator can delete
CREATE POLICY "Members can delete events" ON public.events FOR DELETE
USING (
    (calendar_id IN (
        SELECT calendar_id FROM public.calendar_members 
        WHERE user_id = auth.uid() AND role IN ('owner', 'editor')
    ))
    OR created_by = auth.uid()
    OR (calendar_id IS NULL AND user_id = auth.uid())
);

-- 5.5 Event Comments
CREATE POLICY "Calendar members can view comments" ON public.event_comments FOR SELECT
USING (
    event_id IN (
        SELECT id FROM public.events 
        WHERE calendar_id IN (SELECT calendar_id FROM public.calendar_members WHERE user_id = auth.uid())
    )
);

CREATE POLICY "Calendar members can add comments" ON public.event_comments FOR INSERT
WITH CHECK (
    event_id IN (
        SELECT id FROM public.events 
        WHERE calendar_id IN (SELECT calendar_id FROM public.calendar_members WHERE user_id = auth.uid())
    )
);

-- ============================================================
-- 6. RPC Functions (Secure Logic)
-- ============================================================

-- Secure function to join calendar by code (FIXED: Only increment current_uses on actual insert)
CREATE OR REPLACE FUNCTION public.join_calendar_by_code(p_code TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_invite RECORD;
    v_user_id UUID;
    v_inserted BOOLEAN := FALSE;
BEGIN
    v_user_id := auth.uid();
    
    -- 1. Find valid invite
    SELECT * INTO v_invite
    FROM public.calendar_invites
    WHERE code = p_code;
    
    IF v_invite IS NULL THEN
        RAISE EXCEPTION 'Invalid invite code';
    END IF;
    
    -- 2. Check expiration
    IF v_invite.expires_at IS NOT NULL AND v_invite.expires_at < NOW() THEN
        RAISE EXCEPTION 'Invite code expired';
    END IF;
    
    -- 3. Check max uses
    IF v_invite.max_uses IS NOT NULL AND v_invite.current_uses >= v_invite.max_uses THEN
        RAISE EXCEPTION 'Invite code usage limit reached';
    END IF;
    
    -- 4. Check if already member
    IF EXISTS (
        SELECT 1 FROM public.calendar_members 
        WHERE calendar_id = v_invite.calendar_id AND user_id = v_user_id
    ) THEN
        RETURN TRUE; -- Already member, just return success without incrementing
    END IF;
    
    -- 5. Add Member
    INSERT INTO public.calendar_members (calendar_id, user_id, role)
    VALUES (v_invite.calendar_id, v_user_id, 'editor');
    
    -- 6. Update Usage Count (only if actually inserted)
    UPDATE public.calendar_invites
    SET current_uses = current_uses + 1
    WHERE id = v_invite.id;
    
    RETURN TRUE;
END;
$$;

-- ============================================================
-- 7. Additional RLS Policies (V2 Fix)
-- ============================================================

-- 7.1 calendar_members INSERT/DELETE

-- Owner/Editor can add members
DROP POLICY IF EXISTS "Owner/Editor can add members" ON public.calendar_members;
CREATE POLICY "Owner/Editor can add members" ON public.calendar_members FOR INSERT
WITH CHECK (
    calendar_id IN (
        SELECT cm.calendar_id FROM public.calendar_members cm
        WHERE cm.user_id = auth.uid() AND cm.role IN ('owner', 'editor')
    )
    OR EXISTS (SELECT 1 FROM public.calendars c WHERE c.id = calendar_id AND c.owner_id = auth.uid())
);

-- Members can leave (delete themselves)
DROP POLICY IF EXISTS "Members can leave" ON public.calendar_members;
CREATE POLICY "Members can leave" ON public.calendar_members FOR DELETE
USING (user_id = auth.uid());

-- Owner can remove others
DROP POLICY IF EXISTS "Owner can remove members" ON public.calendar_members;
CREATE POLICY "Owner can remove members" ON public.calendar_members FOR DELETE
USING (
    calendar_id IN (SELECT id FROM public.calendars WHERE owner_id = auth.uid())
);

-- 7.2 calendar_invites INSERT

DROP POLICY IF EXISTS "Owner can create invites" ON public.calendar_invites;
CREATE POLICY "Owner can create invites" ON public.calendar_invites FOR INSERT
WITH CHECK (
    calendar_id IN (SELECT id FROM public.calendars WHERE owner_id = auth.uid())
);

-- 7.3 calendars SELECT (fix: allow owner direct access)

DROP POLICY IF EXISTS "Members can view calendars" ON public.calendars;
CREATE POLICY "Members or Owner can view calendars" ON public.calendars FOR SELECT
USING (
    id IN (SELECT calendar_id FROM public.calendar_members WHERE user_id = auth.uid())
    OR owner_id = auth.uid()
);

