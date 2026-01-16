import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Colors } from '../constants/Colors';
import { useRouter, useFocusEffect } from 'expo-router';
import { useState, useCallback } from 'react';
import { fetchUserStats } from '../services/supabase';

export function DashboardSummary() {
    const router = useRouter();
    const [stats, setStats] = useState({ totalGiven: 0, totalReceived: 0, diff: 0 });

    useFocusEffect(
        useCallback(() => {
            fetchUserStats().then(setStats);
        }, [])
    );
    return (
        <TouchableOpacity activeOpacity={0.9} onPress={() => router.push('/history')}>
            <View style={styles.container}>
                <View style={styles.content}>
                    <View style={styles.header}>
                        <Text style={styles.title}>내 경조사 현황</Text>
                        <Text style={styles.period}>2026년</Text>
                        <Text style={styles.more}>더보기 {'>'}</Text>
                    </View>

                    <View style={styles.statsContainer}>
                        <View style={styles.statItem}>
                            <Text style={styles.statLabel}>내가 낸 돈</Text>
                            <Text style={styles.statValue}>{stats.totalGiven.toLocaleString()}원</Text>
                        </View>
                        <View style={styles.divider} />
                        <View style={styles.statItem}>
                            <Text style={styles.statLabel}>받은 돈</Text>
                            <Text style={[styles.statValue, styles.receivedValue]}>{stats.totalReceived.toLocaleString()}원</Text>
                        </View>
                    </View>

                    <View style={styles.barContainer}>
                        <View style={[styles.bar, { flex: stats.totalGiven || 1, backgroundColor: Colors.white }]} />
                        <View style={[styles.bar, { flex: stats.totalReceived || 0.1, backgroundColor: Colors.orange }]} />
                    </View>
                    <Text style={styles.analysis}>
                        {stats.diff > 0
                            ? `작년보다 ${stats.diff.toLocaleString()}원 더 냈어요`
                            : '작년보다 지출이 줄었어요'}
                    </Text>

                </View>
            </View>
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    container: {
        backgroundColor: Colors.navy,
        borderRadius: 20,
        padding: 24,
        marginBottom: 24,
    },
    content: {
        gap: 16,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
    },
    title: {
        fontFamily: 'Pretendard-Bold',
        fontSize: 18,
        color: Colors.white,
    },
    period: {
        fontFamily: 'Pretendard-Medium',
        fontSize: 14,
        color: 'rgba(255,255,255,0.6)',
    },
    more: {
        fontFamily: 'Pretendard-Medium',
        fontSize: 12,
        color: 'rgba(255,255,255,0.4)',
        marginLeft: 8,
    },
    statsContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 20,
    },
    statItem: {
        flex: 1,
    },
    divider: {
        width: 1,
        height: 40,
        backgroundColor: 'rgba(255,255,255,0.2)',
    },
    statLabel: {
        fontFamily: 'Pretendard-Medium',
        fontSize: 13,
        color: 'rgba(255,255,255,0.7)',
        marginBottom: 4,
    },
    statValue: {
        fontFamily: 'Pretendard-Bold',
        fontSize: 20,
        color: Colors.white,
    },
    receivedValue: {
        color: Colors.orange,
    },
    barContainer: {
        flexDirection: 'row',
        height: 6,
        borderRadius: 3,
        overflow: 'hidden',
        backgroundColor: 'rgba(255,255,255,0.1)',
        gap: 2,
    },
    bar: {
        height: '100%',
        borderRadius: 3,
    },
    analysis: {
        fontFamily: 'Pretendard-Medium',
        fontSize: 13,
        color: 'rgba(255,255,255,0.6)',
        marginTop: 4,
    }
});
