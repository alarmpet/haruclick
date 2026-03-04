-- ==========================================
-- 20260304_community_posts.sql
-- Description: 관심 커뮤니티 채널 관련 테이블 생성 (posts, comments, likes)
-- ==========================================

-- 1. 커뮤니티 채널 게시글 (channel_posts)
CREATE TABLE IF NOT EXISTS public.channel_posts (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    category_id uuid REFERENCES public.interest_categories(id) ON DELETE CASCADE NOT NULL,
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    author_name varchar(50) DEFAULT '하루 메이트',
    content text NOT NULL CHECK (char_length(content) <= 2000),
    image_url text,
    like_count int DEFAULT 0,
    comment_count int DEFAULT 0,
    created_at timestamptz DEFAULT now()
);

-- 인덱스 (카테고리별 최신순 조회 최적화)
CREATE INDEX IF NOT EXISTS idx_channel_posts_category ON public.channel_posts(category_id, created_at DESC);

-- RLS: 모두 조회 가능, 본인 글만 작성/삭제 가능
ALTER TABLE public.channel_posts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read posts" ON public.channel_posts FOR SELECT USING (true);
CREATE POLICY "Users create own posts" ON public.channel_posts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own posts" ON public.channel_posts FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "System update like count" ON public.channel_posts FOR UPDATE USING (auth.role() = 'authenticated'); -- 좋아요/댓글 카운트 캐시 갱신용


-- 2. 좋아요 테이블 (channel_post_likes)
CREATE TABLE IF NOT EXISTS public.channel_post_likes (
    post_id uuid REFERENCES public.channel_posts(id) ON DELETE CASCADE,
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at timestamptz DEFAULT now(),
    PRIMARY KEY (post_id, user_id)
);

-- RLS
ALTER TABLE public.channel_post_likes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read likes" ON public.channel_post_likes FOR SELECT USING (true);
CREATE POLICY "Users toggle own likes" ON public.channel_post_likes FOR ALL USING (auth.uid() = user_id);


-- 3. 댓글 테이블 (channel_comments)
CREATE TABLE IF NOT EXISTS public.channel_comments (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    post_id uuid REFERENCES public.channel_posts(id) ON DELETE CASCADE NOT NULL,
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    author_name varchar(50) DEFAULT '하루 메이트',
    content text NOT NULL CHECK (char_length(content) <= 500),
    created_at timestamptz DEFAULT now()
);

-- 인덱스 (포스트별 최신순 조회)
CREATE INDEX IF NOT EXISTS idx_channel_comments_post ON public.channel_comments(post_id, created_at ASC);

-- RLS
ALTER TABLE public.channel_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read comments" ON public.channel_comments FOR SELECT USING (true);
CREATE POLICY "Users create own comments" ON public.channel_comments FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own comments" ON public.channel_comments FOR DELETE USING (auth.uid() = user_id);


-- 4. 카테고리 데노멀라이제이션 성능용 컬럼 추가 (구독자 수, 포스트 수)
ALTER TABLE public.interest_categories
    ADD COLUMN IF NOT EXISTS subscriber_count int DEFAULT 0,
    ADD COLUMN IF NOT EXISTS post_count int DEFAULT 0;
