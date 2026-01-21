import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Animated, Easing, Pressable } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Colors } from '../constants/Colors';
import { useRouter } from 'expo-router';
import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase, fetchUserStats, getTodayEvents, getUpcomingEvents, EventRecord } from '../services/supabase';
import { getEventEmoji } from '../services/EmojiService';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';

export default function Home() {
    const router = useRouter();
    const [stats, setStats] = useState({ totalGiven: 0, totalReceived: 0, pendingGiven: 0, diff: 0 });
    const [todayEvents, setTodayEvents] = useState<EventRecord[]>([]);
    const [upcomingEvents, setUpcomingEvents] = useState<EventRecord[]>([]);

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
        if (diffDays < 0) return `D+${Math.abs(diffDays)}`;
        return `D-${diffDays}`;
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

    useFocusEffect(
        useCallback(() => {
            const loadHomeData = async () => {
                try {
                    const [statsData, todayData, upcomingData] = await Promise.all([
                        fetchUserStats(),
                        getTodayEvents(),
                        getUpcomingEvents(5)
                    ]);

                    setStats(statsData);
                    setTodayEvents(todayData);
                    setUpcomingEvents(upcomingData);
                } catch (error) {
                    console.error('Failed to load home data:', error);
                }
            };
            loadHomeData();
        }, [])
    );

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
            <StatusBar style="light" />
            <ScrollView style={styles.container} contentContainerStyle={styles.content}>

                {/* Slogan */}
                <View style={styles.sloganContainer}>
                    <Text style={styles.sloganText}>
                        복잡하고 번거로운 기록은 그만,
                    </Text>
                    <Text style={styles.sloganText}>
                        <Text style={styles.sloganHighlight}>클릭만으로</Text> 하루를 기록하세요
                    </Text>
                </View>

                {/* Hero Scan Button with Ripple */}
                <View style={styles.heroContainer}>
                    {/* Ripple Effects (2개 - 잔잔하게) */}
                    <Animated.View style={[styles.ripple, getRippleStyle(ripple1)]} />
                    <Animated.View style={[styles.ripple, getRippleStyle(ripple2)]} />

                    {/* Main Button with Scale Animation */}
                    <Pressable
                        onPressIn={handlePressIn}
                        onPressOut={handlePressOut}
                        onPress={handleScanPress}
                    >
                        <Animated.View style={[styles.heroButton, { transform: [{ scale: scaleValue }] }]}>
                            <Ionicons name="camera" size={48} color={Colors.white} />
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
                        <Ionicons name="calendar-outline" size={20} color={Colors.subText} />
                        <Text style={styles.quickLinkText}>캘린더</Text>
                    </TouchableOpacity>
                    <View style={styles.quickDivider} />
                    <TouchableOpacity
                        style={styles.quickLink}
                        onPress={() => router.push('/stats')}
                    >
                        <Ionicons name="stats-chart-outline" size={20} color={Colors.subText} />
                        <Text style={styles.quickLinkText}>통계</Text>
                    </TouchableOpacity>
                </View>

                {/* Monthly Report Card */}
                <TouchableOpacity
                    style={styles.reportCard}
                    onPress={() => router.push('/history')}
                    activeOpacity={0.8}
                >
                    <View style={styles.reportHeader}>
                        <Text style={styles.reportTitle}>이번 달</Text>
                        <Ionicons name="chevron-forward" size={18} color={Colors.subText} />
                    </View>

                    <View style={styles.statsRow}>
                        <View style={styles.statItem}>
                            <Text style={styles.statLabel}>지출</Text>
                            <Text style={styles.statValueOut}>-{stats.totalGiven.toLocaleString()}</Text>
                            {stats.pendingGiven > 0 && (
                                <Text style={styles.pendingText}>
                                    지출예정 {stats.pendingGiven.toLocaleString()}원
                                </Text>
                            )}
                        </View>
                        <View style={styles.statItem}>
                            <Text style={styles.statLabel}>수입</Text>
                            <Text style={styles.statValueIn}>+{stats.totalReceived.toLocaleString()}</Text>
                        </View>
                    </View>
                </TouchableOpacity>

                {/* Today's Timeline */}
                {todayEvents.length > 0 && (
                    <View style={styles.timelineSection}>
                        <Text style={styles.timelineTitle}>오늘의 기록</Text>
                        {todayEvents.slice(0, 3).map((event) => (
                            <TouchableOpacity
                                key={event.id}
                                style={[
                                    styles.timelineItem,
                                    event.source === 'events' && styles.timelineItemHighlight
                                ]}
                                onPress={() => router.push({ pathname: '/calendar', params: { date: event.date?.split('T')[0] } })}
                                activeOpacity={0.7}
                            >
                                {event.source === 'events' ? (
                                    <View style={styles.timelineIconContainer}>
                                        <Text style={{ fontSize: 12 }}>
                                            {getEventEmoji(event)}
                                        </Text>
                                    </View>
                                ) : (
                                    <View style={[styles.timelineDot, event.isReceived ? styles.dotIn : styles.dotOut]} />
                                )}
                                <Text
                                    style={[
                                        styles.timelineName,
                                        event.source === 'events' && styles.timelineNameHighlight
                                    ]}
                                    numberOfLines={1}
                                >
                                    {event.name || '내역'}
                                </Text>
                                {event.amount && event.amount > 0 ? (
                                    <Text style={[styles.timelineAmount, event.isReceived ? styles.amountIn : styles.amountOut]}>
                                        {event.isReceived ? '+' : '-'}{event.amount.toLocaleString()}
                                    </Text>
                                ) : (
                                    event.source === 'events' && (
                                        <Text style={styles.timelineTime}>
                                            {event.startTime ? event.startTime.substring(0, 5) : '하루 종일'}
                                        </Text>
                                    )
                                )}
                            </TouchableOpacity>
                        ))}
                    </View>
                )}

                {/* Upcoming Events */}
                <View style={styles.upcomingSection}>
                    <View style={styles.upcomingHeader}>
                        <Text style={styles.upcomingTitle}>📅 다가오는 일정</Text>
                        <TouchableOpacity onPress={() => router.push({ pathname: '/calendar', params: { refresh: Date.now(), date: '' } })}>
                            <Text style={styles.upcomingMore}>전체보기</Text>
                        </TouchableOpacity>
                    </View>
                    {upcomingEvents.length === 0 ? (
                        <View style={styles.emptyUpcoming}>
                            <View style={styles.emptyIconContainer}>
                                <Ionicons name="calendar-outline" size={40} color="rgba(255,255,255,0.25)" />
                            </View>
                            <Text style={styles.emptyTitle}>아직 예정된 일정이 없어요</Text>
                            <Text style={styles.emptyHint}>
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
                                    style={styles.upcomingItem}
                                    onPress={() => router.push({ pathname: '/calendar', params: { date: event.date.split('T')[0] } })}
                                    activeOpacity={0.7}
                                >
                                    <View style={styles.upcomingLeft}>
                                        <Text style={styles.upcomingType}>{getEventEmoji(event)}</Text>
                                        <View>
                                            <Text style={styles.upcomingName}>{event.name || '일정'}</Text>
                                            <Text style={styles.upcomingDate}>{event.date?.split('T')[0]}{event.relation ? ` · ${event.relation}` : ''}</Text>
                                        </View>
                                    </View>
                                    <Text style={[styles.upcomingDDay, dDay === 'D-Day' && styles.dDayToday]}>{dDay}</Text>
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
        backgroundColor: Colors.navy,
    },
    content: {
        paddingTop: 80,
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
    dotOut: {
        backgroundColor: '#F87171',
    },
    dotIn: {
        backgroundColor: '#4ADE80',
    },
    timelineName: {
        flex: 1,
        fontFamily: 'Pretendard-Medium',
        fontSize: 14,
        color: Colors.white,
    },
    timelineAmount: {
        fontFamily: 'Pretendard-Bold',
        fontSize: 14,
    },
    amountOut: {
        color: '#F87171',
    },
    amountIn: {
        color: '#4ADE80',
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
