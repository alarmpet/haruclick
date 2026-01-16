import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, Modal } from 'react-native';
import { useState, useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import { Colors } from '../../constants/Colors';
import { getEvents, EventRecord } from '../../services/supabase';
import Ionicons from '@expo/vector-icons/Ionicons';

type Tab = 'all' | 'given' | 'received';

export default function ReportScreen() {
    const [activeTab, setActiveTab] = useState<Tab>('all');
    const [events, setEvents] = useState<EventRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState({ totalGiven: 0, totalReceived: 0, diff: 0 });

    // 날짜 필터 상태
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
    const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
    const [datePickerVisible, setDatePickerVisible] = useState(false);

    useFocusEffect(
        useCallback(() => {
            loadData();
        }, [selectedYear, selectedMonth])
    );

    const loadData = async () => {
        setLoading(true);
        const eventsData = await getEvents();

        // 선택된 연도/월로 필터링
        const filteredByMonth = eventsData.filter(e => {
            const eventDate = new Date(e.date);
            return eventDate.getFullYear() === selectedYear &&
                (eventDate.getMonth() + 1) === selectedMonth;
        });

        // 통계 계산
        let totalGiven = 0;
        let totalReceived = 0;

        filteredByMonth.forEach(e => {
            const amount = e.amount || 0;
            if (e.isReceived) {
                totalReceived += amount;
            } else {
                totalGiven += amount;
            }
        });

        setEvents(filteredByMonth);
        setStats({
            totalGiven,
            totalReceived,
            diff: totalReceived - totalGiven
        });
        setLoading(false);
    };

    const filteredEvents = events.filter(e => {
        if (activeTab === 'all') return true;
        if (activeTab === 'given') return !e.isReceived;
        return e.isReceived;
    });

    const formatMoney = (amount: number) => amount?.toLocaleString() + '원';

    // 월 변경
    const changeMonth = (delta: number) => {
        let newMonth = selectedMonth + delta;
        let newYear = selectedYear;

        if (newMonth > 12) {
            newMonth = 1;
            newYear++;
        } else if (newMonth < 1) {
            newMonth = 12;
            newYear--;
        }

        setSelectedMonth(newMonth);
        setSelectedYear(newYear);
    };

    // 연도 목록 생성 (최근 5년)
    const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i);
    const months = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

    const renderItem = ({ item }: { item: EventRecord }) => (
        <View style={styles.eventCard}>
            <View style={styles.eventLeft}>
                <View style={[styles.eventIcon, item.isReceived ? styles.receivedIcon : styles.givenIcon]}>
                    <Ionicons
                        name={item.isReceived ? "arrow-down" : "arrow-up"}
                        size={16}
                        color={item.isReceived ? "#4ADE80" : "#F87171"}
                    />
                </View>
                <View style={{ flex: 1 }}>
                    <Text style={styles.eventName} numberOfLines={1}>{item.name}</Text>
                    <Text style={styles.eventDetail}>
                        {item.relation || item.type} · {item.date?.split('T')[0]}
                    </Text>
                </View>
            </View>
            <Text style={[
                styles.amount,
                item.isReceived ? styles.receivedAmount : styles.givenAmount
            ]}>
                {item.isReceived ? '+' : '-'}{formatMoney(item.amount || 0)}
            </Text>
        </View>
    );

    return (
        <View style={styles.container}>
            {/* Date Selector */}
            <View style={styles.dateSelector}>
                <TouchableOpacity onPress={() => changeMonth(-1)} style={styles.arrowButton}>
                    <Ionicons name="chevron-back" size={24} color={Colors.white} />
                </TouchableOpacity>

                <TouchableOpacity
                    onPress={() => setDatePickerVisible(true)}
                    style={styles.dateButton}
                >
                    <Text style={styles.dateText}>{selectedYear}년 {selectedMonth}월</Text>
                    <Ionicons name="chevron-down" size={18} color={Colors.subText} />
                </TouchableOpacity>

                <TouchableOpacity onPress={() => changeMonth(1)} style={styles.arrowButton}>
                    <Ionicons name="chevron-forward" size={24} color={Colors.white} />
                </TouchableOpacity>
            </View>

            {/* Summary Header */}
            <View style={styles.summaryHeader}>
                <View style={styles.statsContainer}>
                    <View style={styles.statBox}>
                        <Text style={styles.statLabel}>지출</Text>
                        <Text style={styles.statValueGiven}>-{stats.totalGiven.toLocaleString()}원</Text>
                    </View>
                    <View style={styles.statDivider} />
                    <View style={styles.statBox}>
                        <Text style={styles.statLabel}>수입</Text>
                        <Text style={styles.statValueReceived}>+{stats.totalReceived.toLocaleString()}원</Text>
                    </View>
                </View>

                {/* Balance */}
                <View style={styles.balanceBox}>
                    <Text style={styles.balanceLabel}>수지</Text>
                    <Text style={[
                        styles.balanceValue,
                        stats.diff >= 0 ? styles.balancePositive : styles.balanceNegative
                    ]}>
                        {stats.diff >= 0 ? '+' : ''}{stats.diff.toLocaleString()}원
                    </Text>
                </View>
            </View>

            {/* Tabs */}
            <View style={styles.tabContainer}>
                {(['all', 'given', 'received'] as Tab[]).map((tab) => (
                    <TouchableOpacity
                        key={tab}
                        style={[styles.tab, activeTab === tab && styles.activeTab]}
                        onPress={() => setActiveTab(tab)}
                    >
                        <Text style={[styles.tabText, activeTab === tab && styles.activeTabText]}>
                            {tab === 'all' ? '전체' : tab === 'given' ? '지출' : '수입'}
                        </Text>
                    </TouchableOpacity>
                ))}
            </View>

            {/* List */}
            {loading ? (
                <View style={styles.center}>
                    <ActivityIndicator size="large" color={Colors.orange} />
                </View>
            ) : (
                <FlatList
                    data={filteredEvents}
                    renderItem={renderItem}
                    keyExtractor={item => item.id}
                    contentContainerStyle={styles.listContent}
                    ListEmptyComponent={
                        <View style={styles.emptyContainer}>
                            <View style={styles.emptyIcon}>
                                <Ionicons name="receipt-outline" size={48} color={Colors.subText} />
                            </View>
                            <Text style={styles.emptyTitle}>{selectedMonth}월 내역이 없어요</Text>
                            <Text style={styles.emptyText}>스캔으로 내역을 추가해보세요</Text>
                        </View>
                    }
                />
            )}

            {/* Date Picker Modal */}
            <Modal
                visible={datePickerVisible}
                transparent
                animationType="slide"
                onRequestClose={() => setDatePickerVisible(false)}
            >
                <TouchableOpacity
                    style={styles.modalOverlay}
                    activeOpacity={1}
                    onPress={() => setDatePickerVisible(false)}
                >
                    <View style={styles.modalContent}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>기간 선택</Text>
                            <TouchableOpacity onPress={() => setDatePickerVisible(false)}>
                                <Ionicons name="close" size={24} color={Colors.text} />
                            </TouchableOpacity>
                        </View>

                        {/* Year Selection */}
                        <Text style={styles.modalSectionTitle}>연도</Text>
                        <View style={styles.chipContainer}>
                            {years.map(year => (
                                <TouchableOpacity
                                    key={year}
                                    style={[styles.chip, selectedYear === year && styles.chipActive]}
                                    onPress={() => setSelectedYear(year)}
                                >
                                    <Text style={[styles.chipText, selectedYear === year && styles.chipTextActive]}>
                                        {year}년
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>

                        {/* Month Selection */}
                        <Text style={styles.modalSectionTitle}>월</Text>
                        <View style={styles.monthGrid}>
                            {months.map(month => (
                                <TouchableOpacity
                                    key={month}
                                    style={[styles.monthChip, selectedMonth === month && styles.chipActive]}
                                    onPress={() => {
                                        setSelectedMonth(month);
                                        setDatePickerVisible(false);
                                    }}
                                >
                                    <Text style={[styles.chipText, selectedMonth === month && styles.chipTextActive]}>
                                        {month}월
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    </View>
                </TouchableOpacity>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.navy,
    },
    dateSelector: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingTop: 60,
        paddingBottom: 16,
        gap: 16,
    },
    arrowButton: {
        padding: 8,
    },
    dateButton: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.1)',
        paddingVertical: 10,
        paddingHorizontal: 20,
        borderRadius: 20,
        gap: 8,
    },
    dateText: {
        fontFamily: 'Pretendard-Bold',
        fontSize: 18,
        color: Colors.white,
    },
    summaryHeader: {
        paddingHorizontal: 20,
        paddingBottom: 20,
    },
    statsContainer: {
        flexDirection: 'row',
        backgroundColor: 'rgba(255,255,255,0.08)',
        borderRadius: 16,
        padding: 20,
        marginBottom: 12,
    },
    statBox: {
        flex: 1,
        alignItems: 'center',
    },
    statDivider: {
        width: 1,
        backgroundColor: 'rgba(255,255,255,0.1)',
        marginHorizontal: 16,
    },
    statLabel: {
        fontFamily: 'Pretendard-Medium',
        fontSize: 14,
        color: Colors.subText,
        marginBottom: 8,
    },
    statValueGiven: {
        fontFamily: 'Pretendard-Bold',
        fontSize: 22,
        color: '#F87171',
    },
    statValueReceived: {
        fontFamily: 'Pretendard-Bold',
        fontSize: 22,
        color: '#4ADE80',
    },
    balanceBox: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderRadius: 12,
        padding: 16,
    },
    balanceLabel: {
        fontFamily: 'Pretendard-Medium',
        fontSize: 14,
        color: Colors.subText,
    },
    balanceValue: {
        fontFamily: 'Pretendard-Bold',
        fontSize: 20,
    },
    balancePositive: {
        color: '#4ADE80',
    },
    balanceNegative: {
        color: '#F87171',
    },
    tabContainer: {
        flexDirection: 'row',
        marginHorizontal: 20,
        backgroundColor: 'rgba(255,255,255,0.1)',
        borderRadius: 12,
        padding: 4,
        marginBottom: 16,
    },
    tab: {
        flex: 1,
        paddingVertical: 10,
        alignItems: 'center',
        borderRadius: 10,
    },
    activeTab: {
        backgroundColor: Colors.white,
    },
    tabText: {
        fontFamily: 'Pretendard-Medium',
        fontSize: 14,
        color: 'rgba(255,255,255,0.6)',
    },
    activeTabText: {
        fontFamily: 'Pretendard-Bold',
        color: Colors.navy,
    },
    listContent: {
        paddingHorizontal: 20,
        paddingBottom: 100,
    },
    center: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    emptyContainer: {
        alignItems: 'center',
        paddingVertical: 60,
    },
    emptyIcon: {
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: 'rgba(255,255,255,0.05)',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 16,
    },
    emptyTitle: {
        fontFamily: 'Pretendard-Bold',
        fontSize: 18,
        color: Colors.white,
        marginBottom: 8,
    },
    emptyText: {
        fontFamily: 'Pretendard-Regular',
        fontSize: 14,
        color: Colors.subText,
    },
    eventCard: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderRadius: 16,
        padding: 16,
        marginBottom: 10,
    },
    eventLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
    },
    eventIcon: {
        width: 36,
        height: 36,
        borderRadius: 18,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    givenIcon: {
        backgroundColor: 'rgba(248, 113, 113, 0.15)',
    },
    receivedIcon: {
        backgroundColor: 'rgba(74, 222, 128, 0.15)',
    },
    eventName: {
        fontFamily: 'Pretendard-Bold',
        fontSize: 15,
        color: Colors.white,
        marginBottom: 2,
    },
    eventDetail: {
        fontFamily: 'Pretendard-Regular',
        fontSize: 13,
        color: Colors.subText,
    },
    amount: {
        fontFamily: 'Pretendard-Bold',
        fontSize: 16,
    },
    givenAmount: {
        color: '#F87171',
    },
    receivedAmount: {
        color: '#4ADE80',
    },
    // Modal Styles
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'flex-end',
    },
    modalContent: {
        backgroundColor: Colors.white,
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        padding: 24,
        paddingBottom: 40,
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 24,
    },
    modalTitle: {
        fontFamily: 'Pretendard-Bold',
        fontSize: 20,
        color: Colors.text,
    },
    modalSectionTitle: {
        fontFamily: 'Pretendard-Bold',
        fontSize: 14,
        color: Colors.subText,
        marginBottom: 12,
    },
    chipContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 10,
        marginBottom: 24,
    },
    chip: {
        paddingVertical: 10,
        paddingHorizontal: 16,
        borderRadius: 20,
        backgroundColor: '#F3F4F6',
    },
    chipActive: {
        backgroundColor: Colors.navy,
    },
    chipText: {
        fontFamily: 'Pretendard-Medium',
        fontSize: 14,
        color: Colors.subText,
    },
    chipTextActive: {
        color: Colors.white,
        fontFamily: 'Pretendard-Bold',
    },
    monthGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 10,
    },
    monthChip: {
        width: '22%',
        paddingVertical: 12,
        alignItems: 'center',
        borderRadius: 12,
        backgroundColor: '#F3F4F6',
    },
});
