-- Migration: Add Category-Level Sharing Support
-- Date: 2026-02-08
-- Description: Adds shared_categories to calendar_members and calendar_invites for granular sharing control

-- ============================================================
-- 1. Add shared_categories to calendar_members
-- ============================================================

ALTER TABLE public.calendar_members
ADD COLUMN IF NOT EXISTS shared_categories TEXT[] 
DEFAULT ARRAY['ceremony', 'todo', 'schedule']::text[];

COMMENT ON COLUMN public.calendar_members.shared_categories IS 
'멤버가 볼 수 있는 카테고리 목록 (ceremony, todo, schedule, expense 등)';

-- Update existing members to have default categories
UPDATE public.calendar_members
SET shared_categories = ARRAY['ceremony', 'todo', 'schedule']::text[]
WHERE shared_categories IS NULL;

-- ============================================================
-- 2. Add shared_categories to calendar_invites
-- ============================================================

ALTER TABLE public.calendar_invites
ADD COLUMN IF NOT EXISTS shared_categories TEXT[] 
DEFAULT ARRAY['ceremony', 'todo', 'schedule']::text[];

COMMENT ON COLUMN public.calendar_invites.shared_categories IS 
'초대 시 선택한 공유 카테고리 (join 시 member에 복사됨)';

-- ============================================================
-- 3. Create SECURITY DEFINER Helper Function
-- ============================================================

CREATE OR REPLACE FUNCTION public.can_view_event_category(
    p_calendar_id UUID,
    p_category TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
BEGIN
    -- NULL calendar (personal) always allowed
    IF p_calendar_id IS NULL THEN
        RETURN TRUE;
    END IF;
    
    -- Check if user is member with permission for this category
    RETURN EXISTS (
        SELECT 1 FROM public.calendar_members
        WHERE calendar_id = p_calendar_id
        AND user_id = auth.uid()
        AND (
            shared_categories IS NULL  -- Full access (backward compatibility)
            OR p_category = ANY(shared_categories)  -- Category allowed
        )
    );
END;
$$;

-- ============================================================
-- 4. Update join_calendar_by_code RPC
-- ============================================================

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
    
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;
    
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
        RETURN TRUE; -- Already member, don't increment usage
    END IF;
    
    -- 5. Add Member with shared_categories from invite
    INSERT INTO public.calendar_members (calendar_id, user_id, role, shared_categories)
    VALUES (v_invite.calendar_id, v_user_id, 'editor', v_invite.shared_categories);
    
    v_inserted := TRUE;
    
    -- 6. Update Usage Count (only if actually inserted)
    IF v_inserted AND v_invite.max_uses IS NOT NULL THEN
        UPDATE public.calendar_invites
        SET current_uses = current_uses + 1
        WHERE id = v_invite.id;
    END IF;
    
    RETURN TRUE;
END;
$$;

-- ============================================================
-- 5. Update RLS Policies for Category Filtering
-- ============================================================

-- 5.1 Events SELECT Policy
DROP POLICY IF EXISTS "Calendar members can view events" ON public.events;
CREATE POLICY "Calendar members can view events" ON public.events FOR SELECT
USING (
    -- Personal calendar or creator
    (calendar_id IS NULL AND user_id = auth.uid())
    OR created_by = auth.uid()
    -- Shared calendar with category permission
    OR (
        calendar_id IN (SELECT public.get_my_calendar_ids())
        AND public.can_view_event_category(calendar_id, category)
    )
);

-- 5.2 Events INSERT Policy
DROP POLICY IF EXISTS "Calendar members can insert events" ON public.events;
CREATE POLICY "Calendar members can insert events" ON public.events FOR INSERT
WITH CHECK (
    -- Personal
    (calendar_id IS NULL AND user_id = auth.uid() AND created_by = auth.uid())
    -- Shared (editor/owner + allowed category)
    OR (
        calendar_id IN (SELECT public.get_my_editable_calendar_ids())
        AND created_by = auth.uid()
        AND public.can_view_event_category(calendar_id, category)
    )
);

-- 5.3 Events UPDATE Policy
DROP POLICY IF EXISTS "Members can update events" ON public.events;
CREATE POLICY "Members can update events" ON public.events FOR UPDATE
USING (
    (calendar_id IN (SELECT public.get_my_editable_calendar_ids()))
    OR created_by = auth.uid()
    OR (calendar_id IS NULL AND user_id = auth.uid())
)
WITH CHECK (
    -- Target calendar validation with category check
    (
        calendar_id IN (SELECT public.get_my_editable_calendar_ids())
        AND public.can_view_event_category(calendar_id, category)
    )
    OR (calendar_id IS NULL AND user_id = auth.uid())
);

-- 5.4 Event Comments SELECT Policy
DROP POLICY IF EXISTS "Calendar members can view comments" ON public.event_comments;
CREATE POLICY "Calendar members can view comments" ON public.event_comments FOR SELECT
USING (
    event_id IN (
        SELECT id FROM public.events 
        WHERE (
            calendar_id IN (SELECT public.get_my_calendar_ids())
            AND public.can_view_event_category(calendar_id, category)
        )
        OR created_by = auth.uid()
        OR (calendar_id IS NULL AND user_id = auth.uid())
    )
);

-- 5.5 Event Comments INSERT Policy
DROP POLICY IF EXISTS "Calendar members can add comments" ON public.event_comments;
CREATE POLICY "Calendar members can add comments" ON public.event_comments FOR INSERT
WITH CHECK (
    event_id IN (
        SELECT id FROM public.events 
        WHERE (
            calendar_id IN (SELECT public.get_my_calendar_ids())
            AND public.can_view_event_category(calendar_id, category)
        )
        OR created_by = auth.uid()
        OR (calendar_id IS NULL AND user_id = auth.uid())
    )
);
