import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { supabase } from './supabase-modules/client';

// Expo Go에서는 expo-notifications가 지원되지 않음 (SDK 53+)
const isExpoGo = Constants.appOwnership === 'expo';

// 동적 import를 위한 타입
type NotificationsModule = typeof import('expo-notifications');
let _notifications: NotificationsModule | null = null;
let _initialized = false;
let _initPromise: Promise<NotificationsModule | null> | null = null;
const _scheduledIdentifiers = new Set<string>();

async function getNotifications(): Promise<NotificationsModule | null> {
    if (isExpoGo) {
        return null;
    }

    if (_initialized) return _notifications;
    if (_initPromise) return _initPromise;

    _initPromise = (async () => {
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
            console.log('[Notifications] Initialized successfully');
        } catch (e) {
            console.warn('[Notifications] Failed to initialize:', e);
        } finally {
            _initialized = true;
            _initPromise = null;
        }

        return _notifications;
    })();

    return _initPromise;
}

function normalizeTimeToHHmm(value?: string): string | undefined {
    if (!value) return undefined;

    const hasDate = /\d{4}-\d{2}-\d{2}/.test(value);
    const hasZone = /[zZ]|[+-]\d{2}:\d{2}$/.test(value);
    if (hasDate || hasZone) {
        const normalized = value.replace(' ', 'T');
        const parsed = new Date(normalized);
        if (!isNaN(parsed.getTime())) {
            const hours = String(parsed.getHours()).padStart(2, '0');
            const minutes = String(parsed.getMinutes()).padStart(2, '0');
            return `${hours}:${minutes}`;
        }
    }

    const match = value.match(/(\d{1,2}):(\d{2})/);
    if (!match) return undefined;

    const hours = match[1].padStart(2, '0');
    const minutes = match[2];
    return `${hours}:${minutes}`;
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
            type: 'timeInterval',
            channelId: 'default',
        } as any,
    });
}

export async function scheduleEventNotification(
    title: string,
    eventDate: string,
    eventTime: string | undefined,
    minutesBefore: number,
    eventId?: string // Optional eventId for stable identifiers
) {
    if (Platform.OS === 'web') return;

    const Notifications = await getNotifications();
    if (!Notifications) return;

    const timeStr = eventTime || '09:00';
    const normalizedTime = normalizeTimeToHHmm(timeStr) || '09:00';
    const datePart = eventDate.split('T')[0];
    const eventDateTimeStr = `${datePart}T${normalizedTime}:00`;
    if (__DEV__) {
        console.log('[Notifications] Normalized event time', {
            eventTime,
            normalizedTime,
            eventDate: datePart,
        });
    }
    const targetDate = new Date(eventDateTimeStr);

    if (isNaN(targetDate.getTime())) {
        console.warn('Invalid date for notification:', eventDateTimeStr);
        return;
    }

    const triggerDate = new Date(targetDate.getTime() - minutesBefore * 60000);
    const now = Date.now();
    const diffSeconds = Math.floor((triggerDate.getTime() - now) / 1000);

    if (diffSeconds <= 0) {
        console.log('[Notifications] Trigger time in past, skipping:', triggerDate);
        return;
    }

    // 중복 방지: 식별자 생성
    // 이벤트 ID가 있으면 그것을 사용하여 제목 변경 시에도 안정적인 식별자 제공
    const identifier = eventId
        ? `event-${eventId}-${minutesBefore}`
        : `event-${title}-${triggerDate.getTime()}`;
    if (_scheduledIdentifiers.has(identifier)) {
        console.log(`[Notifications] Skipping duplicate event alert: ${identifier}`);
        return;
    }
    _scheduledIdentifiers.add(identifier);
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    const isAlreadyScheduled = scheduled.some(n => n.identifier === identifier);

    if (isAlreadyScheduled) {
        console.log(`[Notifications] Skipping duplicate event alert: ${identifier}`);
        return;
    }

    try {
        console.log(`Scheduling notification for [${title}] at ${triggerDate.toLocaleString()} (in ${diffSeconds}s)`);

        await Notifications.scheduleNotificationAsync({
            identifier,
            content: {
                title: '일정 알림 ⏰',
                body: `${title} 일정이 ${minutesBefore === 0 ? '지금' : minutesBefore + '분 후에'} 시작됩니다.`,
                sound: 'default',
            },
            trigger: {
                seconds: diffSeconds,
                type: 'timeInterval',
                channelId: 'default',
            } as any,
        });
    } catch (error) {
        _scheduledIdentifiers.delete(identifier);
        console.warn('[Notifications] Failed to schedule notification:', error);
    }
}

/**
 * 관심 카테고리(interest) 구독 캘린더의 향후 7일치 일정을 가져와
 * 로컬 단말기 알림으로 스케줄링합니다. (앱 진입점 등에서 호출)
 */
export async function syncInterestNotifications() {
    if (Platform.OS === 'web') return;
    const Notifications = await getNotifications();
    if (!Notifications) return;

    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        // 1. 알림이 켜진(notify_enabled = true) 구독 정보만 가져오기
        const { data: subs, error: subError } = await supabase
            .from('user_interest_subscriptions')
            .select('calendar_id')
            .eq('user_id', user.id)
            .eq('notify_enabled', true);

        if (subError) throw subError;
        if (!subs || subs.length === 0) return;

        const calendarIds = subs.map(s => s.calendar_id);

        // 2. 향후 7일 간의 이 캘린더 소속 이벤트 조회
        const todayStr = new Date().toISOString().split('T')[0];
        const nextWeek = new Date();
        nextWeek.setDate(nextWeek.getDate() + 7);
        const nextWeekStr = nextWeek.toISOString().split('T')[0];

        const { data: events, error: eventError } = await supabase
            .from('events')
            .select('id, title, date, start_time, alarm_minutes')
            .in('calendar_id', calendarIds)
            .gte('date', todayStr)
            .lte('date', nextWeekStr)
            .eq('source', 'interest');

        if (eventError) throw eventError;

        // 3. 차례대로 알림 스케줄링 (기본 60분 전 알림)
        for (const ev of events || []) {
            // 해당 이벤트에 alarm_minutes 값이 없으면 기본 60분 전 알림 세팅
            const minutesBefore = ev.alarm_minutes ?? 60;
            await scheduleEventNotification(
                ev.title,
                ev.date,
                ev.start_time || '09:00', // 시간 미지정 시 오전 9시 알림
                minutesBefore,
                ev.id
            );
        }

        console.log(`[syncInterestNotifications] Successfully scheduled ${events?.length || 0} interest events.`);

    } catch (error) {
        console.error('[syncInterestNotifications] Error:', error);
    }
}

