import * as Calendar from 'expo-calendar';
import { Platform, Linking, Alert } from 'react-native';

export async function addToCalendar(event: {
    title: string;
    startDate: string; // ISO Date String YYYY-MM-DD
    location?: string;
    notes?: string;
}) {
    if (Platform.OS === 'web') {
        const startDate = event.startDate.replace(/-/g, '');
        const endDate = startDate; // All day event assumption for simplicity
        const details = encodeURIComponent(event.notes || '');
        const location = encodeURIComponent(event.location || '');
        const text = encodeURIComponent(event.title);

        const googleCalendarUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${text}&dates=${startDate}/${endDate}&details=${details}&location=${location}`;

        window.open(googleCalendarUrl, '_blank');
        return;
    }

    // Native Implementation
    const { status } = await Calendar.requestCalendarPermissionsAsync();

    if (status === 'granted') {
        const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);

        // Find default calendar
        const defaultCalendar =
            calendars.find(c => c.isPrimary) ||
            calendars.find(c => c.source.name === 'iCloud') ||
            calendars[0];

        if (defaultCalendar) {
            // Create Event
            // Note: Simplification - Creating specific start/end times
            const start = new Date(event.startDate);
            start.setHours(12, 0, 0); // Default to noon
            const end = new Date(event.startDate);
            end.setHours(13, 0, 0);

            try {
                const eventId = await Calendar.createEventAsync(defaultCalendar.id, {
                    title: event.title,
                    startDate: start,
                    endDate: end,
                    location: event.location,
                    timeZone: 'Asia/Seoul',
                    notes: event.notes
                });
                Alert.alert('성공', '캘린더에 일정이 등록되었습니다.');
                return eventId;
            } catch (e) {
                console.error(e);
                Alert.alert('오류', '일정 등록 중 오류가 발생했습니다.');
            }
        } else {
            Alert.alert('오류', '사용 가능한 캘린더를 찾을 수 없습니다.');
        }
    } else {
        Alert.alert('권한 필요', '캘린더 접근 권한이 필요합니다.');
    }
}
