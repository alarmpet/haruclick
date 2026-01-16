import { scheduleNotification } from './notifications';
import { getEvents } from './supabase';

export class ReciprocityEngine {

    // Check for gifticons expiring within 7 days
    static async checkExpiringGifticons() {
        // TODO: Supabase 'gifticons' 테이블에서 실제 데이터 가져오기
        console.log("Checking expiring gifticons... (현재 비활성화)");

        // 실제 구현 시:
        // const { data } = await supabase.from('gifticons').select('*');
        // const today = new Date();
        // data?.forEach(gifticon => {
        //     const expiry = new Date(gifticon.expiry_date);
        //     const diffDays = Math.ceil((expiry.getTime() - today.getTime()) / (1000 * 3600 * 24));
        //     if (diffDays <= 7 && diffDays >= 0) {
        //         scheduleNotification(...);
        //     }
        // });
    }

    // Check if we need to repay someone for an upcoming event
    static async checkReciprocityNeeds() {
        console.log("Checking reciprocity needs...");

        try {
            // 실제 DB에서 다가오는 이벤트 가져오기
            const events = await getEvents();
            const today = new Date();
            const nextWeek = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);

            // 다가오는 이벤트 중 received 기록이 있는 사람 찾기
            const upcomingEvents = events.filter(event => {
                const eventDate = new Date(event.date);
                return eventDate >= today && eventDate <= nextWeek && event.isReceived;
            });

            // 실제 데이터가 있을 때만 알림
            for (const event of upcomingEvents) {
                await scheduleNotification(
                    '마음을 전할 시간입니다 💝',
                    `${event.name}님의 ${event.type === 'wedding' ? '결혼식' : '행사'}이 다가오네요. 축하의 마음을 전해보세요!`,
                    5
                );
            }
        } catch (error) {
            console.error('ReciprocityEngine error:', error);
        }
    }

    static async runChecks() {
        await this.checkExpiringGifticons();
        await this.checkReciprocityNeeds();
    }
}
