import { supabase, invalidateUserScopedCache } from './client';
import { showError } from '../errorHandler';
import { updateEvent, deleteEvent } from './events';
import { EventRecord } from './types';

function formatTimezoneOffset(date: Date) {
    const offsetMinutes = -date.getTimezoneOffset();
    const sign = offsetMinutes >= 0 ? '+' : '-';
    const abs = Math.abs(offsetMinutes);
    const hours = String(Math.floor(abs / 60)).padStart(2, '0');
    const minutes = String(abs % 60).padStart(2, '0');
    return `${sign}${hours}:${minutes}`;
}

function buildTransactionDate(dateStr?: string, timeStr?: string | null) {
    const date = (dateStr || new Date().toISOString().split('T')[0]).split('T')[0];
    if (!timeStr) return date;
    const normalizedTime = timeStr.length === 5 ? `${timeStr}:00` : timeStr;
    const base = `${date}T${normalizedTime}`;
    const offset = formatTimezoneOffset(new Date(base));
    return `${base}${offset}`;
}

export async function updateLedger(id: string, updates: any) {
    try {
        const { error } = await supabase.from('ledger').update(updates).eq('id', id);
        if (error) throw error;
        const { data: { user } } = await supabase.auth.getUser();
        invalidateUserScopedCache(['stats_'], user?.id);
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
        const { data: { user } } = await supabase.auth.getUser();
        invalidateUserScopedCache(['stats_'], user?.id);
        return { error: null };
    } catch (e: any) {
        console.error('Error updating bank transaction:', e);
        showError(e.message ?? '거래내역 업데이트 실패');
        return { error: e };
    }
}

export async function deleteLedgerItem(itemId: string) {
    const { error } = await supabase
        .from('ledger')
        .delete()
        .eq('id', itemId);

    if (error) {
        console.error('Error deleting ledger item:', error);
        throw error;
    }
    const { data: { user } } = await supabase.auth.getUser();
    invalidateUserScopedCache(['stats_'], user?.id);
    return { success: true };
}

export async function deleteBankTransaction(itemId: string) {
    const { error } = await supabase
        .from('bank_transactions')
        .delete()
        .eq('id', itemId);

    if (error) {
        console.error('Error deleting bank transaction:', error);
        throw error;
    }
    const { data: { user } } = await supabase.auth.getUser();
    invalidateUserScopedCache(['stats_'], user?.id);
    return { success: true };
}

export async function updateUnifiedEvent(event: EventRecord, updates: any) {
    console.log('[updateUnifiedEvent]', event.source, event.id, updates);
    if (event.source === 'ledger') {
        const sanitized: any = {};

        const allowed = new Set([
            'transaction_date',
            'amount',
            'merchant_name',
            'category',
            'sub_category',
            'category_group',
            'income_type',
            'asset_type',
            'image_url',
            'memo',
            'raw_text',
        ]);

        Object.keys(updates || {}).forEach((key) => {
            if (allowed.has(key)) {
                sanitized[key] = updates[key];
            }
        });

        if (!sanitized.merchant_name && updates.name) {
            sanitized.merchant_name = updates.name;
        }

        const updateType = updates.type;
        const updateCategory = updates.category;
        const fallbackCategory = event.relation || updateCategory;
        const isUiCategory = updateCategory && ['expense', 'income', 'schedule', 'todo', 'ceremony'].includes(updateCategory);

        if (updateType && !['receipt', 'transfer'].includes(updateType)) {
            sanitized.category = updateType;
        } else if (updateCategory && !isUiCategory) {
            sanitized.category = updateCategory;
        } else if (fallbackCategory) {
            sanitized.category = fallbackCategory;
        }

        if (!sanitized.transaction_date) {
            const timeCandidate = updates.start_time || updates.startTime || null;
            if (updates.event_date || timeCandidate) {
                sanitized.transaction_date = buildTransactionDate(
                    updates.event_date || event.date,
                    timeCandidate
                );
            }
        } else {
            const hasTime = /\d{1,2}:\d{2}/.test(String(sanitized.transaction_date));
            const timeCandidate = updates.start_time || updates.startTime || null;
            if (!hasTime && timeCandidate) {
                sanitized.transaction_date = buildTransactionDate(
                    String(sanitized.transaction_date).split('T')[0],
                    timeCandidate
                );
            }
        }

        return updateLedger(event.id, sanitized);
    }

    if (event.source === 'bank_transactions') {
        return updateBankTransaction(event.id, updates);
    }

    if (updates?.category === 'expense') {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
                throw new Error('로그인이 필요합니다.');
            }

            const transaction_date = buildTransactionDate(
                updates.event_date || event.date,
                updates.start_time || updates.startTime || null
            );

            const { error: insertError } = await supabase.from('ledger').insert({
                user_id: user.id,
                transaction_date,
                amount: updates.amount ?? 0,
                merchant_name: updates.name || event.name,
                category: updates.type || updates.category_name || '기타',
                sub_category: updates.sub_category || null,
                category_group: updates.category_group || 'variable_expense',
                memo: updates.memo || '',
            });

            if (insertError) throw insertError;

            await deleteEvent(event.id);
            return { error: null };
        } catch (e: any) {
            console.error('Error converting event to ledger:', e);
            showError(e.message ?? '가계부로 전환 실패');
            return { error: e };
        }
    }

    const allowedEventFields = new Set([
        'name',
        'event_date',
        'memo',
        'amount',
        'type',
        'category',
        'relation',
        'location',
        'start_time',
        'end_time',
        'is_all_day',
    ]);
    const sanitizedUpdates: any = {};
    Object.keys(updates || {}).forEach((key) => {
        if (allowedEventFields.has(key)) {
            sanitizedUpdates[key] = updates[key];
        }
    });

    return updateEvent(event.id, sanitizedUpdates);
}
