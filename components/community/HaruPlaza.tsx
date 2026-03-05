import { View, Text, StyleSheet, FlatList, RefreshControl, ActivityIndicator } from 'react-native';
import { useState, useEffect, useCallback } from 'react';
import { Colors } from '../../constants/Colors';
import { PollService, Poll } from '../../services/PollService';
import { PollCard } from '../PollCard';

export function HaruPlaza() {
    const [polls, setPolls] = useState<Poll[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const loadPolls = useCallback(async () => {
        setLoading(true);
        const data = await PollService.getActivePolls();
        setPolls(data);
        setLoading(false);
    }, []);

    useEffect(() => {
        loadPolls();
    }, [loadPolls]);

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await loadPolls();
        setRefreshing(false);
    }, [loadPolls]);

    const handleVoteSubmitted = useCallback(() => {
        loadPolls();
    }, [loadPolls]);

    const renderItem = useCallback(({ item }: { item: Poll }) => (
        <PollCard
            poll={item}
            onVoteSubmitted={handleVoteSubmitted}
            onDeleted={loadPolls}
        />
    ), [handleVoteSubmitted, loadPolls]);

    const keyExtractor = useCallback((item: Poll) => item.id, []);

    if (loading) {
        return (
            <View style={styles.centerContainer}>
                <ActivityIndicator size="large" color={Colors.orange} />
                <Text style={styles.loadingText}>하루 광장 소식을 불러오는 중...</Text>
            </View>
        );
    }

    return (
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
                keyExtractor={keyExtractor}
                renderItem={renderItem}
                initialNumToRender={6}
                windowSize={5}
                maxToRenderPerBatch={10}
                removeClippedSubviews
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
                            분석 결과 화면에서{'\n'}
                            "익명으로 의견 물어보기"를 눌러{'\n'}
                            첫 투표를 시작해보세요!
                        </Text>
                    </View>
                }
            />
        </View>
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
        paddingTop: 16,
        paddingBottom: 24,
        borderBottomLeftRadius: 24,
        borderBottomRightRadius: 24,
        shadowColor: Colors.shadow,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.2,
        shadowRadius: 16,
        elevation: 8,
    },
    heroTitle: {
        fontFamily: 'Pretendard-Bold',
        fontSize: 24,
        color: Colors.white,
        marginBottom: 8,
    },
    heroSubtitle: {
        fontFamily: 'Pretendard-Medium',
        fontSize: 14,
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
