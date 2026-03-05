import { supabase, invalidateCalendarCache } from './client';
import { showError } from '../errorHandler';
import { invalidateCalendarIdsCache } from './calendars';

export interface InterestCategory {
    id: string;
    name: string;
    parent_id: string | null;
    target_calendar_id: string | null;
    icon: string | null;
    theme_color: string | null;
    is_leaf: boolean;
    sort_order: number;
    children?: InterestCategory[];
}

export interface UserInterestSubscription {
    id: string;
    category_id: string;
    calendar_id: string;
    notify_enabled: boolean;
    active_filters?: {
        regions?: string[];
        detail_types?: string[];
    };
}

/**
 * 관심 카테고리 트리를 전체 조회 (캐싱 권장)
 */
export async function getInterestCategories(): Promise<InterestCategory[]> {
    try {
        const { data, error } = await supabase
            .from('interest_categories')
            .select(`
                *,
                subscriber_count:user_interest_subscriptions(count),
                post_count:channel_posts(count)
            `)
            .order('sort_order', { ascending: true });

        if (error) throw error;

        // 트리 형태 조립 (간단한 버전: 클라이언트에서 하위 찾기)
        const categories: (InterestCategory & { subscriber_count: any[], post_count: any[] })[] = data || [];

        // Supabase count 집계 결과를 숫자로 변환
        const normalized: InterestCategory[] = categories.map(c => ({
            ...c,
            subscriber_count: (c.subscriber_count as any)?.[0]?.count ?? 0,
            post_count: (c.post_count as any)?.[0]?.count ?? 0,
        }));

        const rootCategories = normalized.filter(c => !c.parent_id);
        rootCategories.forEach(root => {
            root.children = normalized.filter(c => c.parent_id === root.id);
            root.children.forEach(child => {
                child.children = normalized.filter(c => c.parent_id === child.id);
            });
        });

        return rootCategories;
    } catch (error) {
        console.error('[getInterestCategories] Error:', error);
        return [];
    }
}

/**
 * 현 사용자의 구독 카테고리 목록 조회
 */
export async function getMySubscriptions(): Promise<UserInterestSubscription[]> {
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return [];

        const { data, error } = await supabase
            .from('user_interest_subscriptions')
            .select('*')
            .eq('user_id', user.id);

        if (error) throw error;
        return data || [];
    } catch (error) {
        console.error('[getMySubscriptions] Error:', error);
        return [];
    }
}

/**
 * 관심 일정 구독(ON) / 해지(OFF) 토글 로직
 * Issue #10: RPC 기반 원자성 전환 — 서버 SECURITY DEFINER 함수로 처리
 */
export async function toggleSubscription(
    categoryId: string,
    targetCalendarId: string,
    isSubscribe: boolean
): Promise<boolean> {
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Not authenticated');

        const rpcName = isSubscribe
            ? 'subscribe_interest_category'
            : 'unsubscribe_interest_category';

        const { data, error } = await supabase.rpc(rpcName, {
            p_category_id: categoryId
        });

        if (error) throw error;

        // RPC 반환값 검증
        const result = data as { success: boolean; error?: string; calendar_id?: string };

        if (!result.success) {
            // 도메인별 에러 메시지 분리 (Issue #11)
            const errorMessages: Record<string, string> = {
                'NOT_AUTHENTICATED': '로그인이 필요합니다.',
                'CALENDAR_NOT_LINKED': '해당 카테고리는 아직 캘린더가 연결되지 않았습니다.',
                'INVALID_CALENDAR_TYPE': '잘못된 캘린더 유형입니다.',
            };
            const msg = errorMessages[result.error || ''] || '구독 변경에 실패했습니다.';
            showError(msg);
            return false;
        }

        // 캐시 초기화 (홈 화면 일정 갱신용)
        invalidateCalendarCache(user.id);
        invalidateCalendarIdsCache();
        return true;
    } catch (error) {
        console.error('[toggleSubscription] Error:', error);
        showError('구독 변경에 실패했습니다');
        return false;
    }
}

/**
 * 특정 관심 카테고리의 알림 수신 여부 변경
 */
export async function updateSubscriptionNotification(
    categoryId: string,
    notifyEnabled: boolean
): Promise<boolean> {
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return false;

        const { error } = await supabase
            .from('user_interest_subscriptions')
            .update({ notify_enabled: notifyEnabled })
            .eq('user_id', user.id)
            .eq('category_id', categoryId);

        if (error) throw error;
        return true;
    } catch (error) {
        console.error('[updateSubscriptionNotification] Error:', error);
        return false;
    }
}

/**
 * 관심 카테고리 구독의 하위 필터(지역/세부유형) 업데이트
 */
export async function updateSubscriptionFilters(
    categoryId: string,
    filters: UserInterestSubscription['active_filters']
): Promise<boolean> {
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return false;

        const { error } = await supabase
            .from('user_interest_subscriptions')
            .update({ active_filters: filters })
            .eq('user_id', user.id)
            .eq('category_id', categoryId);

        if (error) throw error;

        invalidateCalendarCache(user.id);
        return true;
    } catch (error) {
        console.error('[updateSubscriptionFilters] Error:', error);
        return false;
    }
}

/**
 * 필터 설정 UI에서 사용할 수 있는 지역/유형 옵션 목록 조회
 */
export async function getAvailableFilterOptions() {
    return {
        regions: [
            '서울', '부산', '대구', '인천', '광주', '대전', '울산', '세종',
            '경기', '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주'
        ],
        detailTypes: ['festival', 'exhibition', 'performance', 'concert', 'musical', 'movie', 'policy']
    };
}

/**
 * 공용 캘린더의 이벤트를 구독 없이 열람 (Discover 뷰용)
 * 구독하지 않아도 관심 탐색 화면에서 미리 볼 수 있도록 제공
 * @param calendarId 공용 캘린더 ID (interest_categories.target_calendar_id)
 * @param limit 최대 조회 건수 (기본 50)
 */
export async function getPublicCalendarEvents(calendarId: string, limit = 50) {
    try {
        const today = new Date().toISOString().split('T')[0];
        const { data, error } = await supabase
            .from('events')
            .select('id, name, event_date, start_time, end_time, location, memo, type, category, external_resource_id')
            .eq('calendar_id', calendarId)
            .gte('event_date', today)
            .order('event_date', { ascending: true })
            .limit(limit)
            .abortSignal(AbortSignal.timeout(10000)); // 10초 타임아웃

        if (error) throw error;
        return data || [];
    } catch (error) {
        console.error('[getPublicCalendarEvents] Error:', error);
        return [];
    }
}

/**
 * 공용 캘린더의 단일 이벤트를 개인 이벤트로 스크랩 (Import)
 * 중복 가져오기 방지: external_resource_id 기반 upsert
 * @param event 공용 캘린더에서 가져온 이벤트 객체
 */
export async function importEventToMyCalendar(event: {
    id: string;
    name: string;
    event_date: string;
    start_time?: string;
    end_time?: string;
    location?: string;
    memo?: string;
    type: string;
    category: string;
    external_resource_id?: string;
}): Promise<{ success: boolean; message: string }> {
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return { success: false, message: '로그인이 필요합니다.' };

        // 내 기본 캘린더 ID 조회
        const { data: myCalendars } = await supabase
            .from('calendars')
            .select('id')
            .eq('owner_id', user.id)
            .eq('calendar_type', 'personal')
            .limit(1)
            .single();

        const importResourceId = event.external_resource_id
            ? `import_${event.external_resource_id}`
            : `import_${event.id}`;

        const { error } = await supabase
            .from('events')
            .upsert({
                calendar_id: myCalendars?.id ?? null,
                user_id: user.id,
                name: event.name,
                event_date: event.event_date,
                start_time: event.start_time || '10:00',
                end_time: event.end_time || '23:59',
                location: event.location || '',
                memo: event.memo || '',
                type: event.type,
                category: 'interest',
                external_resource_id: importResourceId,
            }, {
                onConflict: 'user_id,external_resource_id',
                ignoreDuplicates: true,
            });

        if (error) throw error;

        invalidateCalendarCache(user.id);
        return { success: true, message: '내 캘린더에 담겼습니다! 📅' };
    } catch (error) {
        console.error('[importEventToMyCalendar] Error:', error);
        return { success: false, message: '가져오기에 실패했습니다.' };
    }
}
