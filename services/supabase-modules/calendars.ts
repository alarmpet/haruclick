import { supabase } from './client';
import { showError } from '../errorHandler';
import { invalidateCalendarCache } from './client';

// In-memory cache for calendar IDs
let calendarIdsCache: { ids: string[]; timestamp: number } | null = null;
const CALENDAR_IDS_CACHE_TTL = 60 * 1000; // 1 minute

// Types (should eventually move to types.ts)
export type CalendarRole = 'owner' | 'editor' | 'viewer';

export interface Calendar {
    id: string;
    name: string;
    color: string;
    owner_id: string;
    is_personal: boolean;
    created_at: string;
    role?: 'owner' | 'editor' | 'viewer'; // Augmented from membership
}

export interface CalendarMember {
    id: string;
    calendar_id: string;
    user_id: string;
    role: 'owner' | 'editor' | 'viewer';
    joined_at: string;
    email?: string; // Optional if we fetch user details
}

/**
 * Fetch all calendars the user belongs to (as owner or member)
 */
export async function getMyCalendars(): Promise<Calendar[]> {
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return [];

        // 1. Get calendars where I am a member
        const { data: memberships, error: memberError } = await supabase
            .from('calendar_members')
            .select('calendar_id, role, shared_categories')
            .eq('user_id', user.id);

        if (memberError) throw memberError;

        if (!memberships || memberships.length === 0) {
            // Fallback: Try to fetch personal calendar owned by me directly
            const { data: owned, error: ownedError } = await supabase
                .from('calendars')
                .select('*')
                .eq('owner_id', user.id)
                .eq('is_personal', true);

            if (ownedError) throw ownedError;
            return owned.map(c => ({ ...c, role: 'owner' }));
        }

        const calendarIds = memberships.map(m => m.calendar_id);

        // 2. Fetch calendar details
        const { data: calendars, error: calendarError } = await supabase
            .from('calendars')
            .select('*')
            .in('id', calendarIds);

        if (calendarError) throw calendarError;

        // Merge role info
        return calendars.map(c => {
            const membership = memberships.find(m => m.calendar_id === c.id);
            return {
                ...c,
                role: membership?.role || 'viewer',
                shared_categories: membership?.shared_categories || []
            };
        });

    } catch (e: any) {
        showError(e.message || '캘린더 목록 조회 실패');
        return [];
    }
}

/**
 * Helper to get a list of calendar IDs accessible by the user
 * Uses in-memory cache with TTL to reduce duplicate queries
 */
export async function getMyCalendarIds(): Promise<string[]> {
    // Check cache validity
    if (calendarIdsCache && Date.now() - calendarIdsCache.timestamp < CALENDAR_IDS_CACHE_TTL) {
        return calendarIdsCache.ids;
    }

    // Cache miss or expired - fetch fresh data
    const calendars = await getMyCalendars();
    const ids = calendars.map(c => c.id);

    // Update cache
    calendarIdsCache = { ids, timestamp: Date.now() };
    return ids;
}

/**
 * Invalidate calendar IDs cache
 * Call this when calendars are created, joined, or left
 */
export function invalidateCalendarIdsCache() {
    calendarIdsCache = null;
}

/**
 * Get (or create) the default personal calendar for the user
 */
export async function getDefaultCalendarId(userId: string): Promise<string> {
    try {
        // Try to find existing personal calendar
        const { data, error } = await supabase
            .from('calendars')
            .select('id')
            .eq('owner_id', userId)
            .eq('is_personal', true)
            .limit(1)
            .single();

        if (data) return data.id;

        // If not found, create one
        console.log('[Calendars] Creating default personal calendar...');
        const newCal = await createCalendar('내 캘린더', '#8B5CF6', true);
        if (newCal) return newCal.id;

        throw new Error('Failed to create default calendar');

    } catch (error) {
        console.error('Error fetching default calendar:', error);
        throw error;
    }
}

/**
 * Create a new calendar
 */
export async function createCalendar(
    name: string,
    color: string = '#8B5CF6',
    isPersonal: boolean = false
): Promise<Calendar | null> {
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('로그인이 필요합니다.');

        // 1. Insert Calendar
        const { data: calendar, error: calError } = await supabase
            .from('calendars')
            .insert({
                name,
                color,
                owner_id: user.id,
                is_personal: isPersonal
            })
            .select()
            .single();

        if (calError) throw calError;

        // 2. Add Owner as Member (Important for RLS)
        const { error: memberError } = await supabase
            .from('calendar_members')
            .insert({
                calendar_id: calendar.id,
                user_id: user.id,
                role: 'owner'
            });

        if (memberError) {
            console.error('Failed to add owner member, rolling back calendar creation...');
            await supabase.from('calendars').delete().eq('id', calendar.id); // Rollback
            throw memberError;
        }

        invalidateCalendarCache(user.id); // Invalidate Cache
        invalidateCalendarIdsCache(); // Invalidate IDs Cache
        return { ...calendar, role: 'owner' };

    } catch (e: any) {
        showError(e.message || '캘린더 생성 실패');
        return null;
    }
}

/**
 * Create an invite code
 */
export async function createInviteCode(
    calendarId: string,
    options?: {
        sharedCategories?: string[]
    }
): Promise<string | null> {
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('로그인이 필요합니다.');

        const code = Math.random().toString(36).substring(2, 10).toUpperCase(); // Simple 8-char code
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24 hours

        const { error } = await supabase
            .from('calendar_invites')
            .insert({
                code,
                calendar_id: calendarId,
                created_by: user.id,
                expires_at: expiresAt,
                shared_categories: options?.sharedCategories || ['ceremony', 'todo', 'schedule']
            });

        if (error) throw error;
        return code;
    } catch (e: any) {
        showError(e.message || '초대 코드 생성 실패');
        return null;
    }
}

/**
 * Join a calendar by code (Using Secure RPC)
 */
export async function joinCalendarByCode(code: string): Promise<boolean> {
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('로그인이 필요합니다.');

        const { data, error } = await supabase
            .rpc('join_calendar_by_code', { p_code: code });

        if (error) {
            console.error('RPC Error:', error);
            if (error.message.includes('Invalid invite code')) throw new Error('유효하지 않은 초대 코드입니다.');
            if (error.message.includes('expired')) throw new Error('만료된 초대 코드입니다.');
            if (error.message.includes('limit reached')) throw new Error('사용 횟수를 초과한 초대 코드입니다.');
            throw error;
        }

        invalidateCalendarCache(user.id);
        invalidateCalendarIdsCache(); // Invalidate IDs Cache
        return true;

    } catch (e: any) {
        showError(e.message || '캘린더 가입 실패');
        return false;
    }
}

/**
 * Get members of a calendar
 */
export async function getCalendarMembers(calendarId: string): Promise<CalendarMember[]> {
    try {
        const { data, error } = await supabase
            .from('calendar_members')
            .select('*')
            .eq('calendar_id', calendarId);

        if (error) throw error;
        return data as CalendarMember[];
    } catch (e) {
        console.error('getCalendarMembers error', e);
        return [];
    }
}

/**
 * Leave a calendar
 */
export async function leaveCalendar(calendarId: string): Promise<boolean> {
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Not logged in');

        const { error } = await supabase
            .from('calendar_members')
            .delete()
            .eq('calendar_id', calendarId)
            .eq('user_id', user.id);

        if (error) throw error;

        invalidateCalendarCache(user.id);
        invalidateCalendarIdsCache(); // Invalidate IDs Cache
        return true;
    } catch (e: any) {
        showError(e.message || '캘린더 나가기 실패');
        return false;
    }
}
