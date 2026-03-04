import { supabase, invalidateCalendarCache } from './client';
import { showError } from '../errorHandler';

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
