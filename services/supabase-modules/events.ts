import { supabase, getCached, setCache, withInflight, invalidateUserScopedCache } from './client';
import { showError } from '../errorHandler';
import { EventRecord, EventCategory } from './types';
import { getMyCalendarIds } from './calendars';
import { getMySubscriptions, UserInterestSubscription } from './interests';

/**
 * Build a safe .or() filter string for calendar-based event queries.
 * Handles empty arrays and proper UUID quoting.
 */
function buildCalendarOrFilter(calendarIds: string[], userId: string): string {
    if (calendarIds.length === 0) {
        // No calendars, fall back to legacy user-only filter
        return `and(calendar_id.is.null,user_id.eq.${userId})`;
    }
    // Quote each UUID to prevent injection/parsing issues
    const quotedIds = calendarIds.map(id => `"${id}"`).join(',');
    return `calendar_id.in.(${quotedIds}),and(calendar_id.is.null,user_id.eq.${userId})`;
}

function extractTime(dateTime?: string): string | undefined {
    if (!dateTime) return undefined;
    const match = dateTime.match(/(\d{1,2}:\d{2})/);
    if (!match) return undefined;

    const timePart = match[1];
    const hasZone = /[zZ]|[+-]\d{2}:\d{2}$/.test(dateTime);
    const isDefaultMidnightUtc = hasZone && /T00:00(:00(\.\d+)?)?/.test(dateTime);
    if (isDefaultMidnightUtc) return undefined;

    if (hasZone) {
        const normalized = dateTime.replace(' ', 'T');
        const parsed = new Date(normalized);
        if (!isNaN(parsed.getTime())) {
            const hours = String(parsed.getHours()).padStart(2, '0');
            const minutes = String(parsed.getMinutes()).padStart(2, '0');
            if (hours === '00' && minutes === '00') return undefined;
            return `${hours}:${minutes}`;
        }
    }

    return timePart === '00:00' ? undefined : timePart;
}

function normalizeEventCategory(category?: string): EventCategory {
    const raw = (category || '').trim().toLowerCase();

    if (raw === 'ceremony' || raw === 'todo' || raw === 'schedule' || raw === 'expense') {
        return raw;
    }

    // Interest/culture feeds sometimes use domain-specific labels.
    if (raw === 'interest' || raw === 'performance' || raw === 'exhibition' || raw === 'festival' || raw === 'popup' || raw === 'movie' || raw === 'policy') {
        return 'interest';
    }

    return 'ceremony';
}

/**
 * 관심 카테고리 필터를 인메모리로 적용합니다. (1차 적용)
 * 향후 RPC나 View를 이용한 서버 사이드 필터링으로 개선 예정입니다.
 */
function applyInterestFilters(events: any[], subscriptions: UserInterestSubscription[]) {
    // 캘린더 ID 단위로 필터 조건 매핑
    const filterMap = new Map<string, UserInterestSubscription['active_filters']>();
    for (const sub of subscriptions) {
        if (sub.active_filters) {
            filterMap.set(sub.calendar_id, sub.active_filters);
        }
    }

    return events.filter(event => {
        // 관심 캘린더의 이벤트가 아니면 그대로 통과
        if (!event.calendar_id || !filterMap.has(event.calendar_id)) {
            return true;
        }

        const filters = filterMap.get(event.calendar_id);
        const { regions, detail_types } = filters || {};

        // 1. 지역 필터 (regions가 비어있으면 모든 지역 허용)
        if (regions && regions.length > 0) {
            if (!event.region || !regions.includes(event.region)) {
                return false;
            }
        }

        // 2. 세부유형 필터 (detail_types가 비어있으면 모든 유형 허용)
        if (detail_types && detail_types.length > 0) {
            if (!event.detail_type || !detail_types.includes(event.detail_type)) {
                return false;
            }
        }

        return true;
    });
}

export async function updateEvent(id: string, updates: any) {
    try {
        const { error } = await supabase.from('events').update(updates).eq('id', id);
        if (error) throw error;
        const { data: { user } } = await supabase.auth.getUser();
        invalidateUserScopedCache(['upcoming_', 'stats_'], user?.id); // 캐시 무효화
        return { error: null };
    } catch (e: any) {
        console.error('Error updating event:', e);
        showError(e.message ?? '이벤트 업데이트 실패');
        return { error: e };
    }
}

export async function getUpcomingEvents(limit = 2): Promise<EventRecord[]> {
    try {
        // 0. Auth Check
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return [];
        }

        const cacheKey = `upcoming_${user.id}_${limit}`;
        const cached = getCached<EventRecord[]>(cacheKey);
        if (cached) {
            if (__DEV__) console.log('[Cache HIT] getUpcomingEvents');
            return cached;
        }

        return await withInflight(cacheKey, async () => {
            // KST 기준 내일 날짜 (UTC+9)
            const today = new Date(new Date().getTime() + 9 * 60 * 60 * 1000).toISOString().split('T')[0];
            const myCalendarIds = await getMyCalendarIds();
            const subscriptions = await getMySubscriptions();

            let query = supabase
                .from('events')
                .select('id, category, type, name, relation, event_date, amount, is_received, memo, start_time, end_time, location, region, detail_type, calendar_id, created_by')
                .gt('event_date', today)
                .order('event_date', { ascending: true })
                .limit(limit * 3);

            if (myCalendarIds.length > 0) {
                query = query.or(buildCalendarOrFilter(myCalendarIds, user.id));
            } else {
                query = query.eq('user_id', user.id);
            }

            const { data, error } = await query;

            if (error) throw error;

            const filteredData = applyInterestFilters(data || [], subscriptions).slice(0, limit);

            const result = filteredData.map((item: any) => ({
                id: item.id,
                category: normalizeEventCategory(item.category),
                type: item.type === 'APPOINTMENT' ? '일정' : item.type, // UI 표시용 매핑
                name: item.name,
                relation: item.relation,
                date: item.event_date.split('T')[0],
                amount: item.amount,
                isReceived: item.is_received,
                memo: item.memo,
                isPaid: item.memo?.includes('[송금완료]') || false,
                isCompleted: false, // item.is_completed (Column missing)
                startTime: item.start_time,
                endTime: item.end_time,
                location: item.location,
                source: 'events' as const,
            }));

            setCache(cacheKey, result);
            return result;
        });
    } catch (e: any) {
        showError(e.message ?? '홈 데이터 조회 실패');
        return [];
    }
}

/**
 * 오늘 등록된 모든 내역 가져오기 (타임라인용)
 */
// TTL cache for getTodayEvents (30 seconds)
const todayEventsCache: {
    data: EventRecord[] | null;
    timestamp: number;
    key: string;
} = { data: null, timestamp: 0, key: '' };
const TODAY_CACHE_TTL = 30_000; // 30 seconds

export async function getTodayEvents(): Promise<EventRecord[]> {
    const today = new Date().toISOString().split('T')[0];
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
    const { data: { user } } = await supabase.auth.getUser();
    const userId = user?.id;
    const inflightKey = `today_${userId ?? 'public'}_${today}`;

    // Check TTL cache first
    const now = Date.now();
    const cacheKey = `${userId ?? 'public'}_${today}`;
    if (
        todayEventsCache.data &&
        todayEventsCache.key === cacheKey &&
        now - todayEventsCache.timestamp < TODAY_CACHE_TTL
    ) {
        return todayEventsCache.data;
    }

    return withInflight(inflightKey, async () => {
        const userFilter = (query: any) => userId ? query.eq('user_id', userId) : query;
        const myCalendarIds = userId ? await getMyCalendarIds() : [];
        const subscriptions = userId ? await getMySubscriptions() : [];

        // 1. Events (캘린더 기반 조회)
        let eventsQuery = supabase
            .from('events')
            .select('id, category, type, name, relation, event_date, amount, is_received, memo, start_time, end_time, location, region, detail_type, calendar_id, created_by')
            .gte('event_date', today)
            .lt('event_date', tomorrow)
            .order('event_date', { ascending: true });

        if (userId && myCalendarIds.length > 0) {
            eventsQuery = eventsQuery.or(buildCalendarOrFilter(myCalendarIds, userId));
        } else {
            eventsQuery = userFilter(eventsQuery);
        }

        const { data: events } = await eventsQuery;

        // 2. Ledger (가계부) - Calendar-aware filtering
        let ledgerQuery = supabase
            .from('ledger')
            .select('id, category, merchant_name, transaction_date, amount, memo, category_group, calendar_id')
            .gte('transaction_date', today)
            .lt('transaction_date', tomorrow)
            .order('transaction_date', { ascending: true });

        if (userId && myCalendarIds.length > 0) {
            ledgerQuery = ledgerQuery.or(buildCalendarOrFilter(myCalendarIds, userId));
        } else {
            ledgerQuery = userFilter(ledgerQuery);
        }

        const { data: ledger } = await ledgerQuery;

        // 3. Bank (송금) - Legacy UserID Filter
        const { data: bank } = await userFilter(
            supabase
                .from('bank_transactions')
                .select('id, transaction_type, sender_name, receiver_name, category, transaction_date, amount, memo')
                .gte('transaction_date', today)
                .lt('transaction_date', tomorrow)
                .order('transaction_date', { ascending: true })
        );

        const filteredEvents = applyInterestFilters(events || [], subscriptions);

        const eventRecords = filteredEvents.map((item: any) => ({
            id: item.id,
            category: normalizeEventCategory(item.category),
            type: item.type,
            name: item.name,
            relation: item.relation,
            date: item.event_date.split('T')[0],
            amount: item.amount,
            isReceived: item.is_received,
            memo: item.memo,
            startTime: item.start_time || undefined,
            endTime: item.end_time || undefined,
            location: item.location,
            calendar_id: item.calendar_id,
            created_by: item.created_by,
            source: 'events' as const,
        }));

        const ledgerRecords = (ledger || []).map((item: any) => ({
            id: item.id,
            category: 'expense' as EventCategory,
            type: 'receipt' as const,
            name: item.merchant_name || '지출',
            relation: item.category,
            date: item.transaction_date.split('T')[0],
            amount: item.amount,
            isReceived: false,
            memo: item.memo,
            startTime: extractTime(item.transaction_date),
            source: 'ledger' as const,
        }));

        const bankRecords = (bank || []).map((item: any) => ({
            id: item.id,
            category: 'expense' as EventCategory,
            type: 'transfer' as const,
            name: item.transaction_type === 'deposit' ? (item.sender_name || '입금') : (item.receiver_name || '출금'),
            relation: item.category,
            date: item.transaction_date.split('T')[0],
            amount: item.amount,
            isReceived: item.transaction_type === 'deposit',
            memo: item.memo,
            startTime: extractTime(item.transaction_date),
            source: 'bank_transactions' as const,
        }));

        // 날짜+시간 기준 정렬
        const result = [...eventRecords, ...ledgerRecords, ...bankRecords].sort((a, b) => {
            const dateCompare = new Date(a.date).getTime() - new Date(b.date).getTime();
            if (dateCompare !== 0) return dateCompare;

            // 날짜가 같으면 시간으로 정렬
            const timeA = a.startTime || '00:00:00';
            const timeB = b.startTime || '00:00:00';
            return timeA.localeCompare(timeB);
        });

        // Store in TTL cache
        todayEventsCache.data = result;
        todayEventsCache.timestamp = now;
        todayEventsCache.key = cacheKey;

        return result;
    });
}

export async function getEvents(year?: number, month?: number): Promise<EventRecord[]> {
    let startDate: string | undefined;
    let endDate: string | undefined;
    let startIso: string | undefined;
    let endIso: string | undefined;
    const { data: { user } } = await supabase.auth.getUser();
    const userId = user?.id;

    if (year && month) {
        const paddedMonth = String(month).padStart(2, '0');
        const nextYear = month === 12 ? year + 1 : year;
        const nextMonth = month === 12 ? 1 : month + 1;
        const paddedNextMonth = String(nextMonth).padStart(2, '0');

        // Build local date boundaries directly to avoid UTC ISO date shifts.
        startDate = `${year}-${paddedMonth}-01`;
        endDate = `${nextYear}-${paddedNextMonth}-01`;
        startIso = `${startDate}T00:00:00`;
        endIso = `${endDate}T00:00:00`;
    }

    const inflightKey = `events_${userId ?? 'public'}_${startDate ?? 'all'}_${endDate ?? 'all'}`;

    return withInflight(inflightKey, async () => {
        if (__DEV__) {
            console.log('[getEvents] Params', {
                year,
                month,
                userId: userId ?? 'public',
                timezoneOffsetMinutes: new Date().getTimezoneOffset(),
            });
            console.log('[getEvents] Date range', {
                startDate: startDate ?? 'all',
                endDate: endDate ?? 'all',
                startIso,
                endIso,
            });
        }
        const userFilter = (query: any) => userId ? query.eq('user_id', userId) : query;
        const myCalendarIds = userId ? await getMyCalendarIds() : [];
        const subscriptions = userId ? await getMySubscriptions() : [];

        // 1. Fetch Events
        if (__DEV__) console.log('[getEvents] Fetching events table...', { year, month });
        let eventsQuery = supabase
            .from('events')
            .select('id, category, type, name, relation, event_date, amount, is_received, memo, start_time, end_time, location, region, detail_type, calendar_id, created_by')
            .order('event_date', { ascending: true });

        if (startDate && endDate) {
            eventsQuery = eventsQuery.gte('event_date', startDate).lt('event_date', endDate);
        }

        if (userId && myCalendarIds.length > 0) {
            eventsQuery = eventsQuery.or(buildCalendarOrFilter(myCalendarIds, userId));
        } else {
            eventsQuery = userFilter(eventsQuery);
        }

        const { data: events, error: eventError } = await eventsQuery;
        if (eventError) {
            console.error('[getEvents] Events query error:', eventError);
        }
        if (__DEV__) console.log('[getEvents] Events fetched:', events?.length);

        // 2. Fetch Ledger
        if (__DEV__) console.log('[getEvents] Fetching ledger table...');
        let ledgerQuery = userFilter(
            supabase
                .from('ledger')
                .select('id, category, merchant_name, transaction_date, amount, memo')
                .order('transaction_date', { ascending: true })
        );

        if (startDate && endDate) {
            ledgerQuery = ledgerQuery.gte('transaction_date', startDate).lt('transaction_date', endDate);
        }

        const { data: ledger, error: ledgerError } = await ledgerQuery;
        if (ledgerError) {
            console.error('[getEvents] Ledger query error:', ledgerError);
        }
        if (__DEV__) console.log('[getEvents] Ledger fetched:', ledger?.length);

        // 3. Fetch Bank Transactions
        if (__DEV__) console.log('[getEvents] Fetching bank_transactions table...');
        let bankQuery = userFilter(
            supabase
                .from('bank_transactions')
                .select('id, transaction_type, sender_name, receiver_name, category, transaction_date, amount, memo')
                .order('transaction_date', { ascending: true })
        );

        if (startDate && endDate) {
            bankQuery = bankQuery.gte('transaction_date', startDate).lt('transaction_date', endDate);
        }

        const { data: bank, error: bankError } = await bankQuery;
        if (bankError) {
            console.error('[getEvents] Bank query error:', bankError);
        }
        if (__DEV__) console.log('[getEvents] Bank fetched:', bank?.length);

        const filteredEvents = applyInterestFilters(events || [], subscriptions);

        const eventRecords = filteredEvents.map((item: any) => ({
            id: item.id,
            category: normalizeEventCategory(item.category),
            type: item.type,
            name: item.name,
            relation: item.relation,
            date: item.event_date.split('T')[0],
            amount: item.amount,
            isReceived: item.is_received,
            memo: item.memo,
            isPaid: item.memo?.includes('[송금완료]') || false,
            startTime: item.start_time || undefined,
            endTime: item.end_time || undefined,
            location: item.location,
            calendar_id: item.calendar_id,
            created_by: item.created_by,
            source: 'events' as const,
        }));

        const ledgerRecords = (ledger || []).map((item: any) => ({
            id: item.id,
            category: 'expense' as EventCategory,
            type: 'receipt' as const,
            name: item.merchant_name || '지출',
            relation: item.category,
            date: item.transaction_date.split('T')[0],
            amount: item.amount,
            isReceived: false,
            memo: item.memo,
            startTime: extractTime(item.transaction_date),
            source: 'ledger' as const,
        }));

        const bankRecords = (bank || []).map((item: any) => ({
            id: item.id,
            category: 'expense' as EventCategory,
            type: 'transfer' as const,
            name: item.transaction_type === 'deposit' ? (item.sender_name || '입금') : (item.receiver_name || '출금'),
            relation: item.category,
            date: item.transaction_date.split('T')[0],
            amount: item.amount,
            isReceived: item.transaction_type === 'deposit',
            memo: item.memo,
            startTime: extractTime(item.transaction_date),
            source: 'bank_transactions' as const,
        }));

        // 날짜+시간 기준 정렬
        return [...eventRecords, ...ledgerRecords, ...bankRecords].sort((a, b) => {
            const dateCompare = new Date(a.date).getTime() - new Date(b.date).getTime();
            if (dateCompare !== 0) return dateCompare;

            // 날짜가 같으면 시간으로 정렬
            const timeA = a.startTime || '00:00:00';
            const timeB = b.startTime || '00:00:00';
            return timeA.localeCompare(timeB);
        });
    });
}

/**
 * 일반 이벤트 삭제 (Fix: Missing function)
 */
export async function deleteEvent(id: string) {
    const { error } = await supabase
        .from('events')
        .delete()
        .eq('id', id);

    if (error) {
        console.error('Error deleting event:', error);
        throw error;
    }
    const { data: { user } } = await supabase.auth.getUser();
    invalidateUserScopedCache(['upcoming_', 'stats_'], user?.id); // 캐시 무효화
    return { success: true };
}
