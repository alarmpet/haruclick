import { supabase } from './client';
import type { RealtimeChannel } from '@supabase/supabase-js';

export interface ChatMessage {
    id: string;
    calendar_id: string;
    user_id: string;
    message: string;
    type: 'text' | 'system';
    created_at: string;
}

export interface MemberProfile {
    user_id: string;
    role: string;
    display_name: string;
    joined_at: string;
}

export interface ChatCursor {
    created_at: string;
    id: string;
}

export type ChatRealtimeStatus = 'SUBSCRIBED' | 'TIMED_OUT' | 'CLOSED' | 'CHANNEL_ERROR';

/**
 * Fetch chat messages with pagination
 * @param calendarId - Calendar UUID
 * @param limit - Number of messages to fetch
 * @param before - Cursor for pagination (fetch messages before this message)
 * @returns Messages in chronological order (oldest first)
 */
export async function getMessages(
    calendarId: string,
    limit = 50,
    before?: ChatCursor
): Promise<ChatMessage[]> {
    try {
        let query = supabase
            .from('calendar_chat_messages')
            .select('*')
            .eq('calendar_id', calendarId)
            .order('created_at', { ascending: false })
            .order('id', { ascending: false })
            .limit(limit);

        if (before) {
            query = query.or(
                `created_at.lt.${before.created_at},and(created_at.eq.${before.created_at},id.lt.${before.id})`
            );
        }

        const { data, error } = await query;
        if (error) throw error;

        // Reverse to get chronological order (oldest first)
        return data?.reverse() || [];
    } catch (error) {
        console.error('[getMessages] Error:', error);
        throw error;
    }
}

/**
 * Send a chat message
 * @param calendarId - Calendar UUID
 * @param message - Message text (will be trimmed)
 */
export async function sendMessage(calendarId: string, message: string): Promise<void> {
    try {
        const trimmedMessage = message.trim();
        if (!trimmedMessage) {
            throw new Error('Message cannot be empty');
        }

        const { error } = await supabase
            .from('calendar_chat_messages')
            .insert({
                calendar_id: calendarId,
                message: trimmedMessage,
            });

        if (error) throw error;
    } catch (error) {
        console.error('[sendMessage] Error:', error);
        throw error;
    }
}

/**
 * Get calendar members with profile information (display_name)
 * @param calendarId - Calendar UUID
 */
export async function getMembersWithProfile(calendarId: string): Promise<MemberProfile[]> {
    try {
        const { data, error } = await supabase
            .rpc('get_calendar_members_with_profile', { p_calendar_id: calendarId });

        if (error) throw error;
        return data || [];
    } catch (error) {
        console.error('[getMembersWithProfile] Error:', error);
        return [];
    }
}

/**
 * Subscribe to real-time chat updates
 * @param calendarId - Calendar UUID
 * @param onMessage - Callback for new messages
 * @returns RealtimeChannel (use with unsubscribeFromChat)
 */
export function subscribeToChat(
    calendarId: string,
    onMessage: (message: ChatMessage) => void,
    onStatus?: (status: ChatRealtimeStatus) => void
): RealtimeChannel {
    const channel = supabase
        .channel(`chat:${calendarId}`)
        .on(
            'postgres_changes',
            {
                event: 'INSERT',
                schema: 'public',
                table: 'calendar_chat_messages',
                filter: `calendar_id=eq.${calendarId}`,
            },
            (payload) => {
                console.log('[subscribeToChat] New message:', payload.new);
                onMessage(payload.new as ChatMessage);
            }
        )
        .subscribe((status) => {
            const normalized = status as ChatRealtimeStatus;
            console.log('[subscribeToChat] Status:', normalized);
            onStatus?.(normalized);
        });

    return channel;
}

/**
 * Unsubscribe from chat updates
 * @param channel - RealtimeChannel from subscribeToChat
 */
export async function unsubscribeFromChat(channel: RealtimeChannel): Promise<void> {
    await supabase.removeChannel(channel);
}
