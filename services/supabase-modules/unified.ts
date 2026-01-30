import { supabase, invalidateUserScopedCache } from './client';
import { scheduleEventNotification } from '../notifications';
import { classifyMerchant } from '../CategoryClassifier';
import { validateCategory } from '../CategoryValidator';
import { ScannedData, StorePaymentResult, BankTransactionResult, InvitationResult, TransferResult, ReceiptResult, BillResult, SocialResult, AppointmentResult } from '../ai/OpenAIService';
import { CATEGORY_MAP, CategoryGroupType } from '../../constants/categories';

/**
 * AI returns date format (e.g. "2023-01-11 18:35").
 * Convert to Supabase timestamp format (ISO 8601).
 * If year is past (before 2024), convert to current year.
 */
function toISODate(dateStr: string | undefined): string {
    if (!dateStr) return new Date().toISOString();

    // Convert "YYYY-MM-DD HH:mm" to "YYYY-MM-DDTHH:mm:00" ISO format
    const cleaned = dateStr.replace(' ', 'T');

    // Check if date is valid
    let parsed = new Date(cleaned);
    if (isNaN(parsed.getTime())) {
        console.warn('[toISODate] Date parsing failed:', dateStr, '-> Using current time');
        return new Date().toISOString();
    }

    // If year is before 2024, convert to current year (AI often guesses year wrong)
    const currentYear = new Date().getFullYear();
    if (parsed.getFullYear() < 2024) {
        console.warn('[toISODate] Past year detected:', parsed.getFullYear(), '-> Converting to current year', currentYear);
        parsed.setFullYear(currentYear);
    }

    return parsed.toISOString();
}

function splitDateTime(dateStr?: string): { date: string; time?: string | null } {
    const raw = (dateStr || '').trim();
    if (!raw) {
        return { date: new Date().toISOString().split('T')[0], time: null };
    }

    const match = raw.match(/(\d{2,4}[./-]\d{1,2}[./-]\d{1,2})(?:[ Tt]*(\d{1,2}:\d{2}))?/);
    if (match) {
        let datePart = match[1].replace(/[./]/g, '-');
        if (/^\d{2}-/.test(datePart) && !/^\d{4}-/.test(datePart)) {
            datePart = `20${datePart}`;
        }
        const timePart = match[2] ?? null;
        const normalizedDate = toISODate(datePart).split('T')[0];
        return { date: normalizedDate, time: timePart };
    }

    const iso = toISODate(raw);
    const [datePart] = iso.split('T');
    const timePart = raw.match(/(\d{1,2}:\d{2})/)?.[1] ?? null;
    return { date: datePart, time: timePart };
}

/**
 * Helper function to determine category group
 */
function determineCategoryGroup(category: string | undefined, type?: string): CategoryGroupType {
    if (!category) return 'variable_expense'; // Default

    // 1. Check direct mapping
    if (CATEGORY_MAP[category]) {
        return CATEGORY_MAP[category].group;
    }

    // 2. Keyword-based group inference
    if (category.includes('수입') || category.includes('입금') || category.includes('급여')) return 'income';
    if (category.includes('이체') || category.includes('송금') || category.includes('자산')) return 'asset_transfer';
    if (category.includes('고정') || category.includes('공과금') || category.includes('세금')) return 'fixed_expense';

    return 'variable_expense';
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
        categoryGroup?: CategoryGroupType;
        isReceived?: boolean;
    }
): Promise<void> {
    console.log('[saveUnifiedEvent] Function start', options);
    let userId: string | null = null;
    try {
        console.log('[saveUnifiedEvent] Calling getUser...');

        try {
            const userPromise = supabase.auth.getUser();
            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('getUser timeout')), 5000)
            );
            const { data: { user } } = await Promise.race([userPromise, timeoutPromise]) as any;
            userId = user?.id || null;
        } catch (authError) {
            console.warn('[saveUnifiedEvent] getUser failed or timeout', authError);
            userId = null;
        }

        console.log('[saveUnifiedEvent] Save start:', data.type, 'User:', userId ? 'Logged in' : 'Not logged in');

        if (!userId) {
            throw new Error('로그인이 필요합니다. 다시 로그인해주세요.');
        }

        if (data.type === 'APPOINTMENT' || data.type === 'UNKNOWN') {
            // Handle APPOINTMENT (Schedule/Todo)
            const appointment = data as AppointmentResult;
            console.log('[saveUnifiedEvent] APPOINTMENT Save start:', appointment.title || 'No title');

            // Safe date conversion: Ensure we don't pick up just a time string
            let eventDateStr = appointment.date;
            if (!eventDateStr && options?.startTime && options.startTime.includes('T')) {
                eventDateStr = options.startTime.split('T')[0];
            } else if (!eventDateStr) {
                eventDateStr = new Date().toISOString().split('T')[0];
            }

            const { date: safeEventDate, time: parsedTime } = splitDateTime(eventDateStr);
            const resolvedStartTime = options?.startTime || parsedTime || null;
            const resolvedEndTime = options?.endTime || null;

            const { error } = await supabase.from('events').insert({
                user_id: userId,
                name: appointment.title || '일정',
                event_date: safeEventDate,
                type: data.type === 'UNKNOWN' ? 'OTHER' : 'APPOINTMENT',
                category: options?.category || 'schedule',
                location: appointment.location || (options?.category === 'todo' ? undefined : ''),
                memo: appointment.memo || '',
                start_time: resolvedStartTime,
                end_time: resolvedEndTime,
                is_all_day: options?.isAllDay || false,
                recurrence_rule: options?.recurrence || 'none', // Fixed column name from recurrence to recurrence_rule
                alarm_minutes: options?.alarmMinutes,
            });

            if (error) throw error;

            // ✅ APPOINTMENT 알림 스케줄링 (0 포함)
            if (options?.alarmMinutes != null) {
                await scheduleEventNotification(
                    appointment.title || '일정',
                    safeEventDate,
                    resolvedStartTime ?? undefined,
                    options.alarmMinutes
                );
            }
        } else if (data.type === 'INVITATION') {
            const invite = data as InvitationResult;
            console.log('[saveUnifiedEvent] INVITATION Save start:', JSON.stringify({
                eventDate: invite.eventDate,
                eventType: invite.eventType,
                senderName: invite.senderName,
                eventLocation: invite.eventLocation,
                recommendedAmount: invite.recommendedAmount,
                relation: invite.relation
            }));

            // Date validation check
            if (!invite.eventDate || invite.eventDate === '날짜 없음') {
                throw new Error('청첩장에 유효한 날짜 정보가 없습니다. 날짜를 직접 입력해주세요.');
            }

            // Safe date conversion (use toISODate helper)
            const { date: safeEventDate, time: parsedTime } = splitDateTime(invite.eventDate);
            const resolvedStartTime = options?.startTime || parsedTime || null;
            const resolvedEndTime = options?.endTime || null;
            console.log('[saveUnifiedEvent] Converted date:', safeEventDate);

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
                // Date calculation
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
                    alarm_minutes: options?.alarmMinutes ?? null,
                    start_time: resolvedStartTime,
                    end_time: resolvedEndTime,
                    is_all_day: options?.isAllDay ?? false
                };
                console.log('[saveUnifiedEvent] INSERT data:', JSON.stringify(insertData));

                const { error: eventError } = await supabase.from('events').insert(insertData);

                if (eventError) {
                    console.error('[saveUnifiedEvent] INVITATION INSERT Failed:', eventError);
                    throw new Error(`청첩장 저장 실패: ${eventError.message || eventError.code || JSON.stringify(eventError)}`);
                }

                // Schedule alarm (Limit to 20)
                if (options?.alarmMinutes != null && i < 20) {
                    await scheduleEventNotification(
                        invite.senderName || invite.mainName || '일정',
                        currentDateStr,
                        resolvedStartTime || undefined,
                        options.alarmMinutes
                    );
                }
            }
            console.log('[saveUnifiedEvent] INVITATION Save complete');
        }

        if (data.type === 'STORE_PAYMENT') {
            const pay = data as StorePaymentResult;
            console.log('[saveUnifiedEvent] ledger Table INSERT attempt...');
            const rawCategory = pay.category || classifyMerchant(pay.merchant);
            const validated = validateCategory(rawCategory, (pay as any).subCategory);

            const { error } = await supabase.from('ledger').insert({
                user_id: userId,
                transaction_date: toISODate(pay.date),
                amount: pay.amount || 0, // Default to 0 if missing (Voice/Text fallback)
                merchant_name: pay.merchant,
                category: validated.category,
                sub_category: validated.subCategory,
                category_group: validated.categoryGroup,
                image_url: imageUrl,
                memo: (pay as any).memo || `[자동분류] ${validated.category}${validated.subCategory ? ' > ' + validated.subCategory : ''}`,
                raw_text: JSON.stringify(data)
            });
            if (error) throw error;
            console.log('[saveUnifiedEvent] ledger INSERT Success!');


        } else if (data.type === 'BANK_TRANSFER') {
            // FIX: Prevent block splitting leading to wrong type detection? No, handled in ocr.ts
            const trans = data as BankTransactionResult;

            if ((trans as any).isUtility) {
                // Utilities/Fixed Expenses -> Ledger
                const rawCategory = (trans as any).category || (classifyMerchant(trans.targetName) === '기타' ? '주거/통신/광열' : classifyMerchant(trans.targetName));
                const validated = validateCategory(rawCategory, (trans as any).subCategory);

                const { error } = await supabase.from('ledger').insert({
                    user_id: userId,
                    transaction_date: toISODate(trans.date),
                    amount: trans.amount,
                    merchant_name: trans.targetName,
                    category: validated.category,
                    sub_category: validated.subCategory,
                    category_group: validated.categoryGroup,
                    image_url: imageUrl,
                    memo: `[공과금] ${trans.transactionType === 'deposit' ? '입금' : '출금'}`,
                    raw_text: JSON.stringify(data)
                });
                if (error) throw error;
            } else {
                // Personal Transfer/Remittance -> Bank Transactions
                const { error } = await supabase.from('bank_transactions').insert({
                    user_id: userId,
                    transaction_date: toISODate(trans.date),
                    amount: trans.amount,
                    transaction_type: trans.transactionType,
                    sender_name: trans.transactionType === 'deposit' ? trans.targetName : null,
                    receiver_name: trans.transactionType === 'withdrawal' ? trans.targetName : null,
                    balance_after: trans.balanceAfter,
                    category: (trans as any).category || '이체',
                    sub_category: (trans as any).subCategory,
                    memo: trans.memo || (trans.transactionType === 'deposit' ? `${trans.targetName} 입금` : `${trans.targetName} 송금`),
                    raw_text: JSON.stringify(data)
                });
                if (error) throw error;
            }

        } else if ((data as any).type === 'TRANSFER') {
            const transfer = data as unknown as TransferResult;
            const category = (transfer as any).isReceived ? '수입' : '이체';
            const categoryGroup = (transfer as any).isReceived ? 'income' : 'asset_transfer';

            const { error } = await supabase.from('ledger').insert({
                user_id: userId,
                transaction_date: new Date().toISOString(),
                amount: transfer.amount,
                merchant_name: transfer.senderName,
                category: category,
                category_group: categoryGroup, // New field
                memo: (transfer as any).memo || `[송금] ${(transfer as any).isReceived ? '받음' : '보냄'}`,
                image_url: imageUrl
            });
            if (error) throw error;


            // ===================================
            // 4. Legacy: Receipt -> Ledger
            // ===================================
        } else if ((data as any).type === 'RECEIPT') {
            const receipt = data as unknown as ReceiptResult;
            const category = receipt.category || classifyMerchant(receipt.merchant);
            const categoryGroup = (receipt as any).categoryGroup || determineCategoryGroup(category);

            const { error } = await supabase.from('ledger').insert({
                user_id: userId,
                transaction_date: receipt.date || new Date().toISOString(),
                amount: receipt.amount,
                merchant_name: receipt.merchant,
                category: category,
                sub_category: (receipt as any).subCategory, // Add subCategory
                category_group: categoryGroup, // New field
                image_url: imageUrl,
                memo: `[자동입력] ${category}`
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
                memo: `[고지서 가상계좌 ${bill.virtualAccount || '미입력'}]`,
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
                category_group: 'variable_expense', // Default for social meal
                image_url: imageUrl,
                memo: `[소셜/지출] 멤버: ${social.members.join(', ')}`
            });
            if (error) throw error;

        }

    } catch (e) {
        console.error("Unified Save Error:", e);
        throw e;
    }

    // Invalidate cache after successful save
    invalidateUserScopedCache(['upcoming_', 'stats_'], userId);
    console.log('[saveUnifiedEvent] Cache invalidated');
}
