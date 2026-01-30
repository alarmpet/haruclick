import { supabase, getCached, setCache, withInflight, invalidateUserScopedCache } from './client';
import { showError } from '../errorHandler';
import { EventRecord, EventCategory } from './types';

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

export async function updateEvent(id: string, updates: any) {
    try {
        const { error } = await supabase.from('events').update(updates).eq('id', id);
        if (error) throw error;
        const { data: { user } } = await supabase.auth.getUser();
        invalidateUserScopedCache(['upcoming_', 'stats_'], user?.id); // ??罹먯떆 臾댄슚??
        return { error: null };
    } catch (e: any) {
        console.error('Error updating event:', e);
        showError(e.message ?? '?대깽???낅뜲?댄듃 ?ㅽ뙣');
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
            console.log('[Cache HIT] getUpcomingEvents');
            return cached;
        }

        return await withInflight(cacheKey, async () => {
            // KST ?? ?? ?? ?? (UTC+9)
            const today = new Date(new Date().getTime() + 9 * 60 * 60 * 1000).toISOString().split('T')[0];

            // ???? ?? (?? ??, ????)
            const { data, error } = await supabase
                .from('events')
                .select('id, category, type, name, relation, event_date, amount, is_received, memo, start_time, end_time, location')
                .eq('user_id', user.id)
                .gt('event_date', today)
                .order('event_date', { ascending: true })
                .limit(limit);

            if (error) throw error;

            const result = data.map((item: any) => ({
                id: item.id,
                category: item.category || 'ceremony',
                type: item.type === 'APPOINTMENT' ? '??' : item.type, // UI ??? ???
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
        showError(e.message ?? '?? ??? ?? ??');
        return [];
    }
}

/**
 * ?ㅻ뒛 ?깅줉??紐⑤뱺 ?댁뿭 媛?몄삤湲?(??꾨씪?몄슜)
 */
export async function getTodayEvents(): Promise<EventRecord[]> {
    const today = new Date().toISOString().split('T')[0];
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
    const { data: { user } } = await supabase.auth.getUser();
    const userId = user?.id;
    const inflightKey = `today_${userId ?? 'public'}_${today}`;

    return withInflight(inflightKey, async () => {
        const userFilter = (query: any) => userId ? query.eq('user_id', userId) : query;

        // 1. Events (???/??)
        const { data: events } = await userFilter(
            supabase
                .from('events')
                .select('id, category, type, name, relation, event_date, amount, is_received, memo, start_time, end_time, location')
                .gte('event_date', today)
                .lt('event_date', tomorrow)
                .order('event_date', { ascending: true })
        );

        // 2. Ledger (???)
        const { data: ledger } = await userFilter(
            supabase
                .from('ledger')
                .select('id, category, merchant_name, transaction_date, amount, memo')
                .gte('transaction_date', today)
                .lt('transaction_date', tomorrow)
                .order('transaction_date', { ascending: true })
        );

        // 3. Bank (??)
        const { data: bank } = await userFilter(
            supabase
                .from('bank_transactions')
                .select('id, transaction_type, sender_name, receiver_name, category, transaction_date, amount, memo')
                .gte('transaction_date', today)
                .lt('transaction_date', tomorrow)
                .order('transaction_date', { ascending: true })
        );

        const eventRecords = (events || []).map((item: any) => ({
            id: item.id,
            category: item.category || 'ceremony',
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
            source: 'events' as const,
        }));

        const ledgerRecords = (ledger || []).map((item: any) => ({
            id: item.id,
            category: 'expense' as EventCategory,
            type: 'receipt' as const,
            name: item.merchant_name || '??',
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
            name: item.transaction_type === 'deposit' ? (item.sender_name || '??') : (item.receiver_name || '??'),
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

export async function getEvents(year?: number, month?: number): Promise<EventRecord[]> {
    let startDate: string | undefined;
    let endDate: string | undefined;
    const { data: { user } } = await supabase.auth.getUser();
    const userId = user?.id;

    if (year && month) {
        const start = new Date(year, month - 1, 1);
        const end = new Date(year, month, 1);
        startDate = start.toISOString().split('T')[0];
        endDate = end.toISOString().split('T')[0];
    }

    const inflightKey = `events_${userId ?? 'public'}_${startDate ?? 'all'}_${endDate ?? 'all'}`;

    return withInflight(inflightKey, async () => {
        const userFilter = (query: any) => userId ? query.eq('user_id', userId) : query;

        // 1. Fetch Events
        console.log('[getEvents] Fetching events table...', { year, month });
        let eventsQuery = userFilter(
            supabase
                .from('events')
                .select('id, category, type, name, relation, event_date, amount, is_received, memo, start_time, end_time, location')
                .order('event_date', { ascending: true })
        );

        if (startDate && endDate) {
            eventsQuery = eventsQuery.gte('event_date', startDate).lt('event_date', endDate);
        }

        const { data: events, error: eventError } = await eventsQuery;
        console.log('[getEvents] Events fetched:', events?.length);

        // 2. Fetch Ledger
        console.log('[getEvents] Fetching ledger table...');
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
        console.log('[getEvents] Ledger fetched:', ledger?.length);

        // 3. Fetch Bank Transactions
        console.log('[getEvents] Fetching bank_transactions table...');
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
        console.log('[getEvents] Bank fetched:', bank?.length);

        const eventRecords = (events || []).map((item: any) => ({
            id: item.id,
            category: item.category || 'ceremony',
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
            source: 'events' as const,
        }));

        const ledgerRecords = (ledger || []).map((item: any) => ({
            id: item.id,
            category: 'expense' as EventCategory,
            type: 'receipt' as const,
            name: item.merchant_name || '??',
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
            name: item.transaction_type === 'deposit' ? (item.sender_name || '??') : (item.receiver_name || '??'),
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
 * ?쇰컲 ?대깽????젣 (Fix: Missing function)
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
    invalidateUserScopedCache(['upcoming_', 'stats_'], user?.id); // ??罹먯떆 臾댄슚??
    return { success: true };
}
