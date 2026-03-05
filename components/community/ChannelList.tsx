import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert, Platform, LayoutAnimation, UIManager } from 'react-native';
import { useRouter } from 'expo-router';
import { Colors } from '../../constants/Colors';
import { Ionicons } from '@expo/vector-icons';
import { getInterestCategories, getMySubscriptions, toggleSubscription, InterestCategory } from '../../services/supabase-modules/interests';

export function ChannelList() {
    const router = useRouter();
    const [categories, setCategories] = useState<InterestCategory[]>([]);
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
    const [subscriptions, setSubscriptions] = useState<Set<string>>(new Set());
    const [loading, setLoading] = useState(true);
    const [toggling, setToggling] = useState<string | null>(null);

    // Android에서 LayoutAnimation 활성화
    if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
        UIManager.setLayoutAnimationEnabledExperimental(true);
    }

    const toggleExpand = (id: string) => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setExpandedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    };

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const [cats, subs] = await Promise.all([
                getInterestCategories(),
                getMySubscriptions()
            ]);
            setCategories(cats);
            setSubscriptions(new Set(subs.map(s => s.category_id)));
        } catch (error) {
            console.error('Failed to load interests data', error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const handleToggle = async (category: InterestCategory) => {
        if (!category.target_calendar_id) {
            Alert.alert('안내', '해당 채널은 아직 준비 중입니다.');
            return;
        }

        const isSubscribed = subscriptions.has(category.id);
        const nextState = !isSubscribed;

        setToggling(category.id);
        const success = await toggleSubscription(category.id, category.target_calendar_id, nextState);

        if (success) {
            setSubscriptions(prev => {
                const next = new Set(prev);
                if (nextState) {
                    next.add(category.id);
                } else {
                    next.delete(category.id);
                }
                return next;
            });
        }
        setToggling(null);
    };

    const handleChannelPress = (category: InterestCategory) => {
        if (category.is_leaf) {
            router.push(`/community/${category.id}`);
        }
    };

    const renderCategoryNode = (category: InterestCategory, depth: number = 0) => {
        const isLeaf = category.children?.length === 0 || category.is_leaf;
        const isSubscribed = subscriptions.has(category.id);
        const isToggling = toggling === category.id;
        const isExpanded = expandedIds.has(category.id);
        const hasChildren = !isLeaf && category.children && category.children.length > 0;

        return (
            <View key={category.id} style={[styles.nodeContainer, { paddingLeft: depth * 12 }]}>
                <TouchableOpacity
                    style={[styles.nodeHeader, !isLeaf && styles.groupHeader]}
                    onPress={() => {
                        if (isLeaf) {
                            handleChannelPress(category);
                        } else {
                            toggleExpand(category.id);
                        }
                    }}
                    activeOpacity={0.75}
                >
                    <View style={styles.iconContainer}>
                        {category.icon ? (
                            <Text style={styles.icon}>{category.icon}</Text>
                        ) : (
                            <Ionicons name={isLeaf ? "chatbubbles" : "folder"} size={20} color={category.theme_color || Colors.subText} />
                        )}
                    </View>

                    <View style={styles.titleContainer}>
                        <Text style={[styles.nodeTitle, !isLeaf && styles.rootNodeTitle]}>
                            {category.name}
                        </Text>
                        {isLeaf && (
                            <Text style={styles.subtitle}>
                                구독자 {(category as any).subscriber_count || 0}명 • 글 {(category as any).post_count || 0}개
                            </Text>
                        )}
                    </View>

                    {/* 루트 카테고리: 화살표 아이콘 */}
                    {hasChildren && (
                        <Ionicons
                            name="chevron-down"
                            size={18}
                            color={Colors.subText}
                            style={{ transform: [{ rotate: isExpanded ? '180deg' : '0deg' }] }}
                        />
                    )}

                    {/* 리프 채널: 구독 버튼 */}
                    {isLeaf && (
                        <TouchableOpacity
                            style={[
                                styles.toggleButton,
                                isSubscribed ? styles.toggleActive : styles.toggleInactive
                            ]}
                            onPress={() => handleToggle(category)}
                            disabled={isToggling}
                            activeOpacity={0.7}
                        >
                            {isToggling ? (
                                <ActivityIndicator size="small" color={isSubscribed ? '#FFF' : Colors.navy} />
                            ) : (
                                <Text style={[
                                    styles.toggleText,
                                    isSubscribed ? styles.toggleTextActive : styles.toggleTextInactive
                                ]}>
                                    {isSubscribed ? '구독중' : '구독하기'}
                                </Text>
                            )}
                        </TouchableOpacity>
                    )}
                </TouchableOpacity>

                {/* 자식 채널 - 펼쳤을 때만 표시 */}
                {hasChildren && isExpanded && (
                    <View style={styles.childrenContainer}>
                        {category.children!.map(child => renderCategoryNode(child, depth + 1))}
                    </View>
                )}
            </View>
        );
    };

    if (loading) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={Colors.orange} />
                <Text style={styles.loadingText}>채널 목록을 불러오는 중...</Text>
            </View>
        );
    }

    return (
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
            <View style={styles.heroHeader}>
                <Text style={styles.heroTitle}>관심 채널</Text>
                <Text style={styles.heroSubtitle}>
                    관심사에 맞는 채널을 구독하고 일정과 정보를 공유하세요
                </Text>
            </View>

            <View style={styles.listContainer}>
                {categories.length > 0 ? (
                    categories.map(rootCat => renderCategoryNode(rootCat))
                ) : (
                    <View style={styles.emptyContainer}>
                        <Ionicons name="chatbubbles-outline" size={48} color={Colors.subText} />
                        <Text style={styles.emptyText}>준비된 채널이 없습니다.</Text>
                    </View>
                )}
            </View>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: Colors.background,
    },
    loadingText: {
        marginTop: 16,
        fontSize: 15,
        fontFamily: 'Pretendard-Medium',
        color: Colors.subText,
    },
    scrollView: {
        flex: 1,
        backgroundColor: Colors.background,
    },
    scrollContent: {
        paddingBottom: 40,
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
    listContainer: {
        padding: 16,
        marginTop: 8,
    },
    nodeContainer: {
        marginBottom: 8,
    },
    nodeHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 14,
        paddingHorizontal: 16,
        backgroundColor: Colors.white,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: Colors.border,
        ...Platform.select({
            ios: {
                shadowColor: Colors.shadow,
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.05,
                shadowRadius: 4,
            },
            android: {
                elevation: 2,
            },
        }),
    },
    groupHeader: {
        backgroundColor: '#EEF3FF',
        borderWidth: 1,
        borderColor: '#C7D9FF',
        paddingHorizontal: 16,
        paddingVertical: 14,
        borderRadius: 16,
        shadowOpacity: 0,
        elevation: 0,
    },
    iconContainer: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: '#F5F6F8',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    icon: {
        fontSize: 18,
    },
    titleContainer: {
        flex: 1,
        justifyContent: 'center',
    },
    nodeTitle: {
        fontSize: 16,
        color: Colors.text,
        fontFamily: 'Pretendard-Bold',
    },
    rootNodeTitle: {
        fontSize: 18,
        fontFamily: 'Pretendard-Bold',
        color: Colors.navy,
    },
    subtitle: {
        fontSize: 12,
        color: Colors.subText,
        fontFamily: 'Pretendard-Medium',
        marginTop: 4,
    },
    childrenContainer: {
        marginTop: 4,
    },
    toggleButton: {
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 20,
        minWidth: 80,
        alignItems: 'center',
        justifyContent: 'center',
    },
    toggleActive: {
        backgroundColor: Colors.navy,
    },
    toggleInactive: {
        backgroundColor: '#F0F0F0',
    },
    toggleText: {
        fontSize: 13,
        fontFamily: 'Pretendard-Bold',
    },
    toggleTextActive: {
        color: Colors.white,
    },
    toggleTextInactive: {
        color: Colors.subText,
    },
    emptyContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 60,
    },
    emptyText: {
        marginTop: 16,
        fontSize: 16,
        fontFamily: 'Pretendard-Medium',
        color: Colors.subText,
    },
});
