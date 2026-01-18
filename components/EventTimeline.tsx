import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { Colors } from '../constants/Colors';
import { Card } from './Card';
import { useState, useCallback } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { getUpcomingEvents, updateEvent, deleteEvent, deleteLedgerItem, deleteBankTransaction, EventRecord } from '../services/supabase';
import { Ionicons } from '@expo/vector-icons';

interface EventTimelineProps {
    events?: EventRecord[];
    title?: string;
    onEventsChange?: () => void; // DB 변경 시 부모에게 알림
    onEventPress?: (event: EventRecord) => void;
    onEventEdit?: (event: EventRecord) => void;
}

export function EventTimeline({ events: propEvents, title, onEventsChange, onEventPress, onEventEdit }: EventTimelineProps) {
    const router = useRouter();
    const [stateEvents, setStateEvents] = useState<EventRecord[]>([]);
    const [loading, setLoading] = useState(propEvents === undefined);

    const isControlled = propEvents !== undefined;
    const events = isControlled ? propEvents : stateEvents;

    const fetchEvents = async () => {
        if (isControlled) return;
        setLoading(true);
        const data = await getUpcomingEvents(2); // 최대 2개만
        setStateEvents(data);
        setLoading(false);
    };

    useFocusEffect(
        useCallback(() => {
            fetchEvents();
        }, [])
    );

    // ✅ 송금 완료 상태 토글 (메모에 [송금완료] 태그 추가/제거)
    const togglePayment = async (event: EventRecord) => {
        const newStatus = !event.isPaid;

        // Optimistic UI Update (Only for local state)
        if (!isControlled) {
            setStateEvents(prev => prev.map(e => e.id === event.id ? { ...e, isPaid: newStatus } : e));
        }

        let newMemo = event.memo || '';
        if (newStatus) {
            if (!newMemo.includes('[송금완료]')) newMemo = `[송금완료] ${newMemo}`;
        } else {
            newMemo = newMemo.replace('[송금완료]', '').trim();
        }

        try {
            const { error } = await updateEvent(event.id, { memo: newMemo });
            if (error) throw error;
            if (onEventsChange) onEventsChange();
            if (!isControlled) fetchEvents();
        } catch (e) {
            console.error(e);
            Alert.alert('오류', '상태 업데이트에 실패했습니다.');
            if (!isControlled) fetchEvents(); // Revert on error
        }
    };

    // ✅ 일정 삭제
    const handleDelete = (event: EventRecord) => {
        Alert.alert(
            '일정 삭제',
            `"${event.name}" 일정을 삭제하시겠습니까?`,
            [
                { text: '취소', style: 'cancel' },
                {
                    text: '삭제',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            if (event.source === 'ledger') {
                                await deleteLedgerItem(event.id);
                            } else if (event.source === 'bank_transactions') {
                                await deleteBankTransaction(event.id);
                            } else {
                                await deleteEvent(event.id);
                            }

                            if (!isControlled) {
                                setStateEvents(prev => prev.filter(e => e.id !== event.id));
                            }
                            if (onEventsChange) onEventsChange();
                            Alert.alert('삭제 완료', '항목이 삭제되었습니다.');
                        } catch (e: any) {
                            console.error('Delete error:', e);
                            Alert.alert('오류', e.message || '삭제에 실패했습니다.');
                        }
                    }
                }
            ]
        );
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

    // 요일 계산
    const getDayOfWeek = (dateStr: string) => {
        const days = ['일', '월', '화', '수', '목', '금', '토'];
        return days[new Date(dateStr).getDay()];
    };

    if (loading && !events?.length) {
        return <View style={styles.container}><Text style={styles.emptyText}>일정을 불러오는 중...</Text></View>;
    }

    if (!loading && (!events || events.length === 0)) {
        return (
            <View style={styles.container}>
                {title && <Text style={styles.sectionTitle}>{title}</Text>}
                <View style={styles.emptyContainer}>
                    <View style={styles.emptyIconContainer}>
                        <Ionicons name="calendar-outline" size={48} color={Colors.orange} />
                    </View>
                    <Text style={styles.emptyTitle}>다가오는 일정이 없어요</Text>
                    <Text style={styles.emptyText}>
                        청첩장, 부고장을 스캔하거나{'\n'}직접 일정을 추가해보세요
                    </Text>
                    {!isControlled && (
                        <TouchableOpacity onPress={() => router.push('/scan/universal')} style={styles.addButton}>
                            <Ionicons name="camera" size={18} color={Colors.white} style={{ marginRight: 6 }} />
                            <Text style={styles.addButtonText}>문서 스캔하기</Text>
                        </TouchableOpacity>
                    )}
                </View>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            {title && <Text style={styles.sectionTitle}>{title}</Text>}

            <View style={styles.timeline}>
                {events?.map((event, index) => {
                    const dDay = getDDay(event.date);
                    const day = getDayOfWeek(event.date);
                    const isNext = index === 0; // 가장 가까운 일정

                    return (
                        <View key={event.id} style={styles.timelineItem}>
                            <View style={styles.dateContainer}>
                                <Text style={styles.dateText}>{event.date.substring(5).replace('-', '.')}</Text>
                                <Text style={styles.dayText}>({day})</Text>
                            </View>

                            <View style={styles.lineWrapper}>
                                <View style={[styles.dot, isNext && styles.activeDot]} />
                                {index !== events.length - 1 && <View style={styles.line} />}
                            </View>

                            <View style={styles.cardWrapper}>
                                <TouchableOpacity
                                    activeOpacity={onEventPress ? 0.7 : 1}
                                    onPress={() => onEventPress && onEventPress(event)}
                                >
                                    <Card style={[styles.eventCard, isNext && styles.activeEventCard]}>
                                        <View style={styles.cardHeader}>
                                            <View style={[styles.badgeContainer, { flex: 1, marginRight: 8 }]}>
                                                <Text style={[styles.typeBadge, isNext ? styles.activeTypeBadge : styles.inactiveTypeBadge]}>
                                                    {event.source === 'bank_transactions'
                                                        ? (event.isReceived ? '💰 입금' : '💸 송금')
                                                        : (event.source === 'ledger' ? '🛒 결제' : event.type)}
                                                </Text>
                                                <Text style={[styles.relationText, { flex: 1 }]} numberOfLines={1} ellipsizeMode="tail">
                                                    {event.relation}
                                                </Text>
                                            </View>
                                            <View style={styles.headerActions}>
                                                <Text style={[styles.dDay, isNext && styles.activeDDay]}>{dDay}</Text>
                                                <TouchableOpacity
                                                    style={[styles.deleteButton, { marginRight: 8 }]}
                                                    onPress={() => onEventEdit && onEventEdit(event)}
                                                >
                                                    <Ionicons name="pencil-outline" size={20} color={Colors.text} />
                                                </TouchableOpacity>
                                                <TouchableOpacity
                                                    style={styles.deleteButton}
                                                    onPress={() => handleDelete(event)}
                                                >
                                                    <Ionicons name="trash-outline" size={20} color="#FF6B6B" />
                                                </TouchableOpacity>
                                            </View>
                                        </View>

                                        <View style={styles.titleRow}>
                                            <Text style={styles.eventTitle}>{event.name}</Text>

                                            {/* ✅ 송금 완료 체크박스 - 경조사(wedding, funeral, birthday)일 때만 표시 */}
                                            {!event.isReceived && ['wedding', 'funeral', 'birthday'].includes(event.type) && (
                                                <TouchableOpacity
                                                    style={[styles.checkButton, event.isPaid && styles.checkedButton]}
                                                    onPress={() => togglePayment(event)}
                                                >
                                                    <Ionicons
                                                        name={event.isPaid ? "checkmark-circle" : "ellipse-outline"}
                                                        size={20}
                                                        color={event.isPaid ? Colors.white : Colors.subText}
                                                    />
                                                    <Text style={[styles.checkText, event.isPaid && styles.checkedText]}>
                                                        {event.isPaid ? '송금완료' : '송금예정'}
                                                    </Text>
                                                </TouchableOpacity>
                                            )}
                                        </View>

                                        {/* ✅ 추가 정보 (금액, 메모) */}
                                        <View style={styles.detailsContainer}>
                                            {event.amount !== undefined && event.amount > 0 && (
                                                <Text style={styles.amountText}>
                                                    {event.amount.toLocaleString()}원
                                                </Text>
                                            )}
                                            {event.memo && (
                                                <Text style={styles.memoText} numberOfLines={2}>
                                                    {event.memo.split('\n')[0]}
                                                </Text>
                                            )}
                                        </View>
                                    </Card>
                                </TouchableOpacity>
                            </View>
                        </View>
                    );
                })}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        paddingVertical: 10,
    },
    sectionTitle: {
        fontFamily: 'Pretendard-Bold',
        fontSize: 20,
        color: Colors.text,
        marginBottom: 20,
    },
    timeline: {
        gap: 0,
    },
    timelineItem: {
        flexDirection: 'row',
        marginBottom: 16,
    },
    dateContainer: {
        width: 44,
        alignItems: 'flex-end',
        marginRight: 12,
        paddingTop: 16,
    },
    dateText: {
        fontFamily: 'Pretendard-Bold',
        fontSize: 14,
        color: Colors.text,
    },
    dayText: {
        fontFamily: 'Pretendard-Medium',
        fontSize: 12,
        color: Colors.subText,
    },
    lineWrapper: {
        alignItems: 'center',
        width: 20,
        marginRight: 12,
        paddingTop: 20,
    },
    dot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: Colors.border,
        zIndex: 1,
    },
    activeDot: {
        backgroundColor: Colors.orange,
        width: 10,
        height: 10,
        borderRadius: 5,
    },
    line: {
        width: 1,
        flex: 1,
        backgroundColor: Colors.border,
        marginTop: 4,
        marginBottom: -24, // Connect to next item
    },
    cardWrapper: {
        flex: 1,
    },
    eventCard: {
        padding: 16,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: 'transparent',
        marginBottom: 0,
    },
    activeEventCard: {
        borderColor: Colors.orange,
        backgroundColor: '#FFF8F0', // Very light orange
    },
    cardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 8,
    },
    badgeContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    typeBadge: {
        fontFamily: 'Pretendard-Bold',
        fontSize: 12,
    },
    activeTypeBadge: {
        color: Colors.orange,
    },
    inactiveTypeBadge: {
        color: Colors.subText,
    },
    relationText: {
        fontFamily: 'Pretendard-Medium',
        fontSize: 12,
        color: Colors.subText,
    },
    dDay: {
        fontFamily: 'Pretendard-Bold',
        fontSize: 14,
        color: Colors.subText,
    },
    activeDDay: {
        color: Colors.orange,
    },
    titleRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
    },
    detailsContainer: {
        gap: 4,
    },
    amountText: {
        fontFamily: 'Pretendard-Bold',
        fontSize: 16,
        color: Colors.navy,
    },
    memoText: {
        fontFamily: 'Pretendard-Regular',
        fontSize: 13,
        color: Colors.subText,
    },
    eventTitle: {
        fontFamily: 'Pretendard-Bold',
        fontSize: 16,
        color: Colors.text,
    },
    emptyContainer: {
        alignItems: 'center',
        padding: 32,
        backgroundColor: Colors.white,
        borderRadius: 20,
        shadowColor: Colors.shadow,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.08,
        shadowRadius: 12,
        elevation: 3,
    },
    emptyIconContainer: {
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: '#FFF7ED',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 16,
    },
    emptyTitle: {
        fontFamily: 'Pretendard-Bold',
        fontSize: 18,
        color: Colors.text,
        marginBottom: 8,
    },
    emptyText: {
        fontFamily: 'Pretendard-Regular',
        fontSize: 14,
        color: Colors.subText,
        textAlign: 'center',
        lineHeight: 20,
        marginBottom: 16,
    },
    addButton: {
        marginTop: 8,
        backgroundColor: Colors.orange,
        paddingVertical: 12,
        paddingHorizontal: 20,
        borderRadius: 24,
        flexDirection: 'row',
        alignItems: 'center',
    },
    addButtonText: {
        color: Colors.white,
        fontFamily: 'Pretendard-Bold',
        fontSize: 15,
    },
    checkButton: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 4,
        paddingHorizontal: 8,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: Colors.border,
        gap: 4,
    },
    checkedButton: {
        backgroundColor: Colors.orange,
        borderColor: Colors.orange,
    },
    checkText: {
        fontFamily: 'Pretendard-Medium',
        fontSize: 12,
        color: Colors.subText,
    },
    checkedText: {
        color: Colors.white,
        fontFamily: 'Pretendard-Bold',
    },
    headerActions: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    deleteButton: {
        padding: 6,
        backgroundColor: '#FFEBEE',
        borderRadius: 8,
    },
});
