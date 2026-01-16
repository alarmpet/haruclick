import * as Calendar from 'expo-calendar';
import { Platform } from 'react-native';

export interface DeviceEvent {
    id: string;
    title: string;
    startDate: string; // ISO date string
    endDate: string;
    allDay: boolean;
    calendarId: string;
    color?: string;
    location?: string;
    notes?: string;
}

export const DeviceCalendarService = {
    async getPermissions() {
        const { status } = await Calendar.requestCalendarPermissionsAsync();
        // On iOS we need reminders permission too ideally for full access, but for just events Calendar is enough
        /*
        if (Platform.OS === 'ios') {
          await Calendar.requestRemindersPermissionsAsync();
        }
        */
        return status === 'granted';
    },

    async getEvents(startDate: Date, endDate: Date, selectedCalendarIds?: string[]): Promise<DeviceEvent[]> {
        try {
            const hasPermission = await this.getPermissions();
            if (!hasPermission) {
                console.warn('Calendar permission not granted');
                return [];
            }

            const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);

            // 선택된 캘린더 ID가 있으면 필터링, 없으면 전체
            let calendarIds = calendars.map(c => c.id);
            if (selectedCalendarIds && selectedCalendarIds.length > 0) {
                calendarIds = calendarIds.filter(id => selectedCalendarIds.includes(id));
                console.log(`[DeviceCalendar] Filtering to ${calendarIds.length} selected calendars`);
            }

            if (calendarIds.length === 0) return [];

            const events = await Calendar.getEventsAsync(calendarIds, startDate, endDate);

            return events.map(event => ({
                id: event.id,
                title: event.title,
                startDate: typeof event.startDate === 'string' ? event.startDate : event.startDate.toISOString(),
                endDate: typeof event.endDate === 'string' ? event.endDate : event.endDate.toISOString(),
                allDay: event.allDay,
                calendarId: event.calendarId,
                color: calendars.find(c => c.id === event.calendarId)?.color || '#999',
                location: event.location,
                notes: event.notes
            }));
        } catch (error) {
            console.error('Failed to fetching device events:', error);
            return [];
        }
    }
};
