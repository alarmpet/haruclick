import { supabase } from './client';
import { showError } from '../errorHandler';

export interface ChannelPost {
    id: string;
    category_id: string;
    user_id: string;
    author_name: string;
    content: string;
    image_url: string | null;
    like_count: number;
    comment_count: number;
    created_at: string;
    has_liked?: boolean; // Client-side state
}

export interface ChannelComment {
    id: string;
    post_id: string;
    user_id: string;
    author_name: string;
    content: string;
    created_at: string;
}

/**
 * Fetch channel posts with pagination
 */
export async function getChannelPosts(categoryId: string, page: number = 0, limit: number = 20): Promise<ChannelPost[]> {
    try {
        const { data: { user } } = await supabase.auth.getUser();

        let query = supabase
            .from('channel_posts')
            .select(`
                *,
                channel_post_likes!left(user_id)
            `)
            .eq('category_id', categoryId)
            .order('created_at', { ascending: false })
            .range(page * limit, (page + 1) * limit - 1);

        if (user) {
            query = query.eq('channel_post_likes.user_id', user.id);
        }

        const { data, error } = await query;
        if (error) throw error;

        return (data || []).map((post: any) => ({
            ...post,
            has_liked: post.channel_post_likes && post.channel_post_likes.length > 0
        })) as ChannelPost[];

    } catch (error) {
        if (__DEV__) console.error('[getChannelPosts] Error:', error);
        return [];
    }
}

/**
 * Create a new channel post
 */
export async function createChannelPost(categoryId: string, content: string, imageUrl: string | null = null): Promise<ChannelPost | null> {
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            showError('로그인이 필요합니다.');
            return null;
        }

        const authorName = user.user_metadata?.display_name || user.email?.split('@')[0] || '하루 메이트';

        const { data, error } = await supabase
            .from('channel_posts')
            .insert({
                category_id: categoryId,
                user_id: user.id,
                author_name: authorName,
                content: content,
                image_url: imageUrl
            })
            .select()
            .single();

        if (error) throw error;
        return data as ChannelPost;
    } catch (error) {
        if (__DEV__) console.error('[createChannelPost] Error:', error);
        showError('게시글 등록에 실패했습니다.');
        return null;
    }
}

/**
 * Toggle like for a post
 */
export async function togglePostLike(postId: string, isCurrentlyLiked: boolean): Promise<boolean> {
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            showError('로그인이 필요합니다.');
            return false;
        }

        if (isCurrentlyLiked) {
            const { error: deleteError } = await supabase
                .from('channel_post_likes')
                .delete()
                .match({ post_id: postId, user_id: user.id });

            if (deleteError) throw deleteError;
        } else {
            const { error: insertError } = await supabase
                .from('channel_post_likes')
                .insert({ post_id: postId, user_id: user.id });

            if (insertError) throw insertError;
        }

        return true;
    } catch (error) {
        if (__DEV__) console.error('[togglePostLike] Error:', error);
        return false;
    }
}

/**
 * Fetch comments for a post
 */
export async function getChannelComments(postId: string): Promise<ChannelComment[]> {
    try {
        const { data, error } = await supabase
            .from('channel_comments')
            .select('*')
            .eq('post_id', postId)
            .order('created_at', { ascending: true });

        if (error) throw error;
        return data as ChannelComment[];
    } catch (error) {
        if (__DEV__) console.error('[getChannelComments] Error:', error);
        return [];
    }
}

/**
 * Create a new comment
 */
export async function createChannelComment(postId: string, content: string): Promise<ChannelComment | null> {
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            showError('로그인이 필요합니다.');
            return null;
        }

        const authorName = user.user_metadata?.display_name || user.email?.split('@')[0] || '하루 메이트';

        const { data, error } = await supabase
            .from('channel_comments')
            .insert({
                post_id: postId,
                user_id: user.id,
                author_name: authorName,
                content: content
            })
            .select()
            .single();

        if (error) throw error;
        return data as ChannelComment;
    } catch (error) {
        if (__DEV__) console.error('[createChannelComment] Error:', error);
        showError('댓글 등록에 실패했습니다.');
        return null;
    }
}

/**
 * Fetch upcoming events for a category's calendar
 */
export async function getUpcomingChannelEvents(calendarId: string, limit: number = 3): Promise<any[]> {
    try {
        const { data, error } = await supabase
            .from('events')
            .select('*')
            .eq('calendar_id', calendarId)
            .gte('event_date', new Date().toISOString().split('T')[0])
            .order('event_date', { ascending: true })
            .limit(limit);

        if (error) throw error;
        return data || [];
    } catch (error) {
        if (__DEV__) console.error('[getUpcomingChannelEvents] Error:', error);
        return [];
    }
}
