import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

Notifications.setNotificationHandler({
    handleNotification: async () => ({
        shouldPlaySound: true,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true,
    }),
});

export async function registerForPushNotificationsAsync() {
    if (Platform.OS === 'web') {
        console.log('Push notifications are not fully supported on web.');
        return true; // Mock success for web demo
    }

    let token;

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
        return;
    }

    // Usually we would get a token here for remote push, but for local we just need permissions
    return true;
}

export async function scheduleNotification(title: string, body: string, seconds = 1) {
    if (Platform.OS === 'web') {
        console.log(`[Web Notification] ${title}: ${body}`);
        // Optional: Use browser alert for visibility in demo
        // setTimeout(() => window.alert(`${title}\n${body}`), seconds * 1000);
        return;
    }

    await Notifications.scheduleNotificationAsync({
        content: {
            title,
            body,
            sound: 'default',
        },
        trigger: {
            seconds: seconds,
            channelId: 'default',
        },
    });
}

export async function scheduleEventNotification(
    title: string,
    eventDate: string,
    eventTime: string | undefined, // undefined if all day (default 9 AM?)
    minutesBefore: number
) {
    if (Platform.OS === 'web') return;

    // 1. 이벤트 시간 설정 (종일이면 오전 9시 기준)
    const timeStr = eventTime || '09:00';
    const eventDateTimeStr = `${eventDate}T${timeStr}:00`;
    const targetDate = new Date(eventDateTimeStr);

    if (isNaN(targetDate.getTime())) {
        console.warn('Invalid date for notification:', eventDateTimeStr);
        return;
    }

    // 2. 알림 시간 계산 (minutesBefore 분 전)
    const triggerDate = new Date(targetDate.getTime() - minutesBefore * 60000);

    // 3. 이미 지난 시간인지 체크
    if (triggerDate.getTime() <= Date.now()) {
        console.log('Notification time is in the past, skipping:', triggerDate);
        return;
    }

    console.log(`Scheduling notification for [${title}] at ${triggerDate.toLocaleString()}`);

    await Notifications.scheduleNotificationAsync({
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
