import { supabase, invalidateCache } from './client';
import { scheduleEventNotification } from '../notifications';
import { classifyMerchant } from '../CategoryClassifier';
import { ScannedData, StorePaymentResult, BankTransactionResult, InvitationResult, GifticonResult, TransferResult, ReceiptResult, BillResult, SocialResult, AppointmentResult } from '../ai/OpenAIService';
import { CATEGORY_MAP, CategoryGroupType } from '../../constants/categories';

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

/**
 * 카테고리 그룹을 결정하는 헬퍼 함수
 */
function determineCategoryGroup(category: string | undefined, type?: string): CategoryGroupType {
    if (!category) return 'variable_expense'; // Default

    // 1. 직접 매핑 확인
    if (CATEGORY_MAP[category]) {
        return CATEGORY_MAP[category].group;
    }

    // 2. 수입/이체 키워드 확인
    if (category.includes('수입') || category.includes('용돈') || category.includes('급여')) return 'income';
    if (category.includes('이체') || category.includes('저축') || category.includes('투자')) return 'asset_transfer';
    if (category.includes('고정') || category.includes('공과금') || category.includes('월세')) return 'fixed_expense';

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
            const category = pay.category || classifyMerchant(pay.merchant);
            const categoryGroup = (pay as any).categoryGroup || determineCategoryGroup(category);

            const { error } = await supabase.from('ledger').insert({
                user_id: userId,
                transaction_date: toISODate(pay.date),
                amount: pay.amount,
                merchant_name: pay.merchant,
                category: category,
                sub_category: (pay as any).subCategory,
                category_group: categoryGroup, // ✅ New field
                image_url: imageUrl,
                memo: (pay as any).memo || `[자동분류] ${category}${(pay as any).subCategory ? ' > ' + (pay as any).subCategory : ''}`,
                raw_text: JSON.stringify(data)
            });
            if (error) throw error;
            console.log('[saveUnifiedEvent] ledger INSERT 성공!');


        } else if (data.type === 'BANK_TRANSFER') {
            const trans = data as BankTransactionResult;

            if ((trans as any).isUtility) {
                // 공과금/고정지출 -> Ledger로 저장
                const category = (trans as any).category || (classifyMerchant(trans.targetName) === '기타' ? '고정지출' : classifyMerchant(trans.targetName));
                const categoryGroup = (trans as any).categoryGroup || determineCategoryGroup(category);

                const { error } = await supabase.from('ledger').insert({
                    user_id: userId,
                    transaction_date: toISODate(trans.date),
                    amount: trans.amount,
                    merchant_name: trans.targetName,
                    category: category,
                    sub_category: (trans as any).subCategory,
                    category_group: categoryGroup, // ✅ New field
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
            const category = (transfer as any).isReceived ? '수입' : '이체';
            const categoryGroup = (transfer as any).isReceived ? 'income' : 'asset_transfer';

            const { error } = await supabase.from('ledger').insert({
                user_id: userId,
                transaction_date: new Date().toISOString(),
                amount: transfer.amount,
                merchant_name: transfer.senderName,
                category: category,
                category_group: categoryGroup, // ✅ New field
                memo: (transfer as any).memo || `[송금] ${(transfer as any).isReceived ? '받음' : '보냄'}`,
                image_url: imageUrl
            });
            if (error) throw error;


            // ===================================
            // 4. 기존: 영수증 (RECEIPT) -> Ledger (Legacy support)
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
                sub_category: (receipt as any).subCategory, // ✅ 소분류 추가
                category_group: categoryGroup, // ✅ New field
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
                category_group: 'variable_expense', // ✅ Default for social meal
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
