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
        const today = new Date().toISOString().split('T')[0];

        // 0. Auth Check
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return [];
        }

        // 다가오는 일정 (오늘 포함)
        const { data, error } = await supabase
            .from('events')
            .select('*')
            .gte('event_date', today)
            .order('event_date', { ascending: true })
            .limit(limit);

        if (error) throw error;

        const result = data.map((item: any) => ({
            id: item.id,
            category: item.category || 'ceremony',
            type: item.type === 'APPOINTMENT' ? '일정' : item.type, // UI 표시용 한글화
            name: item.name,
            relation: item.relation,
            date: item.event_date,
            amount: item.amount,
            isReceived: item.is_received,
            memo: item.memo,
            isPaid: item.memo?.includes('[송금완료]') || false,
            isCompleted: item.is_completed,
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
        .select('*')
        .gte('event_date', today)
        .lt('event_date', tomorrow)
        .order('event_date', { ascending: true });

    // 2. Ledger (가계부)
    const { data: ledger } = await supabase
        .from('ledger')
        .select('*')
        .gte('transaction_date', today)
        .lt('transaction_date', tomorrow)
        .order('transaction_date', { ascending: true });

    // 3. Bank (이체)
    const { data: bank } = await supabase
        .from('bank_transactions')
        .select('*')
        .gte('transaction_date', today)
        .lt('transaction_date', tomorrow)
        .order('transaction_date', { ascending: true });

    const eventRecords = (events || []).map((item: any) => ({
        id: item.id,
        category: item.category || 'ceremony',
        type: item.type,
        name: item.name,
        relation: item.relation,
        date: item.event_date,
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
        date: item.transaction_date,
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
        date: item.transaction_date,
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

export async function getEvents(): Promise<EventRecord[]> {
    // 1. Fetch Events
    console.log('[getEvents] Fetching events table...');
    const { data: events, error: eventError } = await supabase
        .from('events')
        .select('*')
        .order('event_date', { ascending: true });
    console.log('[getEvents] Events fetched:', events?.length);

    // 2. Fetch Ledger
    console.log('[getEvents] Fetching ledger table...');
    const { data: ledger, error: ledgerError } = await supabase
        .from('ledger')
        .select('*')
        .order('transaction_date', { ascending: true });
    console.log('[getEvents] Ledger fetched:', ledger?.length);

    // 3. Fetch Bank Transactions
    console.log('[getEvents] Fetching bank_transactions table...');
    const { data: bank, error: bankError } = await supabase
        .from('bank_transactions')
        .select('*')
        .order('transaction_date', { ascending: true });
    console.log('[getEvents] Bank fetched:', bank?.length);

    if (eventError) console.error('Error fetching events:', eventError);
    if (ledgerError) console.error('Error fetching ledger:', ledgerError);
    if (bankError) console.error('Error fetching bank transactions:', bankError);

    const eventRecords = (events || []).map((item: any) => ({
        id: item.id,
        category: item.category || 'ceremony',
        type: item.type === 'APPOINTMENT' ? '일정' : item.type, // UI 표시용 한글화
        name: item.name,
        relation: item.relation,
        date: item.event_date,
        amount: item.amount,
        isReceived: item.is_received,
        memo: item.memo,
        isPaid: item.memo?.includes('[송금완료]') || false,
        isCompleted: item.is_completed,
        startTime: item.start_time,
        endTime: item.end_time,
        location: item.location,
        source: 'events' as const,
    }));

    const ledgerRecords = (ledger || []).map((item: any) => ({
        id: item.id,
        category: 'expense' as EventCategory,
        type: (item.category === '수입' || item.category === '입금') ? 'transfer' as const : 'receipt' as const,
        name: item.merchant_name || '결제',
        relation: item.category,
        date: item.transaction_date ? item.transaction_date.split('T')[0] : '',
        amount: item.amount,
        isReceived: (item.category === '수입' || item.category === '입금'),
        memo: item.memo || `[가계부] ${item.merchant_name}`,
        source: 'ledger' as const,
    }));

    const bankRecords = (bank || []).map((item: any) => ({
        id: item.id,
        category: 'expense' as EventCategory,
        type: 'transfer' as const,
        name: item.transaction_type === 'deposit' ? `${item.sender_name || '입금'} (입금)` : `${item.receiver_name || '송금'} (송금)`,
        relation: item.category, // '인맥', '용돈' 등
        date: item.transaction_date ? item.transaction_date.split('T')[0] : '',
        amount: item.amount,
        isReceived: item.transaction_type === 'deposit',
        memo: item.memo,
        source: 'bank_transactions' as const,
    }));

    // Merge and sort
    console.log('[getEvents] Merging and sorting...');
    const result = [...eventRecords, ...ledgerRecords, ...bankRecords].sort((a, b) => a.date.localeCompare(b.date));
    console.log('[getEvents] Returning result:', result.length);
    return result;
}

/**
 * 이벤트 삭제
 */
export async function deleteEvent(eventId: string) {
    console.log('[deleteEvent] Deleting event ID:', eventId);

    // UUID 형식 검증 (events 테이블은 UUID만 사용)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(eventId)) {
        console.error('Error deleting event: Invalid UUID format:', eventId);
        // Alert handled by caller usually, but throwing error ensures it propagates
        throw new Error(`잘못된 ID 형식입니다. 이 항목은 Supabase에서 직접 삭제해주세요. (ID: ${eventId})`);
    }

    const { error } = await supabase
        .from('events')
        .delete()
        .eq('id', eventId);

    if (error) {
        console.error('Error deleting event from Supabase:', error);
        throw error;
    }
    invalidateCache(); // ✅ 캐시 무효화
    console.log('[deleteEvent] Success');
    return { success: true };
}

export async function findPeopleByName(name: string): Promise<string[]> {
    const { data, error } = await supabase
        .from('events')
        .select('name')
        .ilike('name', `%${name}%`);

    if (error) {
        console.error('Error finding people:', error);
        return [];
    }

    // Return unique names
    const names = data.map((d: any) => d.name);
    return [...new Set(names)];
}

/**
 * Get all unique person names from the ledger.
 */
export async function getAllPeople(): Promise<string[]> {
    const { data, error } = await supabase
        .from('events')
        .select('name');

    if (error) {
        console.error('Error fetching all people:', error);
        return [];
    }

    const names = data.map((d: any) => d.name);
    // Filter out duplicates and empty names
    return [...new Set(names)].filter(Boolean).sort();
}

export async function saveEvent(record: Omit<EventRecord, 'id'>): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('로그인이 필요합니다.');

    const { error } = await supabase
        .from('events')
        .insert({
            user_id: user.id,
            type: record.type,
            name: record.name,
            relation: record.relation,
            event_date: record.date,
            amount: record.amount,
            is_received: record.isReceived
        });

    if (error) {
        console.error('Error saving event:', error);
        throw error;
    }
}
