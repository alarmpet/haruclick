import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

Notifications.setNotificationHandler({
    handleNotification: async () => ({
        shouldShowAlert: true, // 하위 호환성 유지
        shouldPlaySound: true,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true,
    }),
});

export async function registerForPushNotificationsAsync(): Promise<string | null> {
    if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
            name: 'default',
            importance: Notifications.AndroidImportance.MAX,
            vibrationPattern: [0, 250, 250, 250],
            lightColor: '#FF231F7C',
        });
    }

    // expo-device 의존성 제거: 시뮬레이터에서도 권한 요청 시도
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

    // Get the token
    try {
        const projectId = '7f5c907b-891a-4783-9366-435555555555'; // Use explicit ID if defined in app.json, otherwise rely on default
        const token = (await Notifications.getExpoPushTokenAsync({
            // projectId: '...' // Optional: if you have a specific project ID
        })).data;
        console.log('Push Token:', token);
        return token;
    } catch (e) {
        console.error('Error fetching push token:', e);
        return null; // Fail gracefully so the app doesn't crash
    }
}

export async function scheduleLocalNotification(title: string, body: string, seconds: number) {
    await Notifications.scheduleNotificationAsync({
        content: {
            title,
            body,
            sound: 'default',
        },
        trigger: {
            type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
            seconds,
            repeats: false
        },
    });
}

// 기프티콘 만료 알림 스케줄링
export async function scheduleGifticonAlerts(items: any[]) {
    // 기존 예약된 알림 확인 (중복 방지)
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    const today = new Date();

    for (const item of items) {
        if (item.status !== 'available') continue;

        // 날짜 파싱 (YYYY.MM.DD 또는 YYYY-MM-DD)
        const dateStr = item.expiryDate.replace(/\./g, '-');
        const expiry = new Date(dateStr);
        const diffTime = expiry.getTime() - today.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        // 만료 7일 전, 3일 전, 1일 전, 당일 알림
        if (diffDays <= 7 && diffDays >= 0) {
            const identifier = `gifticon-${item.id}-${diffDays}`; // Unique ID

            // 이미 예약된 알림인지 확인
            const isScheduled = scheduled.some(n => n.identifier === identifier);

            if (!isScheduled) {
                console.log(`Scheduling alert for ${item.productName} (D-${diffDays})`);

                await Notifications.scheduleNotificationAsync({
                    identifier,
                    content: {
                        title: '🎁 기프티콘 만료 임박!',
                        body: `[${item.productName}] 유효기간이 ${diffDays === 0 ? '오늘' : diffDays + '일'} 남았습니다. 꼭 사용하세요!`,
                        sound: 'default',
                    },
                    trigger: {
                        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
                        seconds: 2, // 테스트용: 앱 진입 시 2초 뒤 알림
                        repeats: false
                    },
                });
            }
        }
    }
}
