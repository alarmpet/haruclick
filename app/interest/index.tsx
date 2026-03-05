import React, { useState, useEffect, useCallback } from 'react';
import {
    View, Text, StyleSheet, FlatList, TouchableOpacity,
    ActivityIndicator, Switch, Alert
} from 'react-native';
import { Stack } from 'expo-router';
import { Colors, Typography, Spacing, BorderRadius, Shadow } from '../../constants/DesignTokens';
import Ionicons from '@expo/vector-icons/Ionicons';
import {
    getInterestCategories,
    getMySubscriptions,
    toggleSubscription,
    getPublicCalendarEvents,
    importEventToMyCalendar,
    InterestCategory,
} from '../../services/supabase-modules/interests';

// ============================================================
// 타입
// ============================================================
interface PublicEvent {
    id: string;
    name: string;
    event_date: string;
    start_time?: string;
    end_time?: string;
    location?: string;
    memo?: string;
    type: string;
    category: string;
    external_resource_id?: string;
}

// ============================================================
// 메인 화면: 관심 탐색 (Discover + 구독 관리)
// ============================================================
export default function InterestDiscoverScreen() {
    const [categories, setCategories] = useState<InterestCategory[]>([]);
    const [subscribedIds, setSubscribedIds] = useState<Set<string>>(new Set());
    const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
    const [events, setEvents] = useState<PublicEvent[]>([]);
    const [importedIds, setImportedIds] = useState<Set<string>>(new Set());
    const [loading, setLoading] = useState(true);
    const [eventsLoading, setEventsLoading] = useState(false);
    const [subscribing, setSubscribing] = useState<string | null>(null);

    // 카테고리 및 구독 정보 로드
    const loadData = useCallback(async () => {
        setLoading(true);
        const [cats, subs] = await Promise.all([
            getInterestCategories(),
            getMySubscriptions(),
        ]);
        // 리프 카테고리만 탭으로 표시
        const leafCats = cats.flatMap(root => root.children?.filter(c => c.is_leaf) ?? []);
        setCategories(leafCats);
        setSubscribedIds(new Set(subs.map(s => s.category_id)));
        if (leafCats.length > 0 && !selectedCategoryId) {
            setSelectedCategoryId(leafCats[0].id);
        }
        setLoading(false);
    }, []);

    // 선택된 카테고리 공용 이벤트 로드
    const loadEvents = useCallback(async (categoryId: string) => {
        const cat = categories.find(c => c.id === categoryId);
        if (!cat?.target_calendar_id) {
            setEvents([]);
            return;
        }
        setEventsLoading(true);
        const data = await getPublicCalendarEvents(cat.target_calendar_id, 50);
        setEvents(data as PublicEvent[]);
        setEventsLoading(false);
    }, [categories]);

    useEffect(() => { loadData(); }, [loadData]);

    useEffect(() => {
        if (selectedCategoryId) loadEvents(selectedCategoryId);
    }, [selectedCategoryId, loadEvents]);

    // 구독 토글
    const handleToggleSubscription = async (cat: InterestCategory) => {
        if (!cat.target_calendar_id) {
            Alert.alert('알림', '이 카테고리는 아직 캘린더가 연결되지 않았습니다.');
            return;
        }
        setSubscribing(cat.id);
        const isCurrentlySubscribed = subscribedIds.has(cat.id);
        const success = await toggleSubscription(cat.id, cat.target_calendar_id, !isCurrentlySubscribed);
        if (success) {
            setSubscribedIds(prev => {
                const next = new Set(prev);
                isCurrentlySubscribed ? next.delete(cat.id) : next.add(cat.id);
                return next;
            });
        }
        setSubscribing(null);
    };

    // 개별 일정 가져오기
    const handleImport = async (event: PublicEvent) => {
        const result = await importEventToMyCalendar(event);
        if (result.success) {
            setImportedIds(prev => new Set(prev).add(event.id));
            Alert.alert('완료', result.message);
        } else {
            Alert.alert('오류', result.message);
        }
    };

    // ============================================================
    // 렌더링 헬퍼
    // ============================================================
    const selectedCat = categories.find(c => c.id === selectedCategoryId);
    const isSubscribed = selectedCategoryId ? subscribedIds.has(selectedCategoryId) : false;

    const renderCategoryTab = ({ item }: { item: InterestCategory }) => {
        const isSelected = item.id === selectedCategoryId;
        return (
            <TouchableOpacity
                style={[styles.tab, isSelected && styles.tabActive]}
                onPress={() => setSelectedCategoryId(item.id)}
                accessibilityRole="tab"
                accessibilityState={{ selected: isSelected }}
            >
                <Text style={[styles.tabText, isSelected && styles.tabTextActive]}>
                    {item.icon} {item.name.replace(/[🎬🎭🎨🏛️🏋️⚽👨‍🎓🧓🍼🏛\u{1F3BB}]/gu, '').trim()}
                </Text>
            </TouchableOpacity>
        );
    };

    const renderEvent = ({ item }: { item: PublicEvent }) => {
        const alreadyImported = importedIds.has(item.id);
        const dateStr = item.event_date || '';
        const isPolicy = item.type === 'policy';

        return (
            <View style={styles.eventCard}>
                <View style={styles.eventInfo}>
                    <Text style={styles.eventDate}>
                        {dateStr} {isPolicy ? '🏛️' : '🗓️'}
                    </Text>
                    <Text style={styles.eventName} numberOfLines={2}>{item.name}</Text>
                    {!!item.location && (
                        <Text style={styles.eventMeta} numberOfLines={1}>
                            <Ionicons name="location-outline" size={12} /> {item.location}
                        </Text>
                    )}
                </View>
                <TouchableOpacity
                    style={[styles.importBtn, alreadyImported && styles.importBtnDone]}
                    onPress={() => !alreadyImported && handleImport(item)}
                    disabled={alreadyImported}
                    accessibilityLabel={alreadyImported ? '이미 담김' : '내 달력에 담기'}
                >
                    <Ionicons
                        name={alreadyImported ? 'checkmark-circle' : 'add-circle-outline'}
                        size={24}
                        color={alreadyImported ? Colors.green : Colors.orange}
                    />
                </TouchableOpacity>
            </View>
        );
    };

    if (loading) {
        return (
            <View style={styles.centered}>
                <ActivityIndicator size="large" color={Colors.orange} />
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <Stack.Screen options={{ title: '🎁 관심 모아보기', headerShown: true }} />

            {/* 카테고리 탭 */}
            <FlatList
                data={categories}
                renderItem={renderCategoryTab}
                keyExtractor={c => c.id}
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.tabRow}
                contentContainerStyle={styles.tabRowContent}
            />

            {/* 선택된 카테고리 전체 구독 토글 */}
            {selectedCat && (
                <View style={styles.subscriptionBar}>
                    <Text style={styles.subscriptionLabel}>
                        {selectedCat.icon} {selectedCat.name} 전체 구독
                    </Text>
                    {subscribing === selectedCat.id
                        ? <ActivityIndicator size="small" color={Colors.orange} />
                        : (
                            <Switch
                                value={isSubscribed}
                                onValueChange={() => handleToggleSubscription(selectedCat)}
                                trackColor={{ false: Colors.border, true: Colors.orange }}
                                thumbColor={Colors.white}
                                accessibilityLabel="카테고리 전체 구독 토글"
                            />
                        )
                    }
                </View>
            )}

            {/* 구독 안내 */}
            <Text style={styles.hint}>
                {isSubscribed
                    ? '✅ 새 일정이 생기면 내 달력에 자동 표시됩니다.'
                    : '📌 원하는 일정만 [+] 눌러 내 달력에 담을 수 있습니다.'}
            </Text>

            {/* 이벤트 리스트 */}
            {eventsLoading
                ? <ActivityIndicator style={{ marginTop: Spacing['3xl'] }} color={Colors.orange} />
                : (
                    <FlatList
                        data={events}
                        renderItem={renderEvent}
                        keyExtractor={e => e.id}
                        ListEmptyComponent={
                            <Text style={styles.emptyText}>
                                아직 수집된 일정이 없습니다.{'\n'}
                                백그라운드 스크립트가 실행되면 자동으로 채워집니다.
                            </Text>
                        }
                        contentContainerStyle={events.length === 0 ? styles.centered : undefined}
                    />
                )
            }
        </View>
    );
}

// ============================================================
// 스타일 (DesignTokens 100% 활용, 하드코딩 색상 금지)
// ============================================================
const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.background,
    },
    centered: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    tabRow: {
        maxHeight: 48,
        backgroundColor: Colors.navy,
    },
    tabRowContent: {
        paddingHorizontal: Spacing.md,
        paddingVertical: Spacing.sm,
        gap: Spacing.sm,
    },
    tab: {
        paddingHorizontal: Spacing.md,
        paddingVertical: Spacing.xs,
        borderRadius: BorderRadius.full,
        backgroundColor: 'rgba(255,255,255,0.1)',
    },
    tabActive: {
        backgroundColor: Colors.orange,
    },
    tabText: {
        color: 'rgba(255,255,255,0.7)',
        fontFamily: Typography.fontFamily.regular,
        fontSize: Typography.fontSize.sm,
    },
    tabTextActive: {
        color: Colors.white,
        fontFamily: Typography.fontFamily.bold,
    },
    subscriptionBar: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: Spacing.lg,
        paddingVertical: Spacing.md,
        backgroundColor: Colors.card,
        borderBottomWidth: 1,
        borderBottomColor: Colors.border,
    },
    subscriptionLabel: {
        fontFamily: Typography.fontFamily.bold,
        fontSize: Typography.fontSize.base,
        color: Colors.text,
    },
    hint: {
        paddingHorizontal: Spacing.lg,
        paddingVertical: Spacing.sm,
        fontFamily: Typography.fontFamily.regular,
        fontSize: Typography.fontSize.xs,
        color: Colors.subText,
        backgroundColor: Colors.background,
    },
    eventCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: Colors.card,
        marginHorizontal: Spacing.lg,
        marginVertical: Spacing.xs,
        borderRadius: BorderRadius.lg,
        padding: Spacing.md,
        ...Shadow.sm,
    },
    eventInfo: {
        flex: 1,
        gap: Spacing.xs,
    },
    eventDate: {
        fontFamily: Typography.fontFamily.regular,
        fontSize: Typography.fontSize.xs,
        color: Colors.subText,
    },
    eventName: {
        fontFamily: Typography.fontFamily.bold,
        fontSize: Typography.fontSize.sm,
        color: Colors.text,
    },
    eventMeta: {
        fontFamily: Typography.fontFamily.regular,
        fontSize: Typography.fontSize.xs,
        color: Colors.subText,
    },
    importBtn: {
        marginLeft: Spacing.md,
        padding: Spacing.xs,
    },
    importBtnDone: {
        opacity: 0.5,
    },
    emptyText: {
        textAlign: 'center',
        color: Colors.subText,
        fontFamily: Typography.fontFamily.regular,
        fontSize: Typography.fontSize.sm,
        lineHeight: 24,
    },
    white: {
        color: Colors.white,
    },
});
