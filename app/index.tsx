import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Animated, Easing, Pressable, RefreshControl } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Colors } from '../constants/Colors';
import { useRouter } from 'expo-router';
import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase, getTodayEvents, getUpcomingEvents, fetchPeriodStats, EventRecord } from '../services/supabase';
import { getEventEmoji } from '../services/EmojiService';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../contexts/ThemeContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function Home() {
    const router = useRouter();
    const { colors, isDark } = useTheme();
    const insets = useSafeAreaInsets();
    const [stats, setStats] = useState({
        totalGiven: 0,
        totalReceived: 0,
        pendingGiven: 0,
        diff: 0,
        spendingDiff: 0 // Added for vs Last Month
    });
    const [todayEvents, setTodayEvents] = useState<EventRecord[]>([]);
    const [upcomingEvents, setUpcomingEvents] = useState<EventRecord[]>([]);
    const [refreshing, setRefreshing] = useState(false);

    // Ripple Animation (2개만 사용 - 잔잔하게)
    const ripple1 = useRef(new Animated.Value(0)).current;
    const ripple2 = useRef(new Animated.Value(0)).current;

    // 버튼 press 애니메이션
    const scaleValue = useRef(new Animated.Value(1)).current;

    const handlePressIn = () => {
        Animated.spring(scaleValue, {
            toValue: 0.92,
            useNativeDriver: true,
        }).start();
    };

    const handlePressOut = () => {
        Animated.spring(scaleValue, {
            toValue: 1,
            friction: 3,
            tension: 40,
            useNativeDriver: true,
        }).start();
    };

    const handleScanPress = async () => {
        try {
            await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        } catch (e) {
            // Haptics may not be available on all devices
        }
        router.push('/scan/universal');
    };

    // D-Day 계산
    const getDDay = (dateStr: string) => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const eventDate = new Date(dateStr);
        eventDate.setHours(0, 0, 0, 0);
        const diffTime = eventDate.getTime() - today.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        if (diffDays === 0) return 'D-Day';
        if (diffDays < 0) return `D + ${Math.abs(diffDays)} `;
        return `D - ${diffDays} `;
    };

    useEffect(() => {
        const createRipple = (anim: Animated.Value, delay: number) => {
            return Animated.loop(
                Animated.sequence([
                    Animated.delay(delay),
                    Animated.timing(anim, {
                        toValue: 1,
                        duration: 3500,
                        easing: Easing.out(Easing.ease),
                        useNativeDriver: true,
                    }),
                    Animated.timing(anim, {
                        toValue: 0,
                        duration: 0,
                        useNativeDriver: true,
                    }),
                ])
            );
        };

        const anim1 = createRipple(ripple1, 0);
        const anim2 = createRipple(ripple2, 1200);

        anim1.start();
        anim2.start();

        return () => {
            anim1.stop();
            anim2.stop();
        };
    }, []);

    const fetchEvents = async () => {
        try {
            const [todayData, upcomingData] = await Promise.all([
                getTodayEvents(),
                getUpcomingEvents(5)
            ]);
            setTodayEvents(todayData);
            setUpcomingEvents(upcomingData);
        } catch (error) {
            console.error('Failed to load events:', error);
        }
    };

    const fetchDashboardStats = async () => {
        try {
            // Calculate Dates
            const now = new Date();
            const currentYear = now.getFullYear();
            const currentMonth = now.getMonth() + 1;

            // This Month
            const thisMonthStart = `${currentYear} -${String(currentMonth).padStart(2, '0')}-01`;
            const nextMonthDate = new Date(currentYear, currentMonth, 1); // Month is 0-indexed for Date constructor
            const thisMonthEnd = `${nextMonthDate.getFullYear()} -${String(nextMonthDate.getMonth() + 1).padStart(2, '0')}-01`;

            // Last Month
            const lastMonthDate = new Date(currentYear, currentMonth - 2, 1); // currentMonth is 1-indexed, so currentMonth-2 gives previous month's 0-indexed value
            const lastMonthStart = `${lastMonthDate.getFullYear()} -${String(lastMonthDate.getMonth() + 1).padStart(2, '0')}-01`;
            // Last Month End is This Month Start
            const lastMonthEnd = thisMonthStart;

            console.log('[Dashboard] Fetching stats...', { thisMonthStart, thisMonthEnd, lastMonthStart, lastMonthEnd });

            // Fetch Parallel
            const [thisMonthStats, lastMonthStats] = await Promise.all([
                fetchPeriodStats(thisMonthStart, thisMonthEnd),
                fetchPeriodStats(lastMonthStart, lastMonthEnd)
            ]);

            const spendingDiff = thisMonthStats.totalGiven - lastMonthStats.totalGiven;

            setStats({
                ...thisMonthStats,
                spendingDiff
            });
        } catch (error) {
            console.error('Error fetching dashboard stats:', error);
        }
    };

    const loadHomeData = async () => {
        await Promise.all([
            fetchDashboardStats(),
            fetchEvents()
        ]);
    };

    useFocusEffect(
        useCallback(() => {
            loadHomeData();
        }, [])
    );

    const onRefresh = async () => {
        setRefreshing(true);
        await loadHomeData();
        setRefreshing(false);
    };

    const getRippleStyle = useCallback((anim: Animated.Value) => ({
        transform: [
            {
                scale: anim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [1, 1.8], // 더 작은 확장
                }),
            },
        ],
        opacity: anim.interpolate({
            inputRange: [0, 0.3, 1],
            outputRange: [0.15, 0.08, 0], // 더 연하게
        }),
    }), []);

    return (
        <>
            <StatusBar style={isDark ? "light" : "dark"} />
            <ScrollView
                style={[styles.container, { backgroundColor: colors.background }]}
                contentContainerStyle={[styles.content, { paddingTop: insets.top + 20 }]}
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
                }
            >

                {/* Slogan */}
                <View style={styles.sloganContainer}>
                    <Text style={[styles.sloganText, { color: colors.subText }]}>
                        복잡하고 번거로운 기록은 그만,
                    </Text>
                    <Text style={[styles.sloganText, { color: colors.subText }]}>
                        <Text style={[styles.sloganHighlight, { color: colors.orange }]}>클릭만으로</Text> 하루를 기록하세요
                    </Text>
                </View>

                {/* Hero Scan Button with Ripple */}
                <View style={styles.heroContainer}>
                    {/* Ripple Effects (2개 - 잔잔하게) */}
                    <Animated.View style={[styles.ripple, getRippleStyle(ripple1), { backgroundColor: colors.orange }]} />
                    <Animated.View style={[styles.ripple, getRippleStyle(ripple2), { backgroundColor: colors.orange }]} />

                    {/* Main Button with Scale Animation */}
                    <Pressable
                        onPressIn={handlePressIn}
                        onPressOut={handlePressOut}
                        onPress={handleScanPress}
                    >
                        <Animated.View style={[styles.heroButton, { transform: [{ scale: scaleValue }], backgroundColor: colors.orange, shadowColor: colors.orange }]}>
                            <Ionicons name="camera" size={48} color="white" />
                            <Text style={styles.heroText}>지금 사진을 찍거나</Text>
                            <Text style={styles.heroText}>이미지를 올려보세요</Text>
                        </Animated.View>
                    </Pressable>
                </View>

                {/* Quick Links */}
                <View style={styles.quickLinks}>
                    <TouchableOpacity
                        style={styles.quickLink}
                        onPress={() => router.push({ pathname: '/calendar', params: { refresh: Date.now(), date: '' } })} // Quick link도 리프레시
                    >
                        <Ionicons name="calendar-outline" size={20} color={colors.subText} />
                        <Text style={[styles.quickLinkText, { color: colors.subText }]}>캘린더</Text>
                    </TouchableOpacity>
                    <View style={[styles.quickDivider, { backgroundColor: colors.border }]} />
                    <TouchableOpacity
                        style={styles.quickLink}
                        onPress={() => router.push('/stats')}
                    >
                        <Ionicons name="stats-chart-outline" size={20} color={colors.subText} />
                        <Text style={[styles.quickLinkText, { color: colors.subText }]}>통계</Text>
                    </TouchableOpacity>
                </View>

                {/* Monthly Report Card */}
                <TouchableOpacity
                    style={[styles.reportCard, { backgroundColor: colors.card }]}
                    onPress={() => router.push('/history')}
                    activeOpacity={0.8}
                >
                    <View style={styles.reportHeader}>
                        <View style={{ gap: 4 }}>
                            <Text style={[styles.reportTitle, { color: colors.text }]}>{new Date().getFullYear()}년 {new Date().getMonth() + 1}월 지출</Text>
                            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
                                <Text style={[styles.statValueOut, { color: colors.danger }]}>
                                    -{stats.totalGiven.toLocaleString()}원
                                </Text>
                                {stats.pendingGiven > 0 && (
                                    <Text style={{ fontSize: 13, color: colors.subText }}>
                                        (송금 예정 {stats.pendingGiven.toLocaleString()}원)
                                    </Text>
                                )}
                            </View>
                            <Text style={[styles.pendingText, { color: stats.spendingDiff > 0 ? colors.danger : colors.success }]}>
                                {stats.spendingDiff > 0 ? '▲' : '▼'} 지난달 대비 {Math.abs(stats.spendingDiff).toLocaleString()}원 {stats.spendingDiff > 0 ? '더 씀' : '덜 씀'}
                            </Text>
                        </View>
                        <Ionicons name="chevron-forward" size={18} color={colors.subText} />
                    </View>

                    <View style={styles.statsRow}>
                        <View style={styles.statItem}>
                            <Text style={[styles.statLabel, { color: colors.subText }]}>수입</Text>
                            <Text style={[styles.statValueIn, { color: colors.success }]}>+{stats.totalReceived.toLocaleString()}</Text>
                        </View>
                    </View>
                </TouchableOpacity>

                {/* Today's Timeline */}
                <View style={[styles.timelineSection, { backgroundColor: colors.card }]}>
                    <Text style={[styles.timelineTitle, { color: colors.subText }]}>오늘의 기록</Text>
                    {todayEvents.length > 0 ? (
                        todayEvents.slice(0, 3).map((event) => (
                            <TouchableOpacity
                                key={event.id}
                                style={[
                                    styles.timelineItem,
                                    event.source === 'events' && { backgroundColor: isDark ? 'rgba(255, 126, 54, 0.1)' : '#FFF7ED' }
                                ]}
                                onPress={() => router.push({ pathname: '/calendar', params: { date: event.date?.split('T')[0] } })}
                                activeOpacity={0.7}
                            >
                                {event.source === 'events' ? (
                                    <View style={[styles.timelineIconContainer, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0,0,0,0.05)' }]}>
                                        <Text style={{ fontSize: 12 }}>
                                            {getEventEmoji(event)}
                                        </Text>
                                    </View>
                                ) : (
                                    <View style={[styles.timelineDot, event.isReceived ? { backgroundColor: colors.success } : { backgroundColor: colors.danger }]} />
                                )}
                                <Text
                                    style={[
                                        styles.timelineName,
                                        { color: colors.text },
                                        event.source === 'events' && { color: colors.orange, fontFamily: 'Pretendard-Bold' }
                                    ]}
                                    numberOfLines={1}
                                >
                                    {event.name || '내역'}
                                </Text>
                                {event.amount && event.amount > 0 ? (
                                    <Text style={[styles.timelineAmount, event.isReceived ? { color: colors.success } : { color: colors.danger }]}>
                                        {event.isReceived ? '+' : '-'}{event.amount.toLocaleString()}
                                    </Text>
                                ) : (
                                    event.source === 'events' && (
                                        <Text style={[styles.timelineTime, { color: colors.subText }]}>
                                            {event.startTime ? event.startTime.substring(0, 5) : '하루 종일'}
                                        </Text>
                                    )
                                )}
                            </TouchableOpacity>
                        ))
                    ) : (
                        <View style={styles.emptyTimeline}>
                            <Text style={[styles.emptyTimelineText, { color: colors.subText }]}>
                                오늘 예정된 일정이 없습니다. 편안한 하루 보내세요 ☕️
                            </Text>
                        </View>
                    )}
                </View>

                {/* Upcoming Events */}
                <View style={[styles.upcomingSection, { backgroundColor: colors.card }]}>
                    <View style={styles.upcomingHeader}>
                        <Text style={[styles.upcomingTitle, { color: colors.text }]}>📅 다가오는 일정</Text>
                        <TouchableOpacity onPress={() => router.push({ pathname: '/calendar', params: { refresh: Date.now(), date: '' } })}>
                            <Text style={[styles.upcomingMore, { color: colors.orange }]}>전체보기</Text>
                        </TouchableOpacity>
                    </View>
                    {upcomingEvents.length === 0 ? (
                        <View style={styles.emptyUpcoming}>
                            <View style={[styles.emptyIconContainer, { backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#F1F5F9' }]}>
                                <Ionicons name="calendar-outline" size={40} color={colors.subText} />
                            </View>
                            <Text style={[styles.emptyTitle, { color: colors.text }]}>아직 예정된 일정이 없어요</Text>
                            <Text style={[styles.emptyHint, { color: colors.subText }]}>
                                청첩장이나 문자를 스캔하면{'\n'}자동으로 일정이 등록됩니다
                            </Text>
                            <TouchableOpacity
                                style={styles.emptyButton}
                                onPress={() => router.push('/scan/universal')}
                                activeOpacity={0.8}
                            >
                                <Ionicons name="scan-outline" size={18} color={Colors.white} />
                                <Text style={styles.emptyButtonText}>첫 스캔 시작하기</Text>
                            </TouchableOpacity>
                        </View>
                    ) : (
                        upcomingEvents.map((event) => {
                            const dDay = getDDay(event.date);
                            return (
                                <TouchableOpacity
                                    key={event.id}
                                    style={[styles.upcomingItem, { borderBottomColor: colors.border }]}
                                    onPress={() => router.push({ pathname: '/calendar', params: { date: event.date.split('T')[0] } })}
                                    activeOpacity={0.7}
                                >
                                    <View style={styles.upcomingLeft}>
                                        <Text style={styles.upcomingType}>{getEventEmoji(event)}</Text>
                                        <View>
                                            <Text style={[styles.upcomingName, { color: colors.text }]}>{event.name || '일정'}</Text>
                                            <Text style={[styles.upcomingDate, { color: colors.subText }]}>{event.date?.split('T')[0]}{event.relation ? ` · ${event.relation} ` : ''}</Text>
                                        </View>
                                    </View>
                                    <Text style={[styles.upcomingDDay, dDay === 'D-Day' && { color: colors.orange }]}>{dDay}</Text>
                                </TouchableOpacity>
                            );
                        })
                    )}
                </View>

            </ScrollView>
        </>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    content: {
        paddingBottom: 100,
        alignItems: 'center',
    },

    // Slogan
    sloganContainer: {
        alignItems: 'center',
        marginBottom: 24, // 48 -> 24 줄임
        paddingHorizontal: 20,
    },
    sloganText: {
        fontFamily: 'Pretendard-Medium',
        fontSize: 16, // 18 -> 16 줄임
        color: 'rgba(255,255,255,0.7)',
        textAlign: 'center',
        lineHeight: 24,
    },
    sloganHighlight: {
        fontFamily: 'Pretendard-Bold',
        fontSize: 18, // 20 -> 18 줄임
        color: Colors.orange,
    },

    // Hero Button
    heroContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 24, // 40 -> 24 줄임
        width: 160, // 200 -> 160 줄임
        height: 160,
    },
    ripple: {
        position: 'absolute',
        width: 140, // 160 -> 140
        height: 140,
        borderRadius: 70, // 80 -> 70
        backgroundColor: Colors.orange,
    },
    heroButton: {
        width: 140, // 160 -> 140
        height: 140,
        borderRadius: 70, // 80 -> 70
        backgroundColor: Colors.orange,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: Colors.orange,
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.5,
        shadowRadius: 20,
        elevation: 15,
        zIndex: 10,
    },
    heroText: {
        fontFamily: 'Pretendard-Medium',
        fontSize: 12, // 13 -> 12
        color: 'rgba(255,255,255,0.9)',
        marginTop: 4,
    },

    // Quick Links
    quickLinks: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 20, // 32 -> 20 줄임
    },
    quickLink: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 8,
        gap: 6,
    },
    quickLinkText: {
        fontFamily: 'Pretendard-Medium',
        fontSize: 14,
        color: Colors.subText,
    },
    quickDivider: {
        width: 1,
        height: 16,
        backgroundColor: 'rgba(255,255,255,0.2)',
    },

    // Report Card
    reportCard: {
        backgroundColor: 'rgba(255,255,255,0.08)',
        borderRadius: 20,
        padding: 20,
        marginHorizontal: 20,
        width: '90%',
        marginBottom: 20,
    },
    reportHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
    },
    reportTitle: {
        fontFamily: 'Pretendard-Bold',
        fontSize: 16,
        color: Colors.white,
    },
    statsRow: {
        flexDirection: 'row',
        gap: 24,
    },
    statItem: {
        flex: 1,
    },
    statLabel: {
        fontFamily: 'Pretendard-Regular',
        fontSize: 13,
        color: Colors.subText,
        marginBottom: 4,
    },
    statValueOut: {
        fontFamily: 'Pretendard-Bold',
        fontSize: 20,
        color: '#F87171',
    },
    statValueIn: {
        fontFamily: 'Pretendard-Bold',
        fontSize: 20,
        color: '#4ADE80',
    },
    pendingText: {
        fontFamily: 'Pretendard-Medium',
        fontSize: 12,
        color: Colors.orange,
        marginTop: 4,
    },

    // Timeline
    timelineSection: {
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderRadius: 20,
        padding: 20,
        marginHorizontal: 20,
        width: '90%',
    },
    timelineTitle: {
        fontFamily: 'Pretendard-Bold',
        fontSize: 14,
        color: Colors.subText,
        marginBottom: 12,
    },
    timelineItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 10,
    },
    timelineItemHighlight: {
        backgroundColor: 'rgba(255, 126, 54, 0.1)', // Colors.orange w/ opacity
        marginHorizontal: -12,
        paddingHorizontal: 12,
        borderRadius: 12,
        paddingVertical: 12,
        marginBottom: 4,
    },
    timelineIconContainer: {
        width: 24,
        height: 24,
        borderRadius: 12,
        backgroundColor: 'rgba(255, 255, 255, 0.2)',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 10,
    },
    timelineNameHighlight: {
        fontFamily: 'Pretendard-Bold',
        color: Colors.orange,
    },
    timelineTime: {
        fontFamily: 'Pretendard-Medium',
        fontSize: 13,
        color: Colors.subText,
    },
    timelineDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        marginRight: 12,
    },
    timelineName: {
        flex: 1,
        fontFamily: 'Pretendard-Medium',
        fontSize: 14,
    },
    timelineAmount: {
        fontFamily: 'Pretendard-Bold',
        fontSize: 14,
    },
    emptyTimeline: {
        paddingVertical: 20,
        alignItems: 'center',
        justifyContent: 'center',
    },
    emptyTimelineText: {
        fontFamily: 'Pretendard-Medium',
        fontSize: 14,
    },

    // Upcoming Events
    upcomingSection: {
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderRadius: 20,
        padding: 20,
        marginHorizontal: 20,
        width: '90%',
        marginTop: 16,
    },
    upcomingHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
    },
    upcomingTitle: {
        fontFamily: 'Pretendard-Bold',
        fontSize: 16,
        color: Colors.white,
    },
    upcomingMore: {
        fontFamily: 'Pretendard-Medium',
        fontSize: 13,
        color: Colors.orange,
    },
    emptyUpcoming: {
        alignItems: 'center',
        paddingVertical: 24,
    },
    emptyIconContainer: {
        width: 72,
        height: 72,
        borderRadius: 36,
        backgroundColor: 'rgba(255,255,255,0.05)',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 16,
    },
    emptyTitle: {
        fontFamily: 'Pretendard-Bold',
        fontSize: 16,
        color: Colors.white,
        marginBottom: 8,
    },
    emptyHint: {
        fontFamily: 'Pretendard-Regular',
        fontSize: 13,
        color: Colors.subText,
        textAlign: 'center',
        lineHeight: 20,
        marginBottom: 20,
    },
    emptyButton: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: Colors.orange,
        paddingVertical: 12,
        paddingHorizontal: 20,
        borderRadius: 24,
        gap: 8,
    },
    emptyButtonText: {
        fontFamily: 'Pretendard-Bold',
        fontSize: 14,
        color: Colors.white,
    },
    emptyText: {
        fontFamily: 'Pretendard-Regular',
        fontSize: 14,
        color: Colors.subText,
    },
    upcomingItem: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.05)',
    },
    upcomingLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
    },
    upcomingType: {
        fontSize: 24,
        marginRight: 12,
    },
    upcomingName: {
        fontFamily: 'Pretendard-Bold',
        fontSize: 15,
        color: Colors.white,
        marginBottom: 2,
    },
    upcomingDate: {
        fontFamily: 'Pretendard-Regular',
        fontSize: 13,
        color: Colors.subText,
    },
    upcomingDDay: {
        fontFamily: 'Pretendard-Bold',
        fontSize: 14,
        color: Colors.subText,
    },
    dDayToday: {
        color: Colors.orange,
    },
});
