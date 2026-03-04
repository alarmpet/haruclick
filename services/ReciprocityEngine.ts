import { scheduleEventNotification } from './notifications';
import { supabase } from './supabase-modules/client';
import { getMyCalendarIds } from './supabase-modules/calendars';

export class ReciprocityEngine {

    private static running = false;

    private static normalizeTimeToHHmm(value?: string): string | undefined {
        if (!value) return undefined;
        const match = value.match(/(\d{1,2}):(\d{2})/);
        if (!match) return undefined;
        const hours = match[1].padStart(2, '0');
        const minutes = match[2];
        return `${hours}:${minutes}`;
    }

    // Check if we need to repay someone for an upcoming event
    static async checkReciprocityNeeds() {
        if (this.running) {
            console.log('[Reciprocity] Skipping - already running');
            return;
        }
        this.running = true;
        console.log("[Reciprocity] Checking reciprocity needs...");

        try {
            const today = new Date();
            const nextWeek = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);

            // 오늘 이후 ~ 7일 이내 행사 중 received(받은 내역)이 있는 경우 (즉, 내가 갚아야 할 수도 있는 건)
            // 사실 'is_received' 플래그는 '내가 받은 돈'을 의미하므로, 이 행사는 '나의 행사'일 가능성이 높음.
            // 하지만 '상호성' 관점에서는 '남의 행사'에 가야 할 때를 알려주는 것이 중요함.
            // 남의 행사는 보통 'is_received'가 false임 (내가 돈을 낼 것이므로).
            // 하지만 DB 구조상 'received' 필드가 명확지 않으므로, 
            // 여기서는 '내가 참석해야 할 이벤트'를 찾는다고 가정하고 전체 이벤트를 훑거나
            // event_type이 wedding/funeral 등인 것을 찾음.

            // FIXME: 단순화를 위해 이번 주 모든 이벤트 알림 스케줄링 (중복은 notifications에서 처리)
            const myCalendarIds = await getMyCalendarIds();
            const { data: { user } } = await supabase.auth.getUser();

            let query = supabase
                .from('events')
                .select('*')
                .gte('event_date', today.toISOString().split('T')[0])
                .lte('event_date', nextWeek.toISOString().split('T')[0]);

            if (user && myCalendarIds.length > 0) {
                // Safe UUID quoting for .or() query
                const quotedIds = myCalendarIds.map(id => `"${id}"`).join(',');
                query = query.or(`calendar_id.in.(${quotedIds}),and(calendar_id.is.null,user_id.eq.${user.id})`);
            } else if (user) {
                query = query.eq('user_id', user.id);
            }

            const { data: events, error } = await query;

            if (error) throw error;

            if (events && events.length > 0) {

                console.log(`[Reciprocity] Found ${events.length} upcoming events.`);
                for (const event of events) {
                    const eventTime = this.normalizeTimeToHHmm(event.start_time) || '09:00';
                    const eventName = event.name || event.title || '일정';

                    // 1일 전 (D-1)
                    console.log(`[Reciprocity] Scheduling [D-1] for ${eventName}`);
                    await scheduleEventNotification(
                        eventName,
                        event.event_date,
                        eventTime, // 기본값 09:00
                        60 * 24, // 1일 전 (분 단위)
                        event.id
                    );

                    // 1시간 전 (D-1h)
                    console.log(`[Reciprocity] Scheduling [D-1h] for ${eventName}`);
                    await scheduleEventNotification(
                        eventName,
                        event.event_date,
                        eventTime,
                        60, // 1시간 전
                        event.id
                    );
                }
            }
        } catch (error) {
            console.error('[Reciprocity] Error:', error);
        } finally {
            this.running = false;
        }
    }

    static async runChecks() {
        await this.checkReciprocityNeeds();
    }
}
