import { supabase } from './client';
import { showError } from '../errorHandler';

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

        // Parallel Fetch using Promise.all
        const [
            { data: events, error: eventError },
            { data: ledger, error: ledgerError },
            { data: bank, error: bankError }
        ] = await Promise.all([
            supabase
                .from('events')
                .select('amount, type, is_received, memo')
                .gte('event_date', startDate)
                .lt('event_date', endDate),
            supabase
                .from('ledger')
                .select('amount, category')
                .gte('transaction_date', startDate)
                .lt('transaction_date', endDate),
            supabase
                .from('bank_transactions')
                .select('amount, transaction_type')
                .gte('transaction_date', startDate)
                .lt('transaction_date', endDate)
        ]);

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
