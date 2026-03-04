-- ==========================================
-- 20260302_v6_interest_app.sql
-- Description: 관심 캘린더(Interest Calendar) v6 핵심 테이블 및 컬럼 마이그레이션
-- ==========================================

-- 1. calendars 테이블 컬럼 확장
ALTER TABLE calendars ADD COLUMN IF NOT EXISTS
    calendar_type text NOT NULL DEFAULT 'personal'
    CHECK (calendar_type IN ('personal', 'shared', 'interest'));

-- 2. events 테이블 컬럼 및 복합 인덱스 확장
ALTER TABLE events ADD COLUMN IF NOT EXISTS
    external_resource_id text;

CREATE UNIQUE INDEX IF NOT EXISTS
    idx_events_calendar_external_id
    ON events (calendar_id, external_resource_id)
    WHERE external_resource_id IS NOT NULL;

-- 3. interest_categories 테이블 생성
CREATE TABLE IF NOT EXISTS interest_categories (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    name text NOT NULL,
    parent_id uuid REFERENCES interest_categories(id),
    target_calendar_id uuid REFERENCES calendars(id),
    icon text,
    theme_color varchar(20),
    is_leaf boolean DEFAULT false,
    sort_order int DEFAULT 0,
    created_at timestamptz DEFAULT now()
);
ALTER TABLE interest_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read categories"
    ON interest_categories FOR SELECT
    USING (auth.role() = 'authenticated');

-- 4. user_interest_subscriptions 테이블 생성
CREATE TABLE IF NOT EXISTS user_interest_subscriptions (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    category_id uuid REFERENCES interest_categories(id) ON DELETE CASCADE NOT NULL,
    calendar_id uuid REFERENCES calendars(id) NOT NULL,
    notify_enabled boolean DEFAULT true,
    created_at timestamptz DEFAULT now(),
    UNIQUE(user_id, category_id)
);
ALTER TABLE user_interest_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own subscriptions"
    ON user_interest_subscriptions FOR ALL
    USING (auth.uid() = user_id);

-- 5. event_comments (일정 기반 댓글) 테이블 생성
CREATE TABLE IF NOT EXISTS event_comments (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    event_id uuid REFERENCES events(id) ON DELETE CASCADE NOT NULL,
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    content text NOT NULL,
    image_url text,
    created_at timestamptz DEFAULT now()
);
ALTER TABLE event_comments ENABLE ROW LEVEL SECURITY;

-- READ: 해당 이벤트의 캘린더에 소속된 멤버만
CREATE POLICY "Calendar members can read comments" ON event_comments
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM events e
            JOIN calendar_members cm ON cm.calendar_id = e.calendar_id
            WHERE e.id = event_comments.event_id
            AND cm.user_id = auth.uid()
        )
    );
-- INSERT: 소속 멤버만
CREATE POLICY "Calendar members can post comments" ON event_comments
    FOR INSERT WITH CHECK (
        auth.uid() = user_id AND
        EXISTS (
            SELECT 1 FROM events e
            JOIN calendar_members cm ON cm.calendar_id = e.calendar_id
            WHERE e.id = event_id AND cm.user_id = auth.uid()
        )
    );
-- DELETE: 본인 댓글만
CREATE POLICY "Users delete own comments" ON event_comments
    FOR DELETE USING (auth.uid() = user_id);

-- 6. 채팅 스팸 차단 정책 교체 (calendar_chat_messages)
DROP POLICY IF EXISTS "Calendar members can send messages" ON calendar_chat_messages;
CREATE POLICY "Non-interest calendar members can send messages"
    ON calendar_chat_messages FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM calendar_members cm
            JOIN calendars c ON c.id = cm.calendar_id
            WHERE cm.calendar_id = calendar_chat_messages.calendar_id
            AND cm.user_id = auth.uid()
            AND (c.calendar_type != 'interest' OR cm.role IN ('owner', 'editor'))
        )
    );
