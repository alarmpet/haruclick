import { supabase } from './client';
import { showError } from '../errorHandler';

// Unified Definition:
// Total Spending = Events(Paid) + Ledger(Expenses) + Bank(Withdrawals)
// Pending = Events(Pending)

interface PeriodStats {
    totalGiven: number;
    pendingGiven: number;
    eventGivenPaid: number;
    ledgerGiven: number;
    bankGiven: number;
    totalReceived: number;
    diff: number;
    raw: {
        events: any[];
        ledger: any[];
        bank: any[];
    };
}

export async function fetchPeriodStats(startDate: string, endDate: string): Promise<PeriodStats> {
    try {
        // 0. Auth Check
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            console.log('Skipping stats fetch: No user');
            return { totalGiven: 0, pendingGiven: 0, eventGivenPaid: 0, ledgerGiven: 0, bankGiven: 0, totalReceived: 0, diff: 0, raw: { events: [], ledger: [], bank: [] } };
        }

        // Parallel Fetch with Server-side Filtering
        const [
            { data: events, error: eventError },
            { data: ledger, error: ledgerError },
            { data: bank, error: bankError }
        ] = await Promise.all([
            supabase
                .from('events')
                .select('amount, type, is_received, memo, event_date')
                .gte('event_date', startDate)
                .lt('event_date', endDate),
            supabase
                .from('ledger')
                .select('amount, category, category_group, transaction_date')
                .gte('transaction_date', startDate)
                .lt('transaction_date', endDate),
            supabase
                .from('bank_transactions')
                .select('amount, transaction_type, transaction_date')
                .gte('transaction_date', startDate)
                .lt('transaction_date', endDate)
        ]);

        if (eventError || ledgerError || bankError) {
            console.error('Error fetching stats:', eventError, ledgerError, bankError);
            throw new Error('데이터 조회 중 오류가 발생했습니다.');
        }

        // 1. Events (Paid vs Pending)
        // Paid: [송금완료] in memo (assuming is_received is false)
        const eventGivenPaid = events?.filter((e: any) =>
            !e.is_received && e.memo?.includes('[송금완료]')
        ).reduce((sum: number, e: any) => sum + (e.amount || 0), 0) || 0;

        // Pending: Not Sent yet
        const eventGivenPending = events?.filter((e: any) =>
            !e.is_received && !e.memo?.includes('[송금완료]')
        ).reduce((sum: number, e: any) => sum + (e.amount || 0), 0) || 0;

        const eventReceived = events?.filter((e: any) => e.is_received).reduce((sum: number, e: any) => sum + (e.amount || 0), 0) || 0;

        // 2. Ledger Given (Expenses)
        // Exclude Income/Deposit categories/groups
        const ledgerGiven = ledger?.filter((e: any) =>
            e.category_group !== 'income' &&
            e.category_group !== 'asset_transfer' &&
            e.category !== '수입' &&
            e.category !== '입금' &&
            e.category !== '이체' && // Assuming transfers are not spending
            e.category !== '저축'
        ).reduce((sum: number, e: any) => sum + (e.amount || 0), 0) || 0;

        const ledgerReceived = ledger?.filter((e: any) =>
            e.category_group === 'income' ||
            e.category === '수입' ||
            e.category === '입금'
        ).reduce((sum: number, e: any) => sum + (e.amount || 0), 0) || 0;

        // 3. Bank Given (Withdrawals)
        const bankGiven = bank?.filter((e: any) => e.transaction_type === 'withdrawal').reduce((sum: number, e: any) => sum + (e.amount || 0), 0) || 0;
        const bankReceived = bank?.filter((e: any) => e.transaction_type === 'deposit').reduce((sum: number, e: any) => sum + (e.amount || 0), 0) || 0;

        // 4. Totals (Unified Definition)
        // Spending = Event(Paid) + Ledger + Bank
        const totalGiven = eventGivenPaid + ledgerGiven + bankGiven;
        const pendingGiven = eventGivenPending;
        const totalReceived = eventReceived + ledgerReceived + bankReceived;

        return {
            totalGiven,
            pendingGiven,
            eventGivenPaid,
            ledgerGiven,
            bankGiven,
            totalReceived,
            diff: totalReceived - totalGiven,
            raw: {
                events: events || [],
                ledger: ledger || [],
                bank: bank || []
            }
        };
    } catch (e: any) {
        showError(e.message ?? '통계 조회 실패');
        return { totalGiven: 0, pendingGiven: 0, eventGivenPaid: 0, ledgerGiven: 0, bankGiven: 0, totalReceived: 0, diff: 0, raw: { events: [], ledger: [], bank: [] } };
    }
}

// Wrapper for backward compatibility or simple usage (Current Month)
export async function fetchUserStats(userId?: string) {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = (now.getMonth() + 1).toString().padStart(2, '0');
    const startDate = `${currentYear}-${currentMonth}-01`;

    const nextMonthDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const nextYear = nextMonthDate.getFullYear();
    const nextMonth = (nextMonthDate.getMonth() + 1).toString().padStart(2, '0');
    const endDate = `${nextYear}-${nextMonth}-01`;

    return fetchPeriodStats(startDate, endDate);
}
