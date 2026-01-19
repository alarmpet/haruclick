import { supabase, invalidateCache } from './client';
import { showError } from '../errorHandler';
import { updateEvent } from './events';
import { EventRecord } from './types';

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
