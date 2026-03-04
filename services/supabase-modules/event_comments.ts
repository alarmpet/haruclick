import { supabase } from './client';
import type { RealtimeChannel } from '@supabase/supabase-js';

export interface EventComment {
    id: string;
    event_id: string;
    user_id: string;
    content: string;
    image_url: string | null;
    created_at: string;
    // JOIN을 통해 가져올 유저 프로필 정보 (선택적)
    user_profile?: {
        display_name?: string;
        avatar_url?: string;
    };
}

/**
 * 특정 이벤트(일정)의 댓글 리스트를 옛날 시간순으로 조회
 */
export async function getEventComments(eventId: string): Promise<EventComment[]> {
    try {
        // user_profile 정보를 join 해서 가져옵니다 (chat.ts getMembersWithProfile 방식 참고하거나 auth 뷰 사용)
        // 여기선 단순 RLS 통과 여부 및 기본 쿼리 우선 구현합니다.
        const { data, error } = await supabase
            .from('event_comments')
            .select(`
                *,
                user_profiles:user_id ( display_name, avatar_url )
            `)
            .eq('event_id', eventId)
            .order('created_at', { ascending: true });

        if (error) throw error;

        return (data || []).map(row => ({
            ...row,
            user_profile: row.user_profiles || undefined,
            user_profiles: undefined
        })) as EventComment[];
    } catch (error) {
        console.error('[getEventComments] Error:', error);
        return [];
    }
}

/**
 * 스레드에 새 댓글 작성
 */
export async function postEventComment(eventId: string, content: string, imageUrl?: string): Promise<boolean> {
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Not authenticated');

        const trimmed = content.trim();
        if (!trimmed && !imageUrl) throw new Error('Empty comment');

        const { error } = await supabase
            .from('event_comments')
            .insert({
                event_id: eventId,
                user_id: user.id,
                content: trimmed,
                image_url: imageUrl || null
            });

        if (error) throw error;
        return true;
    } catch (error) {
        console.error('[postEventComment] Error:', error);
        return false;
    }
}

/**
 * 내 댓글 삭제
 */
export async function deleteEventComment(commentId: string): Promise<boolean> {
    try {
        const { error } = await supabase
            .from('event_comments')
            .delete()
            .eq('id', commentId);

        if (error) throw error;
        return true;
    } catch (error) {
        console.error('[deleteEventComment] Error:', error);
        return false;
    }
}

/**
 * 실시간 댓글 업데이트 구독 (chat.ts 모방)
 */
export function subscribeToEventComments(
    eventId: string,
    onNewComment: (comment: EventComment) => void,
    onDeleteComment?: (commentId: string) => void
): RealtimeChannel {
    const channel = supabase
        .channel(`event_comments:${eventId}`)
        .on(
            'postgres_changes',
            {
                event: 'INSERT',
                schema: 'public',
                table: 'event_comments',
                filter: `event_id=eq.${eventId}`
            },
            (payload) => {
                onNewComment(payload.new as EventComment);
            }
        )
        .on(
            'postgres_changes',
            {
                event: 'DELETE',
                schema: 'public',
                table: 'event_comments',
                filter: `event_id=eq.${eventId}`
            },
            (payload) => {
                if (onDeleteComment && payload.old && payload.old.id) {
                    onDeleteComment(payload.old.id as string);
                }
            }
        )
        .subscribe();

    return channel;
}

export async function unsubscribeFromEventComments(channel: RealtimeChannel): Promise<void> {
    await supabase.removeChannel(channel);
}
