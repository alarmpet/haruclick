import { supabase, getCached, setCache, invalidateCache } from './client';
import { showError } from '../errorHandler';
import { EventRecord, EventCategory } from './types';

export async function updateEvent(id: string, updates: any) {
    try {
        const { error } = await supabase.from('events').update(updates).eq('id', id);
        if (error) throw error;
        invalidateCache(); // ✅ 캐시 무효화
        return { error: null };
    } catch (e: any) {
        console.error('Error updating event:', e);
        showError(e.message ?? '이벤트 업데이트 실패');
        return { error: e };
    }
}

export async function getUpcomingEvents(limit = 2): Promise<EventRecord[]> {
    const cacheKey = `upcoming_${limit}`;
    const cached = getCached<EventRecord[]>(cacheKey);
    if (cached) {
        console.log('[Cache HIT] getUpcomingEvents');
        return cached;
    }

    try {
        // KST 기준 오늘 날짜 계산 (UTC+9)
        const today = new Date(new Date().getTime() + 9 * 60 * 60 * 1000).toISOString().split('T')[0];

        // 0. Auth Check
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return [];
        }

        // 다가오는 일정 (오늘 제외, 내일부터)
        const { data, error } = await supabase
            .from('events')
            .select('id, category, type, name, relation, event_date, amount, is_received, memo, start_time, end_time, location')
            .gt('event_date', today)
            .order('event_date', { ascending: true })
            .limit(limit);

        if (error) throw error;

        const result = data.map((item: any) => ({
            id: item.id,
            category: item.category || 'ceremony',
            type: item.type === 'APPOINTMENT' ? '일정' : item.type, // UI 표시용 한글화
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
    } catch (e: any) {
        showError(e.message ?? '다음 이벤트 조회 실패');
        return [];
    }
}

/**
 * 오늘 등록된 모든 내역 가져오기 (타임라인용)
 */
export async function getTodayEvents(): Promise<EventRecord[]> {
    const today = new Date().toISOString().split('T')[0];
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];

    // 1. Events (경조사/일정)
    const { data: events } = await supabase
        .from('events')
        .select('id, category, type, name, relation, event_date, amount, is_received, memo, start_time, end_time, location')
        .gte('event_date', today)
        .lt('event_date', tomorrow)
        .order('event_date', { ascending: true });

    // 2. Ledger (가계부)
    const { data: ledger } = await supabase
        .from('ledger')
        .select('id, category, merchant_name, transaction_date, amount, memo')
        .gte('transaction_date', today)
        .lt('transaction_date', tomorrow)
        .order('transaction_date', { ascending: true });

    // 3. Bank (이체)
    const { data: bank } = await supabase
        .from('bank_transactions')
        .select('id, transaction_type, sender_name, receiver_name, category, transaction_date, amount, memo')
        .gte('transaction_date', today)
        .lt('transaction_date', tomorrow)
        .order('transaction_date', { ascending: true });

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
        source: 'events' as const,
    }));

    const ledgerRecords = (ledger || []).map((item: any) => ({
        id: item.id,
        category: 'expense' as EventCategory,
        type: 'receipt' as const,
        name: item.merchant_name || '결제',
        relation: item.category,
        date: item.transaction_date.split('T')[0],
        amount: item.amount,
        isReceived: false,
        memo: item.memo,
        source: 'ledger' as const,
    }));

    const bankRecords = (bank || []).map((item: any) => ({
        id: item.id,
        category: 'expense' as EventCategory,
        type: 'transfer' as const,
        name: item.transaction_type === 'deposit' ? (item.sender_name || '입금') : (item.receiver_name || '송금'),
        relation: item.category,
        date: item.transaction_date.split('T')[0],
        amount: item.amount,
        isReceived: item.transaction_type === 'deposit',
        memo: item.memo,
        source: 'bank_transactions' as const,
    }));

    // 시간순 정렬
    return [...eventRecords, ...ledgerRecords, ...bankRecords].sort((a, b) =>
        new Date(a.date).getTime() - new Date(b.date).getTime()
    );
}

export async function getEvents(year?: number, month?: number): Promise<EventRecord[]> {
    let startDate: string | undefined;
    let endDate: string | undefined;

    if (year && month) {
        const start = new Date(year, month - 1, 1);
        const end = new Date(year, month, 1);
        startDate = start.toISOString().split('T')[0];
        endDate = end.toISOString().split('T')[0];
    }

    // 1. Fetch Events
    console.log('[getEvents] Fetching events table...', { year, month });
    let eventsQuery = supabase
        .from('events')
        .select('id, category, type, name, relation, event_date, amount, is_received, memo, start_time, end_time, location')
        .order('event_date', { ascending: true });

    if (startDate && endDate) {
        eventsQuery = eventsQuery.gte('event_date', startDate).lt('event_date', endDate);
    }

    const { data: events, error: eventError } = await eventsQuery;
    console.log('[getEvents] Events fetched:', events?.length);

    // 2. Fetch Ledger
    console.log('[getEvents] Fetching ledger table...');
    let ledgerQuery = supabase
        .from('ledger')
        .select('id, category, merchant_name, transaction_date, amount, memo')
        .order('transaction_date', { ascending: true });

    if (startDate && endDate) {
        ledgerQuery = ledgerQuery.gte('transaction_date', startDate).lt('transaction_date', endDate);
    }

    const { data: ledger, error: ledgerError } = await ledgerQuery;
    console.log('[getEvents] Ledger fetched:', ledger?.length);

    // 3. Fetch Bank Transactions
    console.log('[getEvents] Fetching bank_transactions table...');
    let bankQuery = supabase
        .from('bank_transactions')
        .select('id, transaction_type, sender_name, receiver_name, category, transaction_date, amount, memo')
        .order('transaction_date', { ascending: true });

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
        source: 'events' as const,
    }));

    const ledgerRecords = (ledger || []).map((item: any) => ({
        id: item.id,
        category: 'expense' as EventCategory,
        type: 'receipt' as const,
        name: item.merchant_name || '결제',
        relation: item.category,
        date: item.transaction_date.split('T')[0],
        amount: item.amount,
        isReceived: false,
        memo: item.memo,
        source: 'ledger' as const,
    }));

    const bankRecords = (bank || []).map((item: any) => ({
        id: item.id,
        category: 'expense' as EventCategory,
        type: 'transfer' as const,
        name: item.transaction_type === 'deposit' ? (item.sender_name || '입금') : (item.receiver_name || '송금'),
        relation: item.category,
        date: item.transaction_date.split('T')[0],
        amount: item.amount,
        isReceived: item.transaction_type === 'deposit',
        memo: item.memo,
        source: 'bank_transactions' as const,
    }));

    return [...eventRecords, ...ledgerRecords, ...bankRecords].sort((a, b) =>
        new Date(a.date).getTime() - new Date(b.date).getTime()
    );
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
    invalidateCache(); // ✅ 캐시 무효화
    return { success: true };
}
