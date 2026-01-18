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

export async function registerForPushNotificationsAsync() {
    if (Platform.OS === 'web') {
        console.log('Push notifications are not fully supported on web.');
        return true;
    }

    const Notifications = await getNotifications();
    if (!Notifications) {
        console.log('[Notifications] Skipping - not available');
        return true;
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
        return;
    }

    return true;
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
        },
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
