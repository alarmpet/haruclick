import { Platform } from 'react-native';
import Constants from 'expo-constants';

// Expo Go에서는 expo-notifications가 지원되지 않음 (SDK 53+)
const isExpoGo = Constants.appOwnership === 'expo';

// 동적 import를 위한 타입
type NotificationsModule = typeof import('expo-notifications');
let _notifications: NotificationsModule | null = null;
let _initialized = false;

async function getNotifications(): Promise<NotificationsModule | null> {
    if (isExpoGo) {
        return null;
    }

    if (_initialized) return _notifications;

    try {
        _notifications = await import('expo-notifications');
        _notifications.setNotificationHandler({
            handleNotification: async () => ({
                shouldPlaySound: true,
                shouldSetBadge: false,
                shouldShowBanner: true,
                shouldShowList: true,
            }),
        });
        _initialized = true;
        console.log('[Notifications] Initialized successfully');
    } catch (e) {
        console.warn('[Notifications] Failed to initialize:', e);
        _initialized = true;
    }

    return _notifications;
}

export async function registerForPushNotificationsAsync(): Promise<string | null> {
    if (Platform.OS === 'web') {
        console.log('Push notifications are not fully supported on web.');
        return null;
    }

    const Notifications = await getNotifications();
    if (!Notifications) {
        console.log('[Notifications] Skipping - not available');
        return null;
    }

    if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
            name: 'default',
            importance: Notifications.AndroidImportance.MAX,
            vibrationPattern: [0, 250, 250, 250],
            lightColor: '#FF231F7C',
        });
    }

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
    }

    if (finalStatus !== 'granted') {
        console.log('Failed to get push token for push notification!');
        return null;
    }

    // 보안 강화: projectId 동적 사용 및 토큰 로그 제한
    try {
        const projectId = Constants.expoConfig?.extra?.eas?.projectId;
        const tokenData = await Notifications.getExpoPushTokenAsync({
            projectId: projectId // projectId가 없으면 undefined로 전달되어 기본 설정 사용
        });

        if (__DEV__) {
            console.log('Push Token:', tokenData.data);
        }
        return tokenData.data;
    } catch (e) {
        console.error('[Notifications] Error fetching token:', e);
        return null;
    }
}

export async function scheduleNotification(title: string, body: string, seconds = 1) {
    if (Platform.OS === 'web') {
        console.log(`[Web Notification] ${title}: ${body}`);
        return;
    }

    const Notifications = await getNotifications();
    if (!Notifications) return;

    await Notifications.scheduleNotificationAsync({
        content: {
            title,
            body,
            sound: 'default',
        },
        trigger: {
            seconds: seconds,
            channelId: 'default',
        } as any,
    });
}

export async function scheduleEventNotification(
    title: string,
    eventDate: string,
    eventTime: string | undefined,
    minutesBefore: number
) {
    if (Platform.OS === 'web') return;

    const Notifications = await getNotifications();
    if (!Notifications) return;

    const timeStr = eventTime || '09:00';
    const eventDateTimeStr = `${eventDate}T${timeStr}:00`;
    const targetDate = new Date(eventDateTimeStr);

    if (isNaN(targetDate.getTime())) {
        console.warn('Invalid date for notification:', eventDateTimeStr);
        return;
    }

    const triggerDate = new Date(targetDate.getTime() - minutesBefore * 60000);

    if (triggerDate.getTime() <= Date.now()) {
        console.log('Notification time is in the past, skipping:', triggerDate);
        return;
    }

    // 중복 방지: 식별자 생성
    const identifier = `event-${title}-${triggerDate.getTime()}`;
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    const isAlreadyScheduled = scheduled.some(n => n.identifier === identifier);

    if (isAlreadyScheduled) {
        console.log(`[Notifications] Skipping duplicate event alert: ${identifier}`);
        return;
    }

    console.log(`Scheduling notification for [${title}] at ${triggerDate.toLocaleString()}`);

    await Notifications.scheduleNotificationAsync({
        identifier,
        content: {
            title: '일정 알림 ⏰',
            body: `${title} 일정이 ${minutesBefore === 0 ? '지금' : minutesBefore + '분 후에'} 시작됩니다.`,
            sound: 'default',
        },
        trigger: {
            date: triggerDate,
            channelId: 'default',
        } as any,
    });
}

// 기프티콘 만료 알림 (notification.ts에서 이관됨)
export async function scheduleGifticonAlerts(items: any[]) {
    if (Platform.OS === 'web') return;

    const Notifications = await getNotifications();
    if (!Notifications) return;

    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    const today = new Date();

    for (const item of items) {
        // item이 Supabase 포맷인지, 로컬 포맷인지 확인. 
        // expiry_date (DB) vs expiryDate (Local). 둘 다 대응.
        const expiryDateStr = item.expiry_date || item.expiryDate;
        const status = item.status;
        const productName = item.product_name || item.productName || '기프티콘';
        const id = item.id;

        if (status !== 'available' || !expiryDateStr) continue;

        const dateStr = expiryDateStr.replace(/\./g, '-');
        const expiry = new Date(dateStr);

        // 날짜 파싱 실패 시 스킵
        if (isNaN(expiry.getTime())) continue;

        const diffTime = expiry.getTime() - today.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        // 만료 7일 전 ~ 당일
        if (diffDays <= 7 && diffDays >= 0) {
            const identifier = `gifticon-${id}-${diffDays}`;

            const isScheduled = scheduled.some(n => n.identifier === identifier);

            if (!isScheduled) {
                console.log(`Scheduling alert for ${productName} (D-${diffDays})`);

                const seconds = 2; // 즉시 테스트용 (실제론 특정 시간대 예약 로직 필요할 수 있음)

                await Notifications.scheduleNotificationAsync({
                    identifier,
                    content: {
                        title: '🎁 기프티콘 만료 임박!',
                        body: `[${productName}] 유효기간이 ${diffDays === 0 ? '오늘' : diffDays + '일'} 남았습니다. 꼭 사용하세요!`,
                        sound: 'default',
                    },
                    trigger: {
                        seconds: seconds, // 실제 운영 시에는 'date' trigger로 특정 시간 지정 권장
                        channelId: 'default',
                    } as any,
                });
            }
        }
    }
}
