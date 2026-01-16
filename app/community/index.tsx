import { View, Text, StyleSheet, FlatList, RefreshControl, ActivityIndicator } from 'react-native';
import { useState, useEffect, useCallback } from 'react';
import { Stack } from 'expo-router';
import { Colors } from '../../constants/Colors';
import { PollService, Poll } from '../../services/PollService';
import { PollCard } from '../../components/PollCard';

export default function CommunityScreen() {
    const [polls, setPolls] = useState<Poll[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    useEffect(() => {
        loadPolls();
    }, []);

    const loadPolls = async () => {
        setLoading(true);
        const data = await PollService.getActivePolls();
        setPolls(data);
        setLoading(false);
    };

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await loadPolls();
        setRefreshing(false);
    }, []);

    const handleVoteSubmitted = () => {
        // Optionally reload polls to get updated vote counts
        loadPolls();
    };

    if (loading) {
        return (
            <>
                <Stack.Screen options={{ title: '하루 광장' }} />
                <View style={styles.centerContainer}>
                    <ActivityIndicator size="large" color={Colors.orange} />
                    <Text style={styles.loadingText}>커뮤니티 투표를 불러오는 중...</Text>
                </View>
            </>
        );
    }

    return (
        <>
            <Stack.Screen options={{ title: '하루 광장' }} />
            <View style={styles.container}>
                {/* Hero Header */}
                <View style={styles.heroHeader}>
                    <Text style={styles.heroTitle}>하루 광장</Text>
                    <Text style={styles.heroSubtitle}>
                        다른 사람들의 고민을 보고 의견을 나눠보세요
                    </Text>
                </View>

                {/* Poll List */}
                <FlatList
                    data={polls}
                    keyExtractor={(item) => item.id}
                    renderItem={({ item }) => (
                        <PollCard
                            poll={item}
                            onVoteSubmitted={handleVoteSubmitted}
                            onDeleted={loadPolls}  // ✅ 삭제 후 목록 새로고침
                        />
                    )}
                    contentContainerStyle={styles.listContent}
                    refreshControl={
                        <RefreshControl
                            refreshing={refreshing}
                            onRefresh={onRefresh}
                            tintColor={Colors.orange}
                            colors={[Colors.orange]}
                        />
                    }
                    ListEmptyComponent={
                        <View style={styles.emptyContainer}>
                            <Text style={styles.emptyIcon}>🤔</Text>
                            <Text style={styles.emptyTitle}>아직 투표가 없어요</Text>
                            <Text style={styles.emptyText}>
                                기프티콘 분석 후{'\n'}
                                "익명으로 의견 물어보기"를 눌러{'\n'}
                                첫 투표를 시작해보세요!
                            </Text>
                        </View>
                    }
                />
            </View>
        </>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.background,
    },
    centerContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: Colors.background,
    },
    loadingText: {
        marginTop: 16,
        fontFamily: 'Pretendard-Medium',
        fontSize: 16,
        color: Colors.text,
    },
    heroHeader: {
        backgroundColor: Colors.navy,
        paddingHorizontal: 24,
        paddingTop: 32,
        paddingBottom: 40,
        borderBottomLeftRadius: 32,
        borderBottomRightRadius: 32,
        shadowColor: Colors.shadow,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.2,
        shadowRadius: 16,
        elevation: 8,
    },
    heroTitle: {
        fontFamily: 'Pretendard-Bold',
        fontSize: 32,
        color: Colors.white,
        marginBottom: 8,
    },
    heroSubtitle: {
        fontFamily: 'Pretendard-Medium',
        fontSize: 15,
        color: Colors.white,
        opacity: 0.9,
    },
    listContent: {
        padding: 20,
        paddingTop: 24,
    },
    emptyContainer: {
        alignItems: 'center',
        paddingVertical: 60,
        paddingHorizontal: 40,
    },
    emptyIcon: {
        fontSize: 64,
        marginBottom: 16,
    },
    emptyTitle: {
        fontFamily: 'Pretendard-Bold',
        fontSize: 20,
        color: Colors.text,
        marginBottom: 12,
    },
    emptyText: {
        fontFamily: 'Pretendard-Medium',
        fontSize: 15,
        color: Colors.subText,
        textAlign: 'center',
        lineHeight: 24,
    },
});
