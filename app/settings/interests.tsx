import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert, Platform, Modal } from 'react-native';
// Stack import removed (Issue #6: Tabs 하위에서 Stack.Screen 미사용)
import { Colors } from '../../constants/Colors';
import { Ionicons } from '@expo/vector-icons';
import { getInterestCategories, getMySubscriptions, toggleSubscription, InterestCategory, updateSubscriptionFilters, getAvailableFilterOptions, UserInterestSubscription } from '../../services/supabase-modules/interests';

export default function InterestsSettingsScreen() {
    const [categories, setCategories] = useState<InterestCategory[]>([]);
    const [subscriptions, setSubscriptions] = useState<Set<string>>(new Set());
    const [loading, setLoading] = useState(true);
    const [toggling, setToggling] = useState<string | null>(null);

    const [filterOptions, setFilterOptions] = useState<{ regions: string[], detailTypes: string[] }>({ regions: [], detailTypes: [] });
    const [filtersState, setFiltersState] = useState<Record<string, UserInterestSubscription['active_filters']>>({});
    const [filterCategory, setFilterCategory] = useState<InterestCategory | null>(null);
    const [tempFilters, setTempFilters] = useState<UserInterestSubscription['active_filters']>({});

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setLoading(true);
        try {
            const [cats, subs, options] = await Promise.all([
                getInterestCategories(),
                getMySubscriptions(),
                getAvailableFilterOptions()
            ]);
            setCategories(cats);
            setSubscriptions(new Set(subs.map(s => s.category_id)));

            const initFilters: Record<string, UserInterestSubscription['active_filters']> = {};
            subs.forEach(s => {
                if (s.active_filters) initFilters[s.category_id] = s.active_filters;
            });
            setFiltersState(initFilters);
            setFilterOptions(options);
        } catch (error) {
            console.error('Failed to load interests data', error);
            Alert.alert('오류', '관심사 정보를 불러오는데 실패했습니다.');
        } finally {
            setLoading(false);
        }
    };

    const handleToggle = async (category: InterestCategory) => {
        if (!category.target_calendar_id) {
            Alert.alert('안내', '해당 카테고리는 아직 캘린더가 연결되지 않았습니다.');
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

    const handleApplyFilters = async () => {
        if (!filterCategory) return;
        setFiltersState(prev => ({ ...prev, [filterCategory.id]: tempFilters }));
        const success = await updateSubscriptionFilters(filterCategory.id, tempFilters);
        if (!success) {
            Alert.alert('오류', '필터 저장에 실패했습니다.');
        } else {
            setFilterCategory(null);
        }
    };

    const toggleRegion = (region: string) => {
        setTempFilters(prev => {
            const curr = prev?.regions || [];
            const isSelected = curr.includes(region);
            return {
                ...prev,
                regions: isSelected ? curr.filter(r => r !== region) : [...curr, region]
            };
        });
    };

    const toggleDetailType = (type: string) => {
        setTempFilters(prev => {
            const curr = prev?.detail_types || [];
            const isSelected = curr.includes(type);
            return {
                ...prev,
                detail_types: isSelected ? curr.filter(t => t !== type) : [...curr, type]
            };
        });
    };

    const renderCategoryNode = (category: InterestCategory, depth: number = 0) => {
        const isLeaf = category.children?.length === 0 || category.is_leaf;
        const isSubscribed = subscriptions.has(category.id);
        const isToggling = toggling === category.id;

        return (
            <View key={category.id} style={[styles.nodeContainer, { paddingLeft: depth * 16 }]}>
                <View style={styles.nodeHeader}>
                    {category.icon && <Text style={styles.icon}>{category.icon}</Text>}
                    <Text style={[styles.nodeTitle, depth === 0 && styles.rootNodeTitle]}>
                        {category.name}
                    </Text>

                    {isLeaf && (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            {isSubscribed && (
                                <TouchableOpacity
                                    style={[styles.toggleButton, styles.filterButton]}
                                    onPress={() => {
                                        setTempFilters(filtersState[category.id] || { regions: [], detail_types: [] });
                                        setFilterCategory(category);
                                    }}
                                >
                                    <Text style={styles.filterButtonText}>필터 ⚙️</Text>
                                </TouchableOpacity>
                            )}
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
                        </View>
                    )}
                </View>

                {category.children && category.children.length > 0 && (
                    <View style={styles.childrenContainer}>
                        {category.children.map(child => renderCategoryNode(child, depth + 1))}
                    </View>
                )}
            </View>
        );
    };

    if (loading) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={Colors.navy} />
                <Text style={styles.loadingText}>관심사 정보를 불러오는 중...</Text>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            {/* Issue #6: Tabs 라우터 하위이므로 자체 헤더는 숨기고, 
                네비게이션 헤더는 _layout.tsx의 Tabs 설정으로 대체됨 */}

            <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
                <View style={styles.headerArea}>
                    <Text style={styles.headerTitle}>어떤 일정에 관심이 있으신가요?</Text>
                    <Text style={styles.headerSubtitle}>
                        구독한 관심사의 주요 일정이 내 캘린더에 자동으로 추가되고,{'\n'}
                        일정 시작 전 푸시 알림을 받을 수 있습니다.
                    </Text>
                </View>

                <View style={styles.listContainer}>
                    {categories.length > 0 ? (
                        categories.map(rootCat => renderCategoryNode(rootCat))
                    ) : (
                        <View style={styles.emptyContainer}>
                            <Ionicons name="calendar-outline" size={48} color={Colors.subText} />
                            <Text style={styles.emptyText}>준비된 관심사가 없습니다.</Text>
                        </View>
                    )}
                </View>
            </ScrollView>

            <Modal visible={!!filterCategory} animationType="slide" transparent>
                <View style={styles.modalBg}>
                    <View style={styles.modalContent}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>{filterCategory?.name} 상세 필터</Text>
                            <TouchableOpacity onPress={() => setFilterCategory(null)}>
                                <Ionicons name="close" size={24} color={Colors.text} />
                            </TouchableOpacity>
                        </View>

                        <ScrollView style={styles.modalScroll}>
                            <Text style={styles.filterLabel}>지역 (선택하지 않으면 전체)</Text>
                            <View style={styles.chipContainer}>
                                {filterOptions.regions.map(r => {
                                    const selected = tempFilters?.regions?.includes(r);
                                    return (
                                        <TouchableOpacity
                                            key={`region_${r}`}
                                            style={[styles.chip, selected && styles.chipSelected]}
                                            onPress={() => toggleRegion(r)}
                                        >
                                            <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{r}</Text>
                                        </TouchableOpacity>
                                    );
                                })}
                            </View>

                            <Text style={[styles.filterLabel, { marginTop: 20 }]}>세부 유형 (선택하지 않으면 전체)</Text>
                            <View style={styles.chipContainer}>
                                {filterOptions.detailTypes.map(t => {
                                    const selected = tempFilters?.detail_types?.includes(t);
                                    // 영어 라벨을 한글로 매핑 (필요 시 더 정교하게)
                                    const label = t === 'festival' ? '축제' : t === 'exhibition' ? '전시' : t === 'performance' ? '공연' : t === 'musical' ? '뮤지컬' : t === 'concert' ? '콘서트' : t;
                                    return (
                                        <TouchableOpacity
                                            key={`type_${t}`}
                                            style={[styles.chip, selected && styles.chipSelected]}
                                            onPress={() => toggleDetailType(t)}
                                        >
                                            <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
                                        </TouchableOpacity>
                                    );
                                })}
                            </View>
                        </ScrollView>

                        <TouchableOpacity style={styles.saveButton} onPress={handleApplyFilters}>
                            <Text style={styles.saveButtonText}>필터 적용</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.background,
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: Colors.background,
    },
    loadingText: {
        marginTop: 12,
        fontSize: 15,
        color: Colors.subText,
    },
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        paddingBottom: 40,
    },
    headerArea: {
        padding: 24,
        paddingTop: 16,
        backgroundColor: '#F8F9FA',
        borderBottomWidth: 1,
        borderBottomColor: '#F0F0F0',
    },
    headerTitle: {
        fontSize: 22,
        fontWeight: '700',
        color: Colors.text,
        marginBottom: 8,
    },
    headerSubtitle: {
        fontSize: 14,
        color: Colors.subText,
        lineHeight: 20,
    },
    listContainer: {
        padding: 16,
    },
    nodeContainer: {
        marginBottom: 12,
    },
    nodeHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        paddingHorizontal: 16,
        backgroundColor: '#FFF',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#F0F0F0',
        ...Platform.select({
            ios: {
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.04,
                shadowRadius: 4,
            },
            android: {
                elevation: 2,
            },
        }),
    },
    icon: {
        fontSize: 18,
        marginRight: 8,
    },
    nodeTitle: {
        flex: 1,
        fontSize: 15,
        color: Colors.text,
        fontWeight: '500',
    },
    rootNodeTitle: {
        fontSize: 16,
        fontWeight: '700',
    },
    childrenContainer: {
        marginTop: 8,
        borderLeftWidth: 2,
        borderLeftColor: '#F0F0F0',
        marginLeft: 12,
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
        fontWeight: '600',
    },
    toggleTextActive: {
        color: '#FFF',
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
        color: Colors.subText,
    },
    filterButton: {
        backgroundColor: '#E8F0FE',
        minWidth: 60,
    },
    filterButtonText: {
        fontSize: 13,
        color: Colors.navy,
        fontWeight: '600',
    },
    modalBg: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'flex-end',
    },
    modalContent: {
        backgroundColor: '#FFF',
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        padding: 24,
        maxHeight: '80%',
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 20,
    },
    modalTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: Colors.text,
    },
    modalScroll: {
        marginBottom: 20,
    },
    filterLabel: {
        fontSize: 15,
        fontWeight: '600',
        color: Colors.text,
        marginBottom: 12,
    },
    chipContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    chip: {
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 20,
        backgroundColor: '#F0F0F0',
        borderWidth: 1,
        borderColor: 'transparent',
    },
    chipSelected: {
        backgroundColor: '#E8F0FE',
        borderColor: Colors.navy,
    },
    chipText: {
        fontSize: 14,
        color: Colors.text,
    },
    chipTextSelected: {
        color: Colors.navy,
        fontWeight: '600',
    },
    saveButton: {
        backgroundColor: Colors.navy,
        paddingVertical: 16,
        borderRadius: 12,
        alignItems: 'center',
    },
    saveButtonText: {
        color: '#FFF',
        fontSize: 16,
        fontWeight: '700',
    },
});
