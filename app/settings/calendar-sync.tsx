import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Switch, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Colors } from '../../constants/Colors';
import Ionicons from '@expo/vector-icons/Ionicons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Calendar from 'expo-calendar';
import { Platform } from 'react-native';

const SELECTED_CALENDARS_KEY = 'selectedCalendarIds';
const CALENDAR_SYNC_KEY = 'externalCalendarSync';

interface DeviceCalendar {
    id: string;
    title: string;
    color: string;
    source: string;
    isPrimary: boolean;
}

export default function CalendarSettingsScreen() {
    const router = useRouter();
    const [calendars, setCalendars] = useState<DeviceCalendar[]>([]);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [syncEnabled, setSyncEnabled] = useState(true);
    const [loading, setLoading] = useState(true);
    const [showAll, setShowAll] = useState(false);

    useEffect(() => {
        loadSettings();
    }, [showAll]);

    const loadSettings = async () => {
        try {
            // 연동 설정 확인
            const syncSetting = await AsyncStorage.getItem(CALENDAR_SYNC_KEY);
            setSyncEnabled(syncSetting !== 'false');

            // 권한 요청
            const { status } = await Calendar.requestCalendarPermissionsAsync();
            if (status !== 'granted') {
                Alert.alert('권한 필요', '캘린더 연동을 위해 권한이 필요합니다.');
                setLoading(false);
                return;
            }

            // 기기 캘린더 목록 가져오기
            const deviceCalendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);

            // showAll이 true면 전체 표시, 아니면 필터링
            const targetCalendars = showAll ? deviceCalendars : filterImportantCalendars(deviceCalendars);

            const calendarList: DeviceCalendar[] = targetCalendars.map(cal => ({
                id: cal.id,
                title: cal.title,
                color: cal.color || '#999',
                source: cal.source?.name || '알 수 없음',
                isPrimary: cal.isPrimary || false
            }));

            setCalendars(calendarList);

            // 저장된 선택 불러오기
            const savedIds = await AsyncStorage.getItem(SELECTED_CALENDARS_KEY);
            if (savedIds) {
                setSelectedIds(new Set(JSON.parse(savedIds)));
            } else {
                // 기본값: 필터된 캘린더 중 주요 것만 선택
                const defaultIds = calendarList
                    .filter(c => isDefaultEnabled(c.title, c.source))
                    .map(c => c.id);
                setSelectedIds(new Set(defaultIds));
            }
        } catch (error) {
            console.error('Failed to load calendars:', error);
        } finally {
            setLoading(false);
        }
    };

    // 중복 휴일 캘린더 제거 및 주요 캘린더만 필터링
    const filterImportantCalendars = (calendars: Calendar.Calendar[]) => {
        const seen = new Set<string>();
        const result: Calendar.Calendar[] = [];

        // 휴일 관련 키워드 (중복 제거용)
        const holidayKeywords = ['공휴일', '휴일', '법정', 'holiday', 'Holidays', '기념일'];
        let hasHolidayCalendar = false;

        // 제외할 캘린더 키워드
        const excludeKeywords = ['절기', '세시풍속', '연락처에 저장된', 'Contact', 'Birthday'];

        for (const cal of calendars) {
            const title = cal.title.toLowerCase();
            const source = (cal.source?.name || '').toLowerCase();

            // 제외할 캘린더 건너뛰기
            if (excludeKeywords.some(kw => title.includes(kw.toLowerCase()) || cal.title.includes(kw))) {
                continue;
            }

            // 휴일 캘린더는 하나만 (우선순위: 공휴일 > 법정기념일 > Holidays)
            const isHoliday = holidayKeywords.some(kw =>
                title.includes(kw.toLowerCase()) || cal.title.includes(kw)
            );

            if (isHoliday) {
                if (hasHolidayCalendar) continue; // 이미 하나 있으면 건너뛰기
                hasHolidayCalendar = true;
            }

            // 중복 제거 (같은 이름 + 같은 소스)
            const key = `${cal.title}-${cal.source?.name}`;
            if (seen.has(key)) continue;
            seen.add(key);

            result.push(cal);
        }

        return result;
    };

    // 기본 선택 여부 결정 (주요 캘린더 앱들)
    const isDefaultEnabled = (title: string, source: string) => {
        const combined = `${title} ${source}`.toLowerCase();

        // 기본 활성화: 개인 캘린더, 주요 서비스
        if (combined.includes('my calendar')) return true;
        if (combined.includes('calendar') && combined.includes('@')) return true; // 이메일 계정 캘린더
        if (combined.includes('samsung calendar')) return true;
        if (combined.includes('google')) return true;
        if (combined.includes('naver') || combined.includes('네이버') || combined.includes('n캘린더')) return true;
        if (combined.includes('kakao') || combined.includes('카카오')) return true;
        if (combined.includes('공휴일') || combined.includes('법정')) return true;

        // 추가 인기 캘린더 앱
        if (combined.includes('timetree') || combined.includes('타임트리')) return true;
        if (combined.includes('jorte') || combined.includes('조르테')) return true;
        if (combined.includes('business calendar') || combined.includes('비즈니스') || combined.includes('비지니스달력')) return true;
        if (combined.includes('simple calendar') || combined.includes('심플캘린더') || combined.includes('심플 캘린더')) return true;
        if (combined.includes('calendar planner') || combined.includes('캘린더플래너') || combined.includes('캘린더 플래너')) return true;
        if (combined.includes('outlook') || combined.includes('microsoft') || combined.includes('exchange')) return true;
        if (combined.includes('icloud') || combined.includes('apple')) return true;

        return false;
    };

    const toggleCalendar = async (id: string) => {
        const newSelected = new Set(selectedIds);
        if (newSelected.has(id)) {
            newSelected.delete(id);
        } else {
            newSelected.add(id);
        }
        setSelectedIds(newSelected);
        await AsyncStorage.setItem(SELECTED_CALENDARS_KEY, JSON.stringify([...newSelected]));
    };

    const toggleSyncEnabled = async (value: boolean) => {
        setSyncEnabled(value);
        await AsyncStorage.setItem(CALENDAR_SYNC_KEY, value.toString());
    };

    const selectAll = async () => {
        const allIds = new Set(calendars.map(c => c.id));
        setSelectedIds(allIds);
        await AsyncStorage.setItem(SELECTED_CALENDARS_KEY, JSON.stringify([...allIds]));
    };

    const deselectAll = async () => {
        setSelectedIds(new Set());
        await AsyncStorage.setItem(SELECTED_CALENDARS_KEY, JSON.stringify([]));
    };

    const getCalendarIcon = (source: string, title: string = '') => {
        const combined = `${source} ${title}`.toLowerCase();
        if (combined.includes('google')) return '📅';
        if (combined.includes('naver') || combined.includes('네이버') || combined.includes('n캘린더')) return '🟢';
        if (combined.includes('kakao') || combined.includes('카카오')) return '💬';
        if (combined.includes('samsung') || combined.includes('삼성')) return '📱';
        if (combined.includes('icloud') || combined.includes('apple')) return '🍎';
        if (combined.includes('outlook') || combined.includes('microsoft')) return '📧';
        if (combined.includes('timetree') || combined.includes('타임트리')) return '🌲';
        if (combined.includes('jorte') || combined.includes('조르테')) return '📓';
        if (combined.includes('business') || combined.includes('비즈니스') || combined.includes('비지니스')) return '💼';
        if (combined.includes('simple') || combined.includes('심플')) return '📋';
        if (combined.includes('planner') || combined.includes('플래너')) return '📝';
        if (combined.includes('공휴일') || combined.includes('휴일') || combined.includes('holiday')) return '🎌';
        return '📆';
    };

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                    <Ionicons name="arrow-back" size={24} color={Colors.text} />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>캘린더 연동 설정</Text>
                <View style={{ width: 40 }} />
            </View>

            <ScrollView style={styles.content}>
                {/* 마스터 토글 */}
                <View style={styles.masterToggle}>
                    <View style={styles.toggleLeft}>
                        <Ionicons name="calendar" size={24} color={Colors.navy} />
                        <View style={styles.toggleTextContainer}>
                            <Text style={styles.toggleTitle}>외부 캘린더 연동</Text>
                            <Text style={styles.toggleSubtitle}>
                                {syncEnabled ? '활성화됨' : '비활성화됨'}
                            </Text>
                        </View>
                    </View>
                    <Switch
                        value={syncEnabled}
                        onValueChange={toggleSyncEnabled}
                        trackColor={{ false: '#E5E5EA', true: Colors.navy }}
                        thumbColor="#fff"
                    />
                </View>

                {syncEnabled && (
                    <>
                        {/* 전체 선택 버튼 */}
                        <View style={styles.actionButtons}>
                            <TouchableOpacity style={styles.actionButton} onPress={selectAll}>
                                <Text style={styles.actionButtonText}>전체 선택</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.actionButton} onPress={deselectAll}>
                                <Text style={styles.actionButtonText}>전체 해제</Text>
                            </TouchableOpacity>
                        </View>

                        {/* 캘린더 목록 */}
                        <View style={styles.calendarList}>
                            <View style={styles.listHeader}>
                                <Text style={styles.sectionTitle}>
                                    📋 연동할 캘린더 선택 ({selectedIds.size}/{calendars.length})
                                </Text>
                                <TouchableOpacity onPress={() => setShowAll(!showAll)}>
                                    <Text style={styles.showAllLink}>
                                        {showAll ? '주요 캘린더만 보기' : '+ 숨겨진 캘린더 보기'}
                                    </Text>
                                </TouchableOpacity>
                            </View>

                            {loading ? (
                                <Text style={styles.loadingText}>캘린더 목록 불러오는 중...</Text>
                            ) : calendars.length === 0 ? (
                                <Text style={styles.emptyText}>연동 가능한 캘린더가 없습니다.</Text>
                            ) : (
                                calendars.map(cal => (
                                    <TouchableOpacity
                                        key={cal.id}
                                        style={styles.calendarItem}
                                        onPress={() => toggleCalendar(cal.id)}
                                    >
                                        <View style={styles.calendarLeft}>
                                            <View style={[styles.colorDot, { backgroundColor: cal.color }]} />
                                            <View style={styles.calendarInfo}>
                                                <Text style={styles.calendarTitle}>
                                                    {getCalendarIcon(cal.source, cal.title)} {cal.title}
                                                </Text>
                                                <Text style={styles.calendarSource}>{cal.source}</Text>
                                            </View>
                                        </View>
                                        <Ionicons
                                            name={selectedIds.has(cal.id) ? 'checkbox' : 'square-outline'}
                                            size={24}
                                            color={selectedIds.has(cal.id) ? Colors.navy : Colors.subText}
                                        />
                                    </TouchableOpacity>
                                ))
                            )}
                        </View>
                    </>
                )}

                <Text style={styles.infoText}>
                    💡 선택한 캘린더의 일정만 앱 캘린더에 표시됩니다.
                </Text>
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#F5F6F8',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 12,
        backgroundColor: Colors.white,
        borderBottomWidth: 1,
        borderBottomColor: Colors.border,
    },
    backButton: {
        padding: 8,
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: Colors.text,
    },
    content: {
        flex: 1,
    },
    masterToggle: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: Colors.white,
        padding: 20,
        marginBottom: 8,
    },
    toggleLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    toggleTextContainer: {
        gap: 2,
    },
    toggleTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: Colors.text,
    },
    toggleSubtitle: {
        fontSize: 13,
        color: Colors.subText,
    },
    actionButtons: {
        flexDirection: 'row',
        gap: 12,
        paddingHorizontal: 16,
        paddingVertical: 12,
    },
    actionButton: {
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 20,
        backgroundColor: Colors.white,
        borderWidth: 1,
        borderColor: Colors.border,
    },
    actionButtonText: {
        fontSize: 13,
        color: Colors.text,
    },
    calendarList: {
        backgroundColor: Colors.white,
        padding: 16,
        marginBottom: 8,
    },
    listHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
    },
    showAllLink: {
        fontSize: 13,
        color: Colors.navy,
        fontWeight: '600',
    },
    sectionTitle: {
        fontSize: 15,
        fontWeight: '600',
        color: Colors.text,
    },
    calendarItem: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 14,
        borderBottomWidth: 1,
        borderBottomColor: Colors.border,
    },
    calendarLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
    },
    colorDot: {
        width: 14,
        height: 14,
        borderRadius: 7,
        marginRight: 12,
    },
    calendarInfo: {
        flex: 1,
    },
    calendarTitle: {
        fontSize: 15,
        color: Colors.text,
        marginBottom: 2,
    },
    calendarSource: {
        fontSize: 12,
        color: Colors.subText,
    },
    loadingText: {
        textAlign: 'center',
        color: Colors.subText,
        paddingVertical: 20,
    },
    emptyText: {
        textAlign: 'center',
        color: Colors.subText,
        paddingVertical: 20,
    },
    infoText: {
        fontSize: 13,
        color: Colors.subText,
        paddingHorizontal: 16,
        paddingVertical: 16,
        lineHeight: 20,
    },
});
