import { View, Text, StyleSheet, TouchableOpacity, Animated, Dimensions, Alert, Modal, TextInput, ScrollView } from 'react-native';
import { Stack, useRouter, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Calendar, CalendarList, DateData, LocaleConfig } from 'react-native-calendars';
import { Colors } from '../../constants/Colors';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useState, useCallback, useRef, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { EventDetailModal } from '../../components/EventDetailModal';
import { DayTimelineModal } from '../../components/DayTimelineModal';
import { EventTimeline } from '../../components/EventTimeline';
import { AddEventModal } from '../../components/AddEventModal';
import { getEvents, EventRecord, EventCategory, deleteEvent, deleteLedgerItem, updateEvent } from '../../services/supabase';
import { TaskListModal } from '../../components/TaskListModal';
import { getLunarInfo } from '../../services/LunarCalendarService';
import { DeviceCalendarService, DeviceEvent } from '../../services/DeviceCalendarService';
import { SkeletonCalendar } from '../../components/SkeletonCalendar';
import { useTheme } from '../../contexts/ThemeContext';

const { width } = Dimensions.get('window');

// 카테고리별 색상
const CATEGORY_COLORS: Record<string, string> = {
    ceremony: '#FF6B6B',
    todo: '#4A90D9',
    schedule: '#4ECDC4',
    wedding: '#FF6B6B',
    funeral: '#9E9E9E',
    birthday: '#FFD93D',
    other: '#4ECDC4',
    expense: '#FF4D4D', // 지출 (빨강)
    income: '#4D79FF',  // 수입 (파랑)
    transfer: '#FF9F43', // 이체 (오렌지)
    receipt: '#FF4D4D', // 영수증 (빨강)
};

// Configure Korean Locale
LocaleConfig.locales['kr'] = {
    monthNames: ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월'],
    monthNamesShort: ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월'],
    dayNames: ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'],
    dayNamesShort: ['일', '월', '화', '수', '목', '금', '토'],
    today: '오늘'
};
LocaleConfig.defaultLocale = 'kr';

export default function CalendarScreen() {
    const router = useRouter();
    const { colors } = useTheme();
    const [selectedDate, setSelectedDate] = useState('');
    const [detailModalVisible, setDetailModalVisible] = useState(false);
    const [selectedEvent, setSelectedEvent] = useState<EventRecord | null>(null);
    const [currentDate, setCurrentDate] = useState(new Date().toISOString().split('T')[0]);
    const currentMonth = parseInt(currentDate.split('-')[1], 10);

    // DB Data States
    const [events, setEvents] = useState<EventRecord[]>([]);
    const [externalEvents, setExternalEvents] = useState<DeviceEvent[]>([]); // 기기 일정
    const [markedDates, setMarkedDates] = useState<any>({});
    const [loading, setLoading] = useState(true);

    // 카테고리 필터 상태
    const [filters, setFilters] = useState<{ ceremony: boolean; todo: boolean; schedule: boolean; expense: boolean }>({
        ceremony: true,
        todo: true,
        schedule: true,
        expense: true, // 가계부 필터 기본 켜짐
    });

    // FAB 확장 상태
    const [fabExpanded, setFabExpanded] = useState(false);
    const fabAnimation = useRef(new Animated.Value(0)).current;

    // 수동 입력 Modal 상태
    const [addModalVisible, setAddModalVisible] = useState(false);
    const [addModalDate, setAddModalDate] = useState('');
    const [initialCategory, setInitialCategory] = useState<'ceremony' | 'todo' | 'schedule'>('schedule');

    // 타임라인 모달 상태 (월별 보기에서 사용)
    const [dayTimelineVisible, setDayTimelineVisible] = useState(false);
    const [selectedDayEvents, setSelectedDayEvents] = useState<EventRecord[]>([]);

    // 검색 모달 상태
    const [searchModalVisible, setSearchModalVisible] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<EventRecord[]>([]);

    const [editEvent, setEditEvent] = useState<EventRecord | null>(null); // State for editing
    // ✅ 보기 모드 상태 (month, week, day)
    const [viewMode, setViewMode] = useState<'month' | 'week' | 'day'>('month');

    // ✅ 보기 모드 선택 모달 상태
    const [viewModeModalVisible, setViewModeModalVisible] = useState(false);

    // ✅ 할 일 목록 모달 상태
    const [taskListVisible, setTaskListVisible] = useState(false);

    // ✅ 월 선택 모달 상태
    // ✅ 월 선택 모달 상태
    const [monthPickerVisible, setMonthPickerVisible] = useState(false);
    const currentYear = parseInt(currentDate.split('-')[0], 10);

    // Deep Link Init
    const { date: initialDateParam } = useLocalSearchParams();

    useEffect(() => {
        if (initialDateParam && typeof initialDateParam === 'string') {
            console.log('[Calendar] Deep link param:', initialDateParam);
            setCurrentDate(initialDateParam);
            setSelectedDate(initialDateParam);

            // ✅ 뷰 모드를 강제로 변경하지 않음 (사용자 요청)
            // setViewMode('day'); 

            // ✅ 데이터가 로드된 상태라면 즉시 갱신
            if (events.length > 0 || externalEvents.length > 0) {
                const mappedExternal: EventRecord[] = externalEvents.map(e => ({
                    id: e.id,
                    category: 'schedule',
                    type: 'schedule',
                    name: e.title,
                    date: e.startDate.split('T')[0],
                    source: 'external',
                    color: e.color,
                    startTime: e.startDate.includes('T') ? e.startDate.split('T')[1].substring(0, 5) : undefined,
                    endTime: e.endDate.includes('T') ? e.endDate.split('T')[1].substring(0, 5) : undefined,
                    location: e.location,
                    memo: e.notes
                }));
                const allEvents = [...events, ...mappedExternal];

                const dailyEvents = allEvents.filter(e => e.date === initialDateParam);
                setSelectedDayEvents(dailyEvents);
                setDayTimelineVisible(true);
            }
        }
    }, [initialDateParam, events, externalEvents]);

    // 데이터 로드 함수
    const fetchEvents = async () => {
        console.log('[Calendar] fetchEvents started');
        setLoading(true);

        // Safety timeout: 5초 뒤에 강제로 로딩 종료
        const timeout = setTimeout(() => {
            console.log('[Calendar] Force stopping loading after timeout');
            setLoading(false);
        }, 5000);

        try {
            console.log('[Calendar] Calling getEvents()...');
            const data = await getEvents();
            console.log('[Calendar] getEvents returned:', data?.length);

            clearTimeout(timeout); // 성공하면 타임아웃 해제

            setEvents(data);

            // 외부 캘린더 연동 설정 확인
            const syncSetting = await AsyncStorage.getItem('externalCalendarSync');
            const shouldSyncExternal = syncSetting !== 'false'; // 기본값 true

            let extData: DeviceEvent[] = [];
            if (shouldSyncExternal) {
                // 선택된 캘린더 ID 가져오기
                const savedIds = await AsyncStorage.getItem('selectedCalendarIds');
                const selectedIds = savedIds ? JSON.parse(savedIds) : undefined;

                // 기기 캘린더 가져오기
                const startDate = new Date();
                startDate.setMonth(startDate.getMonth() - 6);
                const endDate = new Date();
                endDate.setMonth(endDate.getMonth() + 6);
                extData = await DeviceCalendarService.getEvents(startDate, endDate, selectedIds);
                console.log('[Calendar] External events:', extData.length);
            } else {
                console.log('[Calendar] External calendar sync disabled');
            }
            setExternalEvents(extData);

            // 필터 적용하여 마킹
            updateMarkedDates(data, extData, filters);

            // 현재 선택된 날짜 데이터 갱신
            if (selectedDate) {
                const daily = data.filter(e => e.date === selectedDate);
                setSelectedDayEvents(daily);
            }
        } catch (error) {
            console.error('[Calendar] fetchEvents Error:', error);
            // Alert.alert('오류', '일정을 불러오지 못했습니다.'); // 너무 잦은 알림 방지
        } finally {
            console.log('[Calendar] fetchEvents finally block');
            setLoading(false);
        }
    };

    useFocusEffect(
        useCallback(() => {
            fetchEvents();
        }, [])
    );

    // 필터링된 markedDates 업데이트
    const updateMarkedDates = (internalData: EventRecord[], externalData: DeviceEvent[], activeFilters: typeof filters) => {
        const newMarkedDates: any = {};

        // 1. 내부 일정 처리
        internalData.forEach(event => {
            const category = event.category || 'ceremony';
            if (!activeFilters[category]) return;

            let color = CATEGORY_COLORS[category];

            // 1. 수입(받은 돈)은 무조건 파란색
            if (event.isReceived) {
                color = CATEGORY_COLORS.income;
            }
            // 2. 지출(영수증, 송금 보냄)은 빨간색
            else if (event.type === 'receipt' || (event.type === 'transfer' && !event.isReceived)) {
                color = CATEGORY_COLORS.expense;
            }
            // 3. 나머지는 기존 카테고리/타입 색상
            else {
                color = CATEGORY_COLORS[event.type] || CATEGORY_COLORS[category] || '#999';
            }

            if (!newMarkedDates[event.date]) {
                newMarkedDates[event.date] = { events: [] };
            }
            newMarkedDates[event.date].events.push({
                ...event,
                color,
            });
        });

        // 2. 외부 일정 처리 (schedule 필터가 켜진 경우에만 표시하거나, 항상 표시?)
        // 일단 'schedule' 필터에 종속시킨다.
        if (activeFilters.schedule) {
            const visibleExternal = externalData.filter(ext => {
                const dateStr = ext.startDate.split('T')[0];
                const isDuplicate = internalData.some(int => {
                    const nameMatch = (int.name || '').normalize('NFC').replace(/\s+/g, '') === (ext.title || '').normalize('NFC').replace(/\s+/g, '');

                    const intDate = new Date(int.date);
                    const extDate = new Date(dateStr);
                    const diffTime = Math.abs(intDate.getTime() - extDate.getTime());
                    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

                    return nameMatch && (int.date === dateStr || diffDays <= 1);
                });
                return !isDuplicate;
            });

            visibleExternal.forEach(event => {
                const dateStr = event.startDate.split('T')[0];
                if (!newMarkedDates[dateStr]) {
                    newMarkedDates[dateStr] = { events: [] };
                }
                newMarkedDates[dateStr].events.push({
                    id: event.id,
                    name: event.title,
                    type: 'external',
                    category: 'schedule', // 분류상 일정으로 취급
                    date: dateStr,
                    color: event.color || '#999', // 캘린더 색상 사용
                    isExternal: true // 구분용
                });
            });
        }

        setMarkedDates(newMarkedDates);
    };

    // 내부/외부 일정 합치기
    const getMergedEvents = useCallback(() => {
        const dedupeDebug = false;
        const mergedEventsLog = false;
        const mappedExternal: EventRecord[] = externalEvents.map(e => ({
            id: e.id,
            category: 'schedule',
            type: 'schedule',
            name: e.title,
            date: e.startDate.split('T')[0],
            source: 'external',
            color: e.color,
            startTime: e.startDate.includes('T') ? e.startDate.split('T')[1].substring(0, 5) : undefined,
            endTime: e.endDate.includes('T') ? e.endDate.split('T')[1].substring(0, 5) : undefined,
            location: e.location,
            memo: e.notes
        }));

        // ✅ 중복 제거: 내부 일정과 제목, 날짜가 같은 외부 일정은 숨김
        const filteredExternal = mappedExternal.filter(ext => {
            // Debug log for deduplication
            const duplicate = events.find(int => {
                // Normalize strings to handle NFC/NFD differences AND strip all spaces AND lower case
                const intName = (int.name || '').normalize('NFC').replace(/\s+/g, '').toLowerCase();
                const extName = (ext.name || '').normalize('NFC').replace(/\s+/g, '').toLowerCase();

                // Debug specific event
                if (dedupeDebug && (intName.includes('한화') || extName.includes('한화'))) {
                    console.log(`[Dedupe Check] Int: '${intName}'(${int.date}), Ext: '${extName}'(${ext.date})`);
                }

                const nameMatch = intName === extName;

                // Fuzzy date check (+/- 1 day)
                const intDate = new Date(int.date);
                const extDate = new Date(ext.date);
                const diffTime = Math.abs(intDate.getTime() - extDate.getTime());
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

                const dateMatch = int.date === ext.date || diffDays <= 1;

                if (dedupeDebug && (intName.includes('한화') || extName.includes('한화'))) {
                    console.log(`[Dedupe Result] NameMatch: ${nameMatch}, DateMatch: ${dateMatch} (Diff: ${diffDays})`);
                }

                return nameMatch && dateMatch;
            });

            if (duplicate) {
                if (mergedEventsLog) {
                    console.log(`[getMergedEvents] Hiding duplicate external event: ${ext.name} (${ext.date})`);
                }
                return false;
            }
            return true;
        });

        if (mergedEventsLog) {
            console.log(`[getMergedEvents] Internal: ${events.length}, External(Total): ${mappedExternal.length}, External(Filtered): ${filteredExternal.length}`);
        }
        return [...events, ...filteredExternal];
    }, [events, externalEvents]);

    // 필터 변경 시
    const toggleFilter = (category: EventCategory) => {
        const newFilters = { ...filters, [category]: !filters[category] };
        setFilters(newFilters);
        updateMarkedDates(events, externalEvents, newFilters);
    };

    // FAB 토글
    const toggleFab = () => {
        const toValue = fabExpanded ? 0 : 1;
        Animated.spring(fabAnimation, {
            toValue,
            useNativeDriver: true,
            friction: 5,
        }).start();
        setFabExpanded(!fabExpanded);
    };

    // FAB 서브 버튼 클릭
    const handleFabOption = (category: 'ceremony' | 'todo' | 'schedule' | 'expense') => {
        toggleFab();
        const today = new Date().toISOString().split('T')[0];
        setAddModalDate(today);
        setInitialCategory(category as any);
        setEditEvent(null); // Ensure creation mode
        setAddModalVisible(true);
    };

    // 날짜 선택 핸들러
    const handleDayPress = (date: any) => {
        setSelectedDate(date.dateString);

        // 날짜에 해당하는 모든 이벤트 필터링
        const allEvents = getMergedEvents();
        const dailyEvents = allEvents.filter(e => e.date === date.dateString);
        setSelectedDayEvents(dailyEvents);

        if (viewMode === 'month') {
            if (dailyEvents.length > 0) {
                setDayTimelineVisible(true);
            } else {
                setAddModalDate(date.dateString);
                setEditEvent(null); // Ensure creation mode
                setInitialCategory('schedule');
                setAddModalVisible(true);
            }
        }
    };

    // 월간 그리드 뷰 렌더링 셀
    const renderDay = useCallback(({ date, state }: { date: DateData, state: any }) => {
        const isSelected = date.dateString === selectedDate;
        const isToday = state === 'today';
        const isDisabled = state === 'disabled';
        const marker = markedDates[date.dateString];
        const dayEvents = marker?.events || [];

        // 음력 및 명절 정보 가져오기
        const y = date.year;
        const m = date.month;
        const d = date.day;
        const lunarInfo = getLunarInfo(y, m, d);

        // 일요일 또는 명절이면 빨간색
        const dObj = new Date(date.dateString);
        const dayOfWeek = dObj.getDay(); // 0: Sun
        const isRedDay = dayOfWeek === 0 || lunarInfo.isHoliday;

        // ✅ 가계부 모드인지 확인 (가계부 필터만 켜져있고 나머지는 꺼져있을 때)
        const isLedgerOnlyMode = filters.expense && !filters.ceremony && !filters.todo && !filters.schedule;

        // 가계부 모드일 때 합계 계산
        let dailyIncome = 0;
        let dailyExpense = 0;

        if (isLedgerOnlyMode) {
            dayEvents.forEach((event: any) => {
                const amt = event.amount || 0;
                if (event.isReceived) {
                    dailyIncome += Math.abs(amt);
                } else {
                    dailyExpense += Math.abs(amt);
                }
            });
        }

        return (
            <TouchableOpacity
                style={styles.dayCell}
                onPress={() => handleDayPress(date)}
                activeOpacity={0.7}
            >
                <View style={[
                    styles.dayNumber,
                    isToday && styles.todayNumber,
                    isSelected && styles.selectedNumber,
                ]}>
                    <Text style={[
                        styles.dayText,
                        isToday && styles.todayText,
                        isSelected && styles.selectedText,
                        isDisabled && styles.disabledText,
                        !isToday && !isSelected && !isDisabled && isRedDay && styles.holidayNumberText // 빨간날
                    ]}>
                        {date.day}
                    </Text>
                </View>

                {/* 음력/명절 표시 */}
                <Text style={lunarInfo.isHoliday ? styles.holidayText : styles.lunarText}>
                    {lunarInfo.holidayName || lunarInfo.lunarDate}
                </Text>

                {isLedgerOnlyMode ? (
                    // ✅ 가계부 모드: 금액 표시
                    <View style={{ marginTop: 2, alignItems: 'center', width: '100%' }}>
                        {dailyIncome > 0 && (
                            <Text style={{ fontSize: 9, color: '#0064FF', fontFamily: 'Pretendard-Bold' }} numberOfLines={1}>
                                +{dailyIncome.toLocaleString()}
                            </Text>
                        )}
                        {dailyExpense > 0 && (
                            <Text style={{ fontSize: 9, color: '#FF4D4D', fontFamily: 'Pretendard-Bold' }} numberOfLines={1}>
                                -{dailyExpense.toLocaleString()}
                            </Text>
                        )}
                    </View>
                ) : (
                    // ✅ 일반 모드: 점(Dot) 태그 표시
                    <View style={styles.eventTags}>
                        {dayEvents.slice(0, 3).map((event: any, idx: number) => (
                            <View key={idx} style={[styles.eventTag, { backgroundColor: event.color }]}>
                                <Text style={styles.eventTagText} numberOfLines={1}>
                                    {event.name}
                                </Text>
                            </View>
                        ))}
                        {dayEvents.length > 3 && (
                            <Text style={styles.moreText}>+{dayEvents.length - 3}</Text>
                        )}
                    </View>
                )}
            </TouchableOpacity>
        );
    }, [markedDates, selectedDate, events, viewMode, filters]);

    // ✅ 일별 보기 렌더링
    const renderDayView = () => {
        // currentDate 기준
        const targetDate = currentDate;
        const allEvents = getMergedEvents();
        const dayEvents = allEvents.filter(e => e.date === targetDate);
        const [year, month, day] = targetDate.split('-');

        return (
            <View style={{ flex: 1, backgroundColor: colors.background }}>
                <View style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.background }}>
                    <Text style={{ fontFamily: 'Pretendard-Bold', fontSize: 20, color: colors.text }}>
                        {month}월 {day}일
                    </Text>
                    <Text style={{ fontFamily: 'Pretendard-Medium', fontSize: 14, color: colors.subText }}>
                        {year}년
                    </Text>
                </View>
                <EventTimeline
                    events={dayEvents}
                    title="" // 타이틀 숨김
                    onEventsChange={fetchEvents}
                    onEventEdit={(event) => {
                        setEditEvent(event);
                        setAddModalDate(event.date);
                        setAddModalVisible(true);
                    }}
                />
            </View>
        );
    };

    // ✅ 주별 보기 렌더링
    const renderWeekView = () => {
        const curr = new Date(currentDate);
        const day = curr.getDay();
        const diff = curr.getDate() - day; // 일요일
        const allEvents = getMergedEvents();

        const weekDates = [];
        for (let i = 0; i < 7; i++) {
            const date = new Date(curr);
            date.setDate(diff + i);
            weekDates.push(date.toISOString().split('T')[0]);
        }

        return (
            <ScrollView style={{ flex: 1, backgroundColor: colors.background }}>
                <View style={styles.weekContainer}>
                    {weekDates.map((dateStr, idx) => {
                        const dateObj = new Date(dateStr);
                        const dayNum = dateObj.getDate();
                        const isSelected = dateStr === currentDate;
                        const dayEvents = allEvents.filter(e => e.date === dateStr);

                        return (
                            <TouchableOpacity
                                key={dateStr}
                                style={styles.weekDayColumn}
                                onPress={() => {
                                    setCurrentDate(dateStr);
                                    setSelectedDate(dateStr);
                                    setViewMode('day'); // 날짜 클릭 시 일별 보기로 이동
                                }}
                            >
                                <Text style={[
                                    styles.weekDayText,
                                    idx === 0 && { color: '#FF6B6B' },
                                    idx === 6 && { color: '#4A90D9' }
                                ]}>
                                    {['일', '월', '화', '수', '목', '금', '토'][idx]}
                                </Text>
                                <Text style={[
                                    styles.weekDateText,
                                    isSelected && { color: Colors.orange }
                                ]}>
                                    {dayNum}
                                </Text>

                                {dayEvents.map((event, eventIdx) => (
                                    <View key={eventIdx} style={[styles.weekEventItem, { backgroundColor: CATEGORY_COLORS[event.category] || '#999' }]}>
                                        <Text style={styles.weekEventText} numberOfLines={1}>
                                            {event.name}
                                        </Text>
                                    </View>
                                ))}
                            </TouchableOpacity>
                        );
                    })}
                </View>
            </ScrollView>
        );
    };

    const fabSubStyle = (index: number): any => ({
        opacity: fabAnimation,
        transform: [
            { translateY: fabAnimation.interpolate({ inputRange: [0, 1], outputRange: [0, -70 * (index + 1)] }) },
            { scale: fabAnimation.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] }) },
        ],
    });

    const handleEventSaved = () => {
        fetchEvents();
    };

    const handleDeleteEvent = async (event: EventRecord) => {
        try {
            setLoading(true);
            setDetailModalVisible(false); // 상세 모달 닫기

            console.log('[handleDeleteEvent] Deleting event:', { id: event.id, source: event.source, name: event.name });

            // ✅ 외부 캘린더 일정은 삭제 불가
            if (event.source === 'external') {
                Alert.alert('삭제 불가', '외부 캘린더 일정은 해당 앱에서 삭제해주세요.');
                setLoading(false);
                return;
            }

            // ✅ source 필드 검증
            if (!event.source) {
                console.error('[handleDeleteEvent] source가 없습니다:', event);
                Alert.alert('오류', '삭제할 수 없는 항목입니다. (source 없음)');
                setLoading(false);
                return;
            }

            // TaskListModal에서는 자동으로 리스트가 갱신되겠지만 loading 상태 갱신 필요
            if (event.source === 'ledger') {
                await deleteLedgerItem(event.id);
            } else if (event.source === 'bank_transactions') {
                const { deleteBankTransaction } = await import('../../services/supabase');
                await deleteBankTransaction(event.id);
            } else if (event.source === 'events') {
                await deleteEvent(event.id);
            } else {
                console.error('[handleDeleteEvent] 알 수 없는 source:', event.source);
                Alert.alert('오류', '삭제할 수 없는 항목입니다.');
                setLoading(false);
                return;
            }
            await fetchEvents();
            Alert.alert('삭제 완료', '내역이 삭제되었습니다.');
        } catch (error: any) {
            console.error(error);
            Alert.alert('오류', error.message || '삭제 중 문제가 발생했습니다.');
            setLoading(false);
        }
    };

    // 할 일 완료 토글
    const handleToggleTaskComplete = async (task: EventRecord) => {
        try {
            const newStatus = !task.isCompleted;
            // 낙관적 업데이트 (UI 먼저 반영) -> 실제 구현은 fetchEvents에서 처리하므로 생략 가능하나, 빠른 반응을 위해 로컬 state만 먼저 바꿀 수도 있음.
            // 여기서는 안전하게 DB 업데이트 후 재조회
            await updateEvent(task.id, { is_completed: newStatus });
            await fetchEvents();
        } catch (error) {
            console.error("Failed to toggle task completion:", error);
            Alert.alert('오류', '상태 변경에 실패했습니다.');
        }
    };

    // 할 일 추가
    const handleAddTask = () => {
        setTaskListVisible(false); // 목록 모달 닫기 (선택사항, 겹쳐서 띄울지 닫고 띄울지) -> 여기선 닫고 추가 모달 띄우기
        const today = new Date().toISOString().split('T')[0];
        setAddModalDate(today);
        setInitialCategory('todo'); // 할 일 카테고리로 설정
        setEditEvent(null); // Ensure creation mode
        setAddModalVisible(true);
    };

    return (
        <View style={styles.container}>
            <Stack.Screen options={{ headerShown: false }} />

            {/* 헤더 */}
            <View style={styles.header}>
                <TouchableOpacity style={styles.headerLeft} onPress={() => Alert.alert('메뉴', '준비 중인 기능입니다.', [{ text: '확인' }])}>
                    <Ionicons name="menu" size={24} color="#fff" />
                </TouchableOpacity>
                <TouchableOpacity style={styles.headerCenter} onPress={() => setMonthPickerVisible(true)}>
                    <Text style={styles.monthText}>
                        {viewMode === 'day'
                            ? `${currentDate.split('-')[1]}월 ${currentDate.split('-')[2]}일`
                            : viewMode === 'week'
                                ? `${currentDate.split('-')[1]}월`
                                : `${currentMonth}월`
                        }
                    </Text>
                    <Ionicons name="chevron-down" size={16} color="#fff" />
                </TouchableOpacity>
                <View style={styles.headerRight}>
                    <TouchableOpacity style={styles.headerIcon} onPress={() => { setSearchQuery(''); setSearchResults([]); setSearchModalVisible(true); }}>
                        <Ionicons name="search" size={22} color="#fff" />
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.headerIcon} onPress={() => setViewModeModalVisible(true)}>
                        <Ionicons name="calendar-outline" size={22} color="#fff" />
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.headerIcon} onPress={() => setTaskListVisible(true)}>
                        <Ionicons name="checkmark-circle-outline" size={22} color="#fff" />
                    </TouchableOpacity>
                </View>
            </View>

            {/* 필터 (모든 뷰에서 보일지, 월별만 보일지 선택 필요하지만 일단 유지) */}
            <View style={styles.filterContainer}>
                <TouchableOpacity style={[styles.filterChip, filters.ceremony && { backgroundColor: CATEGORY_COLORS.ceremony }]} onPress={() => toggleFilter('ceremony')}>
                    <Ionicons name="heart" size={14} color={filters.ceremony ? '#fff' : CATEGORY_COLORS.ceremony} />
                    <Text style={[styles.filterText, filters.ceremony && { color: '#fff' }]}>경조사</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.filterChip, filters.todo && { backgroundColor: CATEGORY_COLORS.todo }]} onPress={() => toggleFilter('todo')}>
                    <Ionicons name="checkbox" size={14} color={filters.todo ? '#fff' : CATEGORY_COLORS.todo} />
                    <Text style={[styles.filterText, filters.todo && { color: '#fff' }]}>할일</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.filterChip, filters.schedule && { backgroundColor: CATEGORY_COLORS.schedule }]} onPress={() => toggleFilter('schedule')}>
                    <Ionicons name="calendar" size={14} color={filters.schedule ? '#fff' : CATEGORY_COLORS.schedule} />
                    <Text style={[styles.filterText, filters.schedule && { color: '#fff' }]}>일정</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.filterChip, filters.expense && { backgroundColor: CATEGORY_COLORS.expense }]} onPress={() => toggleFilter('expense')}>
                    <Ionicons name="receipt" size={14} color={filters.expense ? '#fff' : CATEGORY_COLORS.expense} />
                    <Text style={[styles.filterText, filters.expense && { color: '#fff' }]}>가계부</Text>
                </TouchableOpacity>
            </View>

            {/* 요일 헤더 (월별 보기에만) */}
            {
                viewMode === 'month' && (
                    <View style={styles.weekHeader}>
                        {['일', '월', '화', '수', '목', '금', '토'].map((day, idx) => (
                            <Text key={day} style={[styles.weekDay, idx === 0 && { color: '#FF6B6B' }, idx === 6 && { color: '#4A90D9' }]}>
                                {day}
                            </Text>
                        ))}
                    </View>
                )
            }

            {
                loading ? (
                    <SkeletonCalendar />
                ) : (
                    <>
                        {viewMode === 'month' && (
                            <Calendar
                                key={currentDate} // 날짜 변경 시 강제 리렌더링
                                markedDates={markedDates}
                                theme={{
                                    calendarBackground: Colors.navy,
                                    textSectionTitleColor: 'transparent',
                                    monthTextColor: 'transparent',
                                    textMonthFontFamily: 'Pretendard-Bold',
                                    textMonthFontSize: 1,
                                }}
                                enableSwipeMonths={true}
                                dayComponent={renderDay as any}
                                onMonthChange={(date) => setCurrentDate(date.dateString)}
                                current={currentDate}
                                hideArrows={true}
                                hideDayNames={true}
                            />
                        )}
                        {viewMode === 'day' && renderDayView()}
                        {viewMode === 'week' && renderWeekView()}
                    </>
                )
            }

            {/* FAB UI (축약) - styles 정의 필요 */}
            {fabExpanded && <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={toggleFab} />}
            <View style={styles.fabContainer}>
                {fabExpanded && (
                    <>
                        <Animated.View style={[styles.fabSub, fabSubStyle(3)]}>
                            <TouchableOpacity style={[styles.fabSubButton, { backgroundColor: CATEGORY_COLORS.expense }]} onPress={() => handleFabOption('expense')}>
                                <Ionicons name="receipt-outline" size={20} color="#fff" />
                                <Text style={styles.fabSubText}>가계부</Text>
                            </TouchableOpacity>
                        </Animated.View>
                        <Animated.View style={[styles.fabSub, fabSubStyle(2)]}>
                            <TouchableOpacity style={[styles.fabSubButton, { backgroundColor: CATEGORY_COLORS.schedule }]} onPress={() => handleFabOption('schedule')}>
                                <Ionicons name="calendar-outline" size={20} color="#fff" />
                                <Text style={styles.fabSubText}>단순 일정</Text>
                            </TouchableOpacity>
                        </Animated.View>
                        <Animated.View style={[styles.fabSub, fabSubStyle(1)]}>
                            <TouchableOpacity style={[styles.fabSubButton, { backgroundColor: CATEGORY_COLORS.todo }]} onPress={() => handleFabOption('todo')}>
                                <Ionicons name="checkbox-outline" size={20} color="#fff" />
                                <Text style={styles.fabSubText}>할 일</Text>
                            </TouchableOpacity>
                        </Animated.View>
                        <Animated.View style={[styles.fabSub, fabSubStyle(0)]}>
                            <TouchableOpacity style={[styles.fabSubButton, { backgroundColor: CATEGORY_COLORS.ceremony }]} onPress={() => handleFabOption('ceremony')}>
                                <Ionicons name="heart-outline" size={20} color="#fff" />
                                <Text style={styles.fabSubText}>경조사</Text>
                            </TouchableOpacity>
                        </Animated.View>
                    </>
                )}
                <TouchableOpacity style={styles.fab} onPress={toggleFab}>
                    <Ionicons name={fabExpanded ? "close" : "add"} size={30} color="#fff" />
                </TouchableOpacity>
            </View>

            {/* Day Timeline Modal */}
            <DayTimelineModal
                visible={dayTimelineVisible}
                date={selectedDate}
                events={selectedDayEvents}
                onClose={() => setDayTimelineVisible(false)}
                onEventsChange={fetchEvents}
                onAddEvent={() => {
                    setAddModalDate(selectedDate);
                    setEditEvent(null); // Ensure creation mode
                    setInitialCategory('schedule');
                    setAddModalVisible(true);
                }}
                onEventPress={(event) => {
                    setSelectedEvent(event);
                    setDetailModalVisible(true);
                }}
                onEventEdit={(event) => {
                    setDayTimelineVisible(false); // Close timeline if open
                    setEditEvent(event);
                    setAddModalDate(event.date);
                    setAddModalVisible(true);
                }}
            />

            {/* Event Detail Modal with Edit Support */}
            <EventDetailModal
                visible={detailModalVisible}
                event={selectedEvent}
                onClose={() => setDetailModalVisible(false)}
                onDelete={handleDeleteEvent}
                onEdit={(event) => {
                    setDetailModalVisible(false);
                    setDayTimelineVisible(false); // Close timeline if open
                    setEditEvent(event);
                    setAddModalDate(event.date); // or event.dateString
                    setAddModalVisible(true);
                }}
            />

            {/* Add Event Modal with Edit Support */}
            <AddEventModal
                visible={addModalVisible}
                onClose={() => {
                    setAddModalVisible(false);
                    setEditEvent(null); // Reset edit state on close
                }}
                onSaved={() => {
                    fetchEvents();
                    setEditEvent(null);
                }}
                initialDate={addModalDate}
                initialCategory={initialCategory}
                editEvent={editEvent}
            />

            {/* 검색 모달 */}
            <Modal
                visible={searchModalVisible}
                animationType="slide"
                transparent={true}
                onRequestClose={() => setSearchModalVisible(false)}
            >
                <View style={styles.searchModalOverlay}>
                    <View style={styles.searchModalContent}>
                        <View style={styles.searchHeader}>
                            <Text style={styles.searchTitle}>일정 검색</Text>
                            <TouchableOpacity onPress={() => setSearchModalVisible(false)}>
                                <Ionicons name="close" size={24} color={Colors.text} />
                            </TouchableOpacity>
                        </View>

                        <View style={styles.searchInputContainer}>
                            <Ionicons name="search" size={20} color={Colors.subText} />
                            <TextInput
                                style={styles.searchInput}
                                placeholder="검색어를 입력하세요"
                                value={searchQuery}
                                onChangeText={(text) => {
                                    setSearchQuery(text);
                                    if (text.trim() === '') {
                                        setSearchResults([]);
                                    } else {
                                        const filtered = events.filter(e =>
                                            e.name.toLowerCase().includes(text.toLowerCase()) ||
                                            (e.memo && e.memo.toLowerCase().includes(text.toLowerCase()))
                                        );
                                        setSearchResults(filtered);
                                    }
                                }}
                                autoFocus={true}
                            />
                        </View>

                        <ScrollView style={styles.searchResultsList}>
                            {searchResults.length > 0 ? (
                                searchResults.map((event, idx) => (
                                    <TouchableOpacity
                                        key={idx}
                                        style={styles.searchResultItem}
                                        onPress={() => {
                                            setSearchModalVisible(false);
                                            setCurrentDate(event.date);
                                            setSelectedDate(event.date);
                                            const dailyEvents = events.filter(e => e.date === event.date);
                                            setSelectedDayEvents(dailyEvents);
                                            setDayTimelineVisible(true);
                                        }}
                                    >
                                        <View style={[styles.searchResultDot, { backgroundColor: CATEGORY_COLORS[event.category] || '#999' }]} />
                                        <View style={styles.searchResultInfo}>
                                            <Text style={styles.searchResultName}>{event.name}</Text>
                                            <Text style={styles.searchResultDate}>{event.date}</Text>
                                        </View>
                                        {event.amount && (
                                            <Text style={[styles.searchResultAmount, { color: event.isReceived ? '#4D79FF' : '#FF4D4D' }]}>
                                                {event.isReceived ? '+' : '-'}{Math.abs(event.amount).toLocaleString()}원
                                            </Text>
                                        )}
                                    </TouchableOpacity>
                                ))
                            ) : searchQuery.trim().length > 0 ? (
                                <Text style={styles.noResultText}>검색 결과가 없습니다.</Text>
                            ) : (
                                <Text style={styles.noResultText}>검색어를 입력하세요.</Text>
                            )}
                        </ScrollView>
                    </View>
                </View>
            </Modal>

            {/* 보기 설정 모달 (Android 대응) */}
            <Modal
                visible={viewModeModalVisible}
                transparent={true}
                animationType="fade"
                onRequestClose={() => setViewModeModalVisible(false)}
            >
                <TouchableOpacity
                    style={styles.modalOverlay}
                    activeOpacity={1}
                    onPress={() => setViewModeModalVisible(false)}
                >
                    <View style={styles.modalContent}>
                        <Text style={styles.modalTitle}>보기 방식 선택</Text>

                        <TouchableOpacity style={styles.modalItem} onPress={() => {
                            setSelectedDate(currentDate);
                            setViewMode('day');
                            setViewModeModalVisible(false);
                        }}>
                            <Ionicons name="today-outline" size={20} color={Colors.text} />
                            <Text style={styles.modalItemText}>일별 보기</Text>
                            {viewMode === 'day' && <Ionicons name="checkmark" size={20} color={Colors.navy} />}
                        </TouchableOpacity>

                        <TouchableOpacity style={styles.modalItem} onPress={() => {
                            setViewMode('week');
                            setViewModeModalVisible(false);
                        }}>
                            <Ionicons name="calendar-outline" size={20} color={Colors.text} />
                            <Text style={styles.modalItemText}>주별 보기</Text>
                            {viewMode === 'week' && <Ionicons name="checkmark" size={20} color={Colors.navy} />}
                        </TouchableOpacity>

                        <TouchableOpacity style={styles.modalItem} onPress={() => {
                            setViewMode('month');
                            setViewModeModalVisible(false);
                        }}>
                            <Ionicons name="grid-outline" size={20} color={Colors.text} />
                            <Text style={styles.modalItemText}>월별 보기</Text>
                            {viewMode === 'month' && <Ionicons name="checkmark" size={20} color={Colors.navy} />}
                        </TouchableOpacity>
                    </View>
                </TouchableOpacity>
            </Modal>

            {/* 월 선택 모달 */}
            <Modal
                visible={monthPickerVisible}
                transparent={true}
                animationType="slide"
                onRequestClose={() => setMonthPickerVisible(false)}
            >
                <TouchableOpacity
                    style={styles.monthPickerOverlay}
                    activeOpacity={1}
                    onPress={() => setMonthPickerVisible(false)}
                >
                    <View style={styles.monthPickerContainer}>
                        <View style={styles.monthPickerHeader}>
                            <TouchableOpacity
                                onPress={() => {
                                    const newYear = currentYear - 1;
                                    setCurrentDate(`${newYear}-${String(currentMonth).padStart(2, '0')}-01`);
                                }}
                            >
                                <Ionicons name="chevron-back" size={24} color={Colors.text} />
                            </TouchableOpacity>
                            <Text style={styles.monthPickerYear}>{currentYear}년</Text>
                            <TouchableOpacity
                                onPress={() => {
                                    const newYear = currentYear + 1;
                                    setCurrentDate(`${newYear}-${String(currentMonth).padStart(2, '0')}-01`);
                                }}
                            >
                                <Ionicons name="chevron-forward" size={24} color={Colors.text} />
                            </TouchableOpacity>
                        </View>

                        <View style={styles.monthPickerGrid}>
                            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((month) => {
                                const isSelected = month === currentMonth && currentYear === parseInt(currentDate.split('-')[0], 10);
                                const today = new Date();
                                const isCurrentMonth = month === (today.getMonth() + 1) && currentYear === today.getFullYear();

                                return (
                                    <TouchableOpacity
                                        key={month}
                                        style={[
                                            styles.monthPickerItem,
                                            isSelected && styles.monthPickerItemSelected,
                                            isCurrentMonth && !isSelected && styles.monthPickerItemCurrent,
                                        ]}
                                        onPress={() => {
                                            const newDate = `${currentYear}-${String(month).padStart(2, '0')}-01`;
                                            setCurrentDate(newDate);
                                            setMonthPickerVisible(false);
                                        }}
                                    >
                                        <Text style={[
                                            styles.monthPickerItemText,
                                            isSelected && styles.monthPickerItemTextSelected,
                                            isCurrentMonth && !isSelected && styles.monthPickerItemTextCurrent,
                                        ]}>
                                            {month}월
                                        </Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>

                        <TouchableOpacity
                            style={styles.monthPickerTodayButton}
                            onPress={() => {
                                const today = new Date().toISOString().split('T')[0];
                                setCurrentDate(today);
                                setMonthPickerVisible(false);
                            }}
                        >
                            <Text style={styles.monthPickerTodayText}>오늘로 이동</Text>
                        </TouchableOpacity>
                    </View>
                </TouchableOpacity>
            </Modal>

            <TaskListModal
                visible={taskListVisible}
                onClose={() => setTaskListVisible(false)}
                tasks={events.filter(e => e.category === 'todo')}
                onToggleComplete={handleToggleTaskComplete}
                onAddTask={handleAddTask}
                onDeleteTask={handleDeleteEvent}
            />
        </View >
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.navy,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingTop: 50,
        paddingBottom: 12,
        backgroundColor: Colors.navy,
    },
    headerLeft: {
        padding: 8,
    },
    headerCenter: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    monthText: {
        fontFamily: 'Pretendard-Bold',
        fontSize: 20,
        color: '#fff',
    },
    headerRight: {
        flexDirection: 'row',
        gap: 8,
    },
    headerIcon: {
        padding: 8,
    },
    filterContainer: {
        flexDirection: 'row',
        justifyContent: 'center',
        paddingVertical: 8,
        gap: 8,
        backgroundColor: Colors.navy,
    },
    filterChip: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.3)',
        gap: 4,
    },
    filterText: {
        fontFamily: 'Pretendard-Medium',
        fontSize: 12,
        color: '#ccc',
    },
    weekHeader: {
        flexDirection: 'row',
        paddingHorizontal: 8,
        paddingVertical: 8,
        backgroundColor: Colors.navy,
    },
    weekDay: {
        flex: 1,
        textAlign: 'center',
        fontFamily: 'Pretendard-Medium',
        fontSize: 12,
        color: '#888',
    },
    dayCell: {
        width: (width - 16) / 7,
        minHeight: 80,
        paddingVertical: 4,
        paddingHorizontal: 2,
        borderTopWidth: 0.5,
        borderTopColor: 'rgba(255,255,255,0.1)',
    },
    dayNumber: {
        width: 24,
        height: 24,
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
        alignSelf: 'center',
    },
    todayNumber: {
        borderWidth: 1,
        borderColor: Colors.orange,
    },
    selectedNumber: {
        backgroundColor: Colors.orange,
    },
    dayText: {
        fontFamily: 'Pretendard-Medium',
        fontSize: 13,
        color: '#fff',
    },
    todayText: {
        color: Colors.orange,
        fontFamily: 'Pretendard-Bold',
    },
    selectedText: {
        color: '#fff',
        fontFamily: 'Pretendard-Bold',
    },
    disabledText: {
        color: '#4d5c6b',
    },
    eventTags: {
        marginTop: 2,
        gap: 1,
    },
    eventTag: {
        paddingHorizontal: 4,
        paddingVertical: 1,
        borderRadius: 2,
        marginBottom: 1,
    },
    eventTagText: {
        fontFamily: 'Pretendard-Regular',
        fontSize: 9,
        color: '#fff',
    },
    moreText: {
        fontFamily: 'Pretendard-Medium',
        fontSize: 9,
        color: '#888',
        textAlign: 'center',
    },
    fabContainer: {
        position: 'absolute',
        bottom: 90,
        right: 20,
        alignItems: 'center',
        zIndex: 100,
    },
    fab: {
        width: 56,
        height: 56,
        borderRadius: 28,
        backgroundColor: '#5B7FBF',
        justifyContent: 'center',
        alignItems: 'center',
        elevation: 5,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 4,
    },
    fabSub: {
        position: 'absolute',
        bottom: 0,
        alignItems: 'center',
    },
    fabSubButton: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderRadius: 24,
        gap: 8,
        elevation: 3,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.2,
        shadowRadius: 2,
    },
    fabSubText: {
        fontFamily: 'Pretendard-Medium',
        fontSize: 14,
        color: '#fff',
    },
    overlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.3)',
    },
    searchModalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'flex-start',
        paddingTop: 80,
    },
    searchModalContent: {
        backgroundColor: Colors.white,
        marginHorizontal: 16,
        borderRadius: 16,
        maxHeight: '70%',
        overflow: 'hidden',
    },
    searchHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#eee',
    },
    searchTitle: {
        fontFamily: 'Pretendard-Bold',
        fontSize: 18,
        color: Colors.text,
    },
    searchInputContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#f5f5f5',
        margin: 16,
        marginTop: 8,
        paddingHorizontal: 12,
        borderRadius: 10,
        gap: 8,
    },
    searchInput: {
        flex: 1,
        fontFamily: 'Pretendard-Regular',
        fontSize: 16,
        paddingVertical: 12,
        color: Colors.text,
    },
    searchResultsList: {
        maxHeight: 300,
    },
    searchResultItem: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#f0f0f0',
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    modalContent: {
        width: '80%',
        backgroundColor: 'white',
        borderRadius: 16,
        padding: 20,
        elevation: 5,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 4,
    },
    modalTitle: {
        fontFamily: 'Pretendard-Bold',
        fontSize: 18,
        marginBottom: 16,
        textAlign: 'center',
        color: Colors.text,
    },
    modalItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        paddingHorizontal: 8,
        borderBottomWidth: 1,
        borderBottomColor: '#f0f0f0',
    },
    modalItemText: {
        flex: 1,
        fontFamily: 'Pretendard-Medium',
        fontSize: 16,
        color: Colors.text,
        marginLeft: 10,
    },
    searchResultDot: {
        width: 10,
        height: 10,
        borderRadius: 5,
        marginRight: 12,
    },
    searchResultInfo: {
        flex: 1,
    },
    searchResultName: {
        fontFamily: 'Pretendard-Medium',
        fontSize: 15,
        color: Colors.text,
    },
    searchResultDate: {
        fontFamily: 'Pretendard-Regular',
        fontSize: 12,
        color: Colors.subText,
        marginTop: 2,
    },
    searchResultAmount: {
        fontFamily: 'Pretendard-Bold',
        fontSize: 14,
    },
    noResultText: {
        fontFamily: 'Pretendard-Regular',
        fontSize: 14,
        color: Colors.subText,
        textAlign: 'center',
        padding: 24,
    },
    yearGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        padding: 16,
    },
    monthCell: {
        width: (width - 48) / 3,
        aspectRatio: 1,
        backgroundColor: '#fff',
        borderRadius: 12,
        marginBottom: 16,
        padding: 12,
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
    },
    monthCellText: {
        fontFamily: 'Pretendard-Bold',
        fontSize: 18,
        color: Colors.navy,
        marginBottom: 4,
    },
    eventCountText: {
        fontFamily: 'Pretendard-Regular',
        fontSize: 12,
        color: Colors.subText,
    },
    currentMonthCell: {
        borderWidth: 2,
        borderColor: Colors.orange,
    },
    weekContainer: {
        flex: 1,
        flexDirection: 'row',
        backgroundColor: '#fff',
    },
    weekDayColumn: {
        flex: 1,
        borderRightWidth: 1,
        borderRightColor: '#f0f0f0',
        alignItems: 'center',
        paddingTop: 8,
    },
    weekDayText: {
        fontFamily: 'Pretendard-Medium',
        fontSize: 12,
        color: '#888',
        marginBottom: 4,
    },
    weekDateText: {
        fontFamily: 'Pretendard-Bold',
        fontSize: 16,
        color: Colors.text,
        marginBottom: 8,
    },
    weekEventItem: {
        width: '90%',
        padding: 4,
        borderRadius: 4,
        marginBottom: 4,
    },
    weekEventText: {
        fontSize: 10,
        color: '#fff',
        fontFamily: 'Pretendard-Regular',
    },
    // 월 선택 모달 스타일
    monthPickerOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'flex-end',
    },
    monthPickerContainer: {
        backgroundColor: Colors.white,
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        paddingTop: 20,
        paddingBottom: 40,
        paddingHorizontal: 20,
    },
    monthPickerHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 20,
        paddingHorizontal: 20,
    },
    monthPickerYear: {
        fontFamily: 'Pretendard-Bold',
        fontSize: 20,
        color: Colors.text,
    },
    monthPickerGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
    },
    monthPickerItem: {
        width: '30%',
        paddingVertical: 16,
        marginBottom: 12,
        borderRadius: 12,
        backgroundColor: '#F5F6F8',
        alignItems: 'center',
    },
    monthPickerItemSelected: {
        backgroundColor: Colors.navy,
    },
    monthPickerItemCurrent: {
        borderWidth: 2,
        borderColor: Colors.orange,
    },
    monthPickerItemText: {
        fontFamily: 'Pretendard-Medium',
        fontSize: 16,
        color: Colors.text,
    },
    monthPickerItemTextSelected: {
        color: Colors.white,
        fontFamily: 'Pretendard-Bold',
    },
    monthPickerItemTextCurrent: {
        color: Colors.orange,
        fontFamily: 'Pretendard-Bold',
    },
    monthPickerTodayButton: {
        marginTop: 16,
        paddingVertical: 14,
        backgroundColor: Colors.orange,
        borderRadius: 12,
        alignItems: 'center',
    },
    monthPickerTodayText: {
        fontFamily: 'Pretendard-Bold',
        fontSize: 16,
        color: Colors.white,
    },
    // Lunar Calendar Styles
    lunarText: {
        fontFamily: 'Pretendard-Regular',
        fontSize: 9,
        color: '#666',
        textAlign: 'center',
        marginTop: 1,
        marginBottom: 1,
    },
    holidayText: {
        fontFamily: 'Pretendard-Medium',
        fontSize: 9,
        color: '#FF6B6B',
        textAlign: 'center',
        marginTop: 1,
        marginBottom: 1,
    },
    holidayNumberText: {
        color: '#FF6B6B',
    },
});
