import { showError } from './errorHandler';
import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { scheduleEventNotification } from './notifications';
import { classifyMerchant } from './CategoryClassifier';

// TODO: Replace with actual Env variables in .env file
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error('Missing Supabase Environment Variables!');
    throw new Error('Supabase URL or Key is missing. Check your .env file or EAS secrets.');
}

// ✅ AsyncStorage를 사용하여 세션 지속성 활성화 (네이티브 빌드 필수)
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false, // React Native에서는 URL 감지 비활성화
    },
});

// ========================================
// 🚀 In-Memory Cache for Performance
// ========================================
interface CacheEntry<T> {
    data: T;
    timestamp: number;
}

const CACHE_TTL_MS = 30000; // 30 seconds
const cache: Map<string, CacheEntry<any>> = new Map();

function getCached<T>(key: string): T | null {
    const entry = cache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
        cache.delete(key);
        return null;
    }
    return entry.data;
}

function setCache<T>(key: string, data: T): void {
    cache.set(key, { data, timestamp: Date.now() });
}

export function invalidateCache(prefix?: string): void {
    if (prefix) {
        for (const key of cache.keys()) {
            if (key.startsWith(prefix)) cache.delete(key);
        }
    } else {
        cache.clear();
    }
}

export async function testConnection() {
    try {
        const { data, error } = await supabase.from('events').select('count').limit(1);
        if (error) throw error;
        return { success: true, message: 'Connected to Supabase!' };
    } catch (e: any) {
        showError(e.message ?? 'Supabase 연결 실패');
        return { success: false, message: e.message };
    }
}

export async function fetchUserStats(userId?: string) {
    try {
        // 이번 달 데이터만 필터링
        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = (now.getMonth() + 1).toString().padStart(2, '0');
        const startDate = `${currentYear}-${currentMonth}-01`;
        const nextMonth = now.getMonth() === 11 ? 1 : now.getMonth() + 2;
        const nextYear = now.getMonth() === 11 ? currentYear + 1 : currentYear;
        const endDate = `${nextYear}-${nextMonth.toString().padStart(2, '0')}-01`;

        // 0. Auth Check
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            console.log('Skipping stats fetch: No user');
            return { totalGiven: 0, totalReceived: 0, pendingGiven: 0, diff: 0 };
        }

        // 1. Events (기존 경조사비) - memo 포함해서 송금완료 체크
        const { data: events, error: eventError } = await supabase
            .from('events')
            .select('amount, type, is_received, memo')
            .gte('event_date', startDate)
            .lt('event_date', endDate);

        // 2. Ledger (가계부/소비) - 이미 확정된 지출
        const { data: ledger, error: ledgerError } = await supabase
            .from('ledger')
            .select('amount, category')
            .gte('transaction_date', startDate)
            .lt('transaction_date', endDate);

        // 3. Bank Transactions (이체) - 이미 확정된 지출
        const { data: bank, error: bankError } = await supabase
            .from('bank_transactions')
            .select('amount, transaction_type')
            .gte('transaction_date', startDate)
            .lt('transaction_date', endDate);

        if (eventError || ledgerError || bankError) {
            console.error('Error fetching stats:', eventError, ledgerError, bankError);
            throw new Error('데이터 조회 중 오류가 발생했습니다.');
        }

        // A. Events - 송금완료 여부로 분리
        // 송금완료된 지출 (memo에 [송금완료] 포함)
        const eventGivenPaid = events?.filter((e: any) =>
            !e.is_received && e.memo?.includes('[송금완료]')
        ).reduce((sum: number, e: any) => sum + (e.amount || 0), 0) || 0;

        // 송금예정 (송금완료 안된 경조사비)
        const eventGivenPending = events?.filter((e: any) =>
            !e.is_received && !e.memo?.includes('[송금완료]')
        ).reduce((sum: number, e: any) => sum + (e.amount || 0), 0) || 0;

        const eventReceived = events?.filter((e: any) => e.is_received).reduce((sum: number, e: any) => sum + (e.amount || 0), 0) || 0;

        // B. Ledger Sum (이미 확정된 지출)
        const ledgerGiven = ledger?.filter((e: any) => e.category !== '수입' && e.category !== '입금').reduce((sum: number, e: any) => sum + (e.amount || 0), 0) || 0;
        const ledgerReceived = ledger?.filter((e: any) => e.category === '수입' || e.category === '입금').reduce((sum: number, e: any) => sum + (e.amount || 0), 0) || 0;

        // C. Bank Sum (이미 확정된 지출)
        const bankGiven = bank?.filter((e: any) => e.transaction_type === 'withdrawal').reduce((sum: number, e: any) => sum + (e.amount || 0), 0) || 0;
        const bankReceived = bank?.filter((e: any) => e.transaction_type === 'deposit').reduce((sum: number, e: any) => sum + (e.amount || 0), 0) || 0;

        // 확정 지출 = 송금완료 경조사비 + 가계부 + 은행이체
        const totalGiven = eventGivenPaid + ledgerGiven + bankGiven;
        // 지출예정 = 송금완료 안된 경조사비
        const pendingGiven = eventGivenPending;
        const totalReceived = eventReceived + ledgerReceived + bankReceived;

        console.log('[Stats Debug] Events Paid:', eventGivenPaid);
        console.log('[Stats Debug] Events Pending:', eventGivenPending);
        console.log('[Stats Debug] Ledger Given:', ledgerGiven);
        console.log('[Stats Debug] Bank Given:', bankGiven);
        console.log('[Stats Debug] Total Given:', totalGiven, 'Pending Given:', pendingGiven);

        return {
            totalGiven,
            totalReceived,
            pendingGiven,
            diff: totalReceived - totalGiven - pendingGiven
        };
    } catch (e: any) {
        showError(e.message ?? '사용자 통계 조회 실패');
        return { totalGiven: 0, totalReceived: 0, pendingGiven: 0, diff: 0 };
    }
}

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

export async function updateLedger(id: string, updates: any) {
    try {
        const { error } = await supabase.from('ledger').update(updates).eq('id', id);
        if (error) throw error;
        invalidateCache(); // ✅ 캐시 무효화
        return { error: null };
    } catch (e: any) {
        console.error('Error updating ledger:', e);
        showError(e.message ?? '가계부 업데이트 실패');
        return { error: e };
    }
}

export async function updateBankTransaction(id: string, updates: any) {
    try {
        const { error } = await supabase.from('bank_transactions').update(updates).eq('id', id);
        if (error) throw error;
        invalidateCache(); // ✅ 캐시 무효화
        return { error: null };
    } catch (e: any) {
        console.error('Error updating bank transaction:', e);
        showError(e.message ?? '거래내역 업데이트 실패');
        return { error: e };
    }
}

export async function updateUnifiedEvent(event: EventRecord, updates: any) {
    console.log('[updateUnifiedEvent]', event.source, event.id, updates);
    // 캐시 무효화
    invalidateCache();

    // source에 따라 분기
    if (event.source === 'ledger') {
        return updateLedger(event.id, updates);
    } else if (event.source === 'bank_transactions') {
        return updateBankTransaction(event.id, updates);
    } else {
        // events or external (external은 수정 불가 처리 체크할 것)
        return updateEvent(event.id, updates);
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

export type EventCategory = 'ceremony' | 'todo' | 'schedule' | 'expense';

export interface EventRecord {
    id: string;
    category: EventCategory;
    type: 'wedding' | 'funeral' | 'birthday' | 'other' | 'todo' | 'schedule' | 'gift' | 'transfer' | 'receipt';
    name: string;
    relation?: string;
    date: string;
    amount?: number;
    isReceived?: boolean;
    memo?: string;
    isPaid?: boolean;
    isCompleted?: boolean; // 할일 완료 여부
    startTime?: string; // 시작 시간
    endTime?: string; // 종료 시간
    location?: string; // 장소
    source: 'events' | 'ledger' | 'bank_transactions' | 'external'; // 데이터 출처 (삭제 시 사용)
    color?: string; // 캘린더 색상 (외부 일정 등)
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

/**
 * 가계부 내역 삭제
 */
export async function deleteLedgerItem(itemId: string) {
    const { error } = await supabase
        .from('ledger')
        .delete()
        .eq('id', itemId);

    if (error) {
        console.error('Error deleting ledger item:', error);
        throw error;
    }
    invalidateCache(); // ✅ 캐시 무효화
    return { success: true };
}

/**
 * 은행 거래 내역 삭제
 */
export async function deleteBankTransaction(itemId: string) {
    const { error } = await supabase
        .from('bank_transactions')
        .delete()
        .eq('id', itemId);

    if (error) {
        console.error('Error deleting bank transaction:', error);
        throw error;
    }
    invalidateCache(); // ✅ 캐시 무효화
    return { success: true };
}

/**
 * Find people with similar names in the events ledger.
 * This helps in linking new gifticons to existing contacts.
 */
import { ScannedData, StorePaymentResult, BankTransactionResult, InvitationResult, GifticonResult, TransferResult, ReceiptResult, BillResult, SocialResult, AppointmentResult } from './ai/OpenAIService';

/**
 * AI에서 반환된 날짜 형식 (예: "2023-01-11 18:35")을 
 * Supabase timestamp 형식 (ISO 8601)으로 변환합니다.
 * 연도가 과거(2024 이전)이면 현재 연도로 자동 변환합니다.
 */
function toISODate(dateStr: string | undefined): string {
    if (!dateStr) return new Date().toISOString();

    // "YYYY-MM-DD HH:mm" 형식을 "YYYY-MM-DDTHH:mm:00" ISO 형식으로 변환
    const cleaned = dateStr.replace(' ', 'T');

    // 유효한 날짜인지 확인
    let parsed = new Date(cleaned);
    if (isNaN(parsed.getTime())) {
        console.warn('[toISODate] 날짜 파싱 실패:', dateStr, '-> 현재 시간 사용');
        return new Date().toISOString();
    }

    // 연도가 2024 이전이면 현재 연도로 변환 (AI가 연도를 잘못 추측하는 경우 대비)
    const currentYear = new Date().getFullYear();
    if (parsed.getFullYear() < 2024) {
        console.warn('[toISODate] 과거 연도 감지:', parsed.getFullYear(), '-> 현재 연도로 변환:', currentYear);
        parsed.setFullYear(currentYear);
    }

    return parsed.toISOString();
}

export async function saveUnifiedEvent(
    data: ScannedData,
    imageUrl?: string,
    options?: {
        recurrence?: string;
        alarmMinutes?: number;
        category?: string;
        startTime?: string;
        endTime?: string;
        isAllDay?: boolean;
    }
): Promise<void> {
    console.log('[saveUnifiedEvent] 함수 시작', options);
    try {
        console.log('[saveUnifiedEvent] getUser 호출 중...');

        let userId: string | null = null;
        try {
            const userPromise = supabase.auth.getUser();
            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('getUser timeout')), 5000)
            );
            const { data: { user } } = await Promise.race([userPromise, timeoutPromise]) as any;
            userId = user?.id || null;
        } catch (authError) {
            console.warn('[saveUnifiedEvent] getUser 실패 또는 타임아웃:', authError);
            userId = null;
        }

        console.log('[saveUnifiedEvent] 저장 시작:', data.type, '유저:', userId ? '로그인됨' : '비로그인');

        if (!userId) {
            throw new Error('로그인이 필요합니다. 다시 로그인해주세요.');
        }

        if (data.type === 'APPOINTMENT' || data.type === 'UNKNOWN') {
            // ✅ Handle APPOINTMENT (Schedule/Todo)
            const appointment = data as AppointmentResult;
            console.log('[saveUnifiedEvent] APPOINTMENT 저장 시작:', appointment.title || '제목 없음');

            // Safe date conversion: Ensure we don't pick up just a time string
            let eventDateStr = appointment.date;
            if (!eventDateStr && options?.startTime && options.startTime.includes('T')) {
                eventDateStr = options.startTime.split('T')[0];
            } else if (!eventDateStr) {
                eventDateStr = new Date().toISOString().split('T')[0];
            }

            const safeEventDate = toISODate(eventDateStr).split('T')[0];

            const { error } = await supabase.from('events').insert({
                user_id: userId,
                name: appointment.title || '일정',
                event_date: safeEventDate,
                type: data.type === 'UNKNOWN' ? 'OTHER' : 'APPOINTMENT',
                category: options?.category || 'schedule',
                location: appointment.location || (options?.category === 'todo' ? undefined : ''),
                memo: appointment.memo || '',
                start_time: options?.startTime || null,
                end_time: options?.endTime || null,
                is_all_day: options?.isAllDay || false,
                recurrence_rule: options?.recurrence || 'none', // Fixed column name from recurrence to recurrence_rule
                alarm_minutes: options?.alarmMinutes,
            });

            if (error) throw error;
        } else if (data.type === 'INVITATION') {
            const invite = data as InvitationResult;
            console.log('[saveUnifiedEvent] INVITATION 저장 시작:', JSON.stringify({
                eventDate: invite.eventDate,
                eventType: invite.eventType,
                senderName: invite.senderName,
                eventLocation: invite.eventLocation,
                recommendedAmount: invite.recommendedAmount,
                relation: invite.relation
            }));

            // ✅ 날짜 유효성 검사
            if (!invite.eventDate || invite.eventDate === '날짜 없음') {
                throw new Error('청첩장에 유효한 날짜 정보가 없습니다. 날짜를 직접 입력해주세요.');
            }

            // ✅ 안전한 날짜 변환 (toISODate 헬퍼 사용)
            const safeEventDate = toISODate(invite.eventDate).split('T')[0];
            console.log('[saveUnifiedEvent] 변환된 날짜:', safeEventDate);

            // Recurrence Setup
            const groupId = options?.recurrence && options.recurrence !== 'none'
                ? Math.random().toString(36).substring(2, 15)
                : null;
            let repeatCount = 1;
            if (options?.recurrence) {
                if (options.recurrence === 'daily') repeatCount = 30;
                else if (options.recurrence === 'weekly') repeatCount = 20;
                else if (options.recurrence === 'monthly') repeatCount = 12;
                else if (options.recurrence === 'yearly') repeatCount = 5;
            }

            for (let i = 0; i < repeatCount; i++) {
                // 날짜 계산
                const currentDate = new Date(safeEventDate);
                if (i > 0) {
                    if (options?.recurrence === 'daily') currentDate.setDate(currentDate.getDate() + i);
                    else if (options?.recurrence === 'weekly') currentDate.setDate(currentDate.getDate() + i * 7);
                    else if (options?.recurrence === 'monthly') currentDate.setMonth(currentDate.getMonth() + i);
                    else if (options?.recurrence === 'yearly') currentDate.setFullYear(currentDate.getFullYear() + i);
                }
                const currentDateStr = currentDate.toISOString().split('T')[0];

                const resolvedName =
                    invite.senderName ||
                    invite.mainName ||
                    invite.hostNames?.[0] ||
                    invite.eventLocation ||
                    '이름 없음';
                const insertData = {
                    user_id: userId,
                    type: invite.eventType || 'wedding',
                    name: resolvedName,
                    event_date: currentDateStr,
                    location: invite.eventLocation,
                    image_url: imageUrl,
                    amount: invite.recommendedAmount || 0,
                    relation: invite.relation || '지인',
                    is_received: false,
                    recurrence_rule: options?.recurrence || null,
                    group_id: groupId,
                    alarm_minutes: options?.alarmMinutes || null,
                    start_time: options?.startTime || null,
                    end_time: options?.endTime || null,
                    is_all_day: options?.isAllDay ?? false
                };
                console.log('[saveUnifiedEvent] INSERT 데이터:', JSON.stringify(insertData));

                const { error: eventError } = await supabase.from('events').insert(insertData);

                if (eventError) {
                    console.error('[saveUnifiedEvent] INVITATION INSERT 실패:', eventError);
                    throw new Error(`청첩장 저장 실패: ${eventError.message || eventError.code || JSON.stringify(eventError)}`);
                }

                // 알림 스케줄링 (20개까지만 제한)
                if (options?.alarmMinutes && i < 20) {
                    await scheduleEventNotification(
                        invite.senderName || invite.mainName || '일정',
                        currentDateStr,
                        undefined, // TODO: 시간 정보가 있다면 여기에 추가
                        options.alarmMinutes
                    );
                }
            }
            console.log('[saveUnifiedEvent] INVITATION 저장 완료');
        }

        if (data.type === 'GIFTICON') {
            const gift = data as GifticonResult;
            console.log('[saveUnifiedEvent] gifticons 테이블 INSERT 시도...');
            const { error: giftError } = await supabase.from('gifticons').insert({
                user_id: userId,
                product_name: gift.productName,
                sender_name: gift.senderName,
                expiry_date: gift.expiryDate,
                image_url: imageUrl,
                estimated_price: gift.estimatedPrice,
                status: 'available'
            });
            if (giftError) throw giftError;

            const { error: eventError } = await supabase.from('events').insert({
                user_id: userId,
                type: 'gift',
                name: gift.senderName,
                event_date: new Date().toISOString(),
                amount: gift.estimatedPrice,
                is_received: true,
                memo: `[기프티콘] ${gift.productName}`
            });
            if (eventError) throw eventError;

        } else if (data.type === 'STORE_PAYMENT') {
            const pay = data as StorePaymentResult;
            console.log('[saveUnifiedEvent] ledger 테이블 INSERT 시도...');
            const { error } = await supabase.from('ledger').insert({
                user_id: userId,
                transaction_date: toISODate(pay.date),
                amount: pay.amount,
                merchant_name: pay.merchant,
                category: pay.category || classifyMerchant(pay.merchant),
                sub_category: (pay as any).subCategory,
                image_url: imageUrl,
                memo: (pay as any).memo || `[자동분류] ${pay.category}${(pay as any).subCategory ? ' > ' + (pay as any).subCategory : ''}`,
                raw_text: JSON.stringify(data)
            });
            if (error) throw error;
            console.log('[saveUnifiedEvent] ledger INSERT 성공!');


        } else if (data.type === 'BANK_TRANSFER') {
            const trans = data as BankTransactionResult;

            if ((trans as any).isUtility) {
                // 공과금/고정지출 -> Ledger로 저장
                const { error } = await supabase.from('ledger').insert({
                    user_id: userId,
                    transaction_date: toISODate(trans.date),
                    amount: trans.amount,
                    merchant_name: trans.targetName,
                    category: (trans as any).category || (classifyMerchant(trans.targetName) === '기타' ? '고정지출' : classifyMerchant(trans.targetName)),
                    sub_category: (trans as any).subCategory,
                    image_url: imageUrl,
                    memo: `[공과금] ${trans.transactionType === 'deposit' ? '입금' : '출금'}`,
                    raw_text: JSON.stringify(data)
                });
                if (error) throw error;
            } else {
                // 순수 이체/인맥 거래 -> Bank Transactions로 저장
                const { error } = await supabase.from('bank_transactions').insert({
                    user_id: userId,
                    transaction_date: toISODate(trans.date),
                    amount: trans.amount,
                    transaction_type: trans.transactionType,
                    sender_name: trans.transactionType === 'deposit' ? trans.targetName : null,
                    receiver_name: trans.transactionType === 'withdrawal' ? trans.targetName : null,
                    balance_after: trans.balanceAfter,
                    category: (trans as any).category || '인맥',
                    sub_category: (trans as any).subCategory,
                    memo: trans.memo || (trans.transactionType === 'deposit' ? `${trans.targetName} 입금` : `${trans.targetName} 송금`),
                    raw_text: JSON.stringify(data)
                });
                if (error) throw error;
            }

        } else if ((data as any).type === 'TRANSFER') {
            const transfer = data as unknown as TransferResult;
            const { error } = await supabase.from('ledger').insert({
                user_id: userId,
                transaction_date: new Date().toISOString(),
                amount: transfer.amount,
                merchant_name: transfer.senderName,
                category: (transfer as any).isReceived ? '수입' : '이체',
                memo: (transfer as any).memo || `[송금] ${(transfer as any).isReceived ? '받음' : '보냄'}`,
                image_url: imageUrl
            });
            if (error) throw error;


            // ===================================
            // 4. 기존: 영수증 (RECEIPT) -> Ledger (Legacy support)
            // ===================================
        } else if ((data as any).type === 'RECEIPT') {
            const receipt = data as unknown as ReceiptResult;
            const { error } = await supabase.from('ledger').insert({
                user_id: userId,
                transaction_date: receipt.date || new Date().toISOString(),
                amount: receipt.amount,
                merchant_name: receipt.merchant,
                category: receipt.category || classifyMerchant(receipt.merchant),
                sub_category: (receipt as any).subCategory, // ✅ 소분류 추가
                image_url: imageUrl,
                memo: `[자동입력] ${receipt.category || classifyMerchant(receipt.merchant)}`
            });
            if (error) throw error;

        } else if (data.type === 'BILL') {
            const bill = data as BillResult;
            const { error } = await supabase.from('events').insert({
                user_id: userId,
                type: 'todo',
                name: bill.title,
                event_date: bill.dueDate,
                amount: bill.amount,
                is_received: false,
                category: 'todo',
                memo: `[고지서] 가상계좌: ${bill.virtualAccount || '미입력'}`,
                is_completed: false
            });
            if (error) throw error;

        } else if (data.type === 'SOCIAL') {
            const social = data as SocialResult;
            const { error } = await supabase.from('ledger').insert({
                user_id: userId,
                transaction_date: social.date || new Date().toISOString(),
                amount: social.amount,
                merchant_name: social.location || '모임 장소',
                category: '식비',
                image_url: imageUrl,
                memo: `[인맥지출] 멤버: ${social.members.join(', ')}`
            });
            if (error) throw error;

        }

    } catch (e) {
        console.error("Unified Save Error:", e);
        throw e;
    }

    // ✅ Invalidate cache after successful save
    invalidateCache();
    console.log('[saveUnifiedEvent] Cache invalidated');
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

export interface GifticonRecord {
    productName: string;
    senderName?: string;
    expiryDate: string;
    imageUrl?: string;
    status: 'available' | 'used';
    estimatedPrice: number;
    barcode_number?: string;
}

/**
 * 기프티콘만 저장 (gifticons 테이블)
 * ✅ 수정: events 테이블 중복 저장 제거
 * - 통합 저장이 필요하면 saveUnifiedEvent(GIFTICON) 사용
 * - 이 함수는 gifticons 테이블에만 저장
 */
export async function saveGifticon(record: GifticonRecord): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('로그인이 필요합니다.');

    const { error } = await supabase
        .from('gifticons')
        .insert({
            user_id: user.id,
            product_name: record.productName,
            sender_name: record.senderName,
            expiry_date: record.expiryDate,
            image_url: record.imageUrl,
            status: record.status,
            estimated_price: record.estimatedPrice || 0,
            barcode_number: record.barcode_number
        });

    if (error) {
        console.error('Error saving gifticon:', error);
        throw error;
    }

    // ⚠️ 중복 저장 방지: events 테이블 저장은 saveUnifiedEvent에서만 처리
    // 인맥 장부 연동이 필요하면 saveUnifiedEvent(GIFTICON, data, uri) 호출 권장
}

interface GifticonRow {
    id: string;
    product_name: string;
    sender_name: string | null;
    expiry_date: string;
    image_url: string | null;
    status: 'available' | 'used';
    estimated_price: number;
    barcode_number?: string | null;
}

export interface GifticonItem {
    id: string;
    productName: string;
    senderName?: string;
    expiryDate: string;
    imageUrl?: string;
    status: 'available' | 'used';
    estimatedPrice: number;
    barcodeNumber?: string;
}

export async function getGifticons(status?: GifticonItem['status']): Promise<GifticonItem[]> {
    let query = supabase
        .from('gifticons')
        .select('*')
        .order('expiry_date', { ascending: true });

    if (status) {
        query = query.eq('status', status);
    }

    const { data, error } = await query;

    if (error) {
        console.error('Error fetching gifticons:', error);
        return [];
    }

    const rows = (data || []) as GifticonRow[];
    return rows.map((row) => ({
        id: row.id,
        productName: row.product_name,
        senderName: row.sender_name || undefined,
        expiryDate: row.expiry_date,
        imageUrl: row.image_url || undefined,
        status: row.status,
        estimatedPrice: row.estimated_price,
        barcodeNumber: row.barcode_number || undefined,
    }));
}
