import { scheduleEventNotification } from './notifications';
import { supabase } from './supabase-modules/client';

export class ReciprocityEngine {


    // Check if we need to repay someone for an upcoming event
    static async checkReciprocityNeeds() {
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
            const { data: events, error } = await supabase
                .from('events')
                .select('*')
                .gte('event_date', today.toISOString().split('T')[0])
                .lte('event_date', nextWeek.toISOString().split('T')[0]);

            if (error) throw error;

            if (events && events.length > 0) {
                console.log(`[Reciprocity] Found ${events.length} upcoming events.`);
                for (const event of events) {
                    // 1일 전, 당일 알림
                    await scheduleEventNotification(
                        event.name || event.title || '일정',
                        event.event_date,
                        event.start_time || '09:00', // 기본값 09:00
                        60 * 24 // 1일 전 (분 단위)
                    );
                    await scheduleEventNotification(
                        event.name || event.title || '일정',
                        event.event_date,
                        event.start_time || '09:00',
                        60 // 1시간 전
                    );
                }
            }
        } catch (error) {
            console.error('[Reciprocity] Error:', error);
        }
    }

    static async runChecks() {
        await this.checkReciprocityNeeds();
    }
}
