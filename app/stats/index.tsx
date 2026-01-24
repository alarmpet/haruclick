import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { fetchPeriodStats } from '../../services/supabase';
import { Colors } from '../../constants/Colors';
import Ionicons from '@expo/vector-icons/Ionicons';
import { PieChart } from 'react-native-chart-kit';
import { useTheme } from '../../contexts/ThemeContext';

const { width } = Dimensions.get('window');

// --- 1. CONFIG & TYPES ---

interface CategoryConfigType {
    color: string;
    emoji: string;
    label: string;
}

const CATEGORY_CONFIG: Record<string, CategoryConfigType> = {
    '식비': { color: '#FF9F43', emoji: '🍚', label: '식비' },
    '카페/간식': { color: '#D6A2E8', emoji: '☕', label: '카페/간식' },
    '쇼핑/생활': { color: '#54A0FF', emoji: '🛍️', label: '쇼핑/생활' },
    '교통/차량': { color: '#1DD1A1', emoji: '🚌', label: '교통/차량' },
    '이체/출금': { color: '#576574', emoji: '💸', label: '이체/출금' },
    '모임/경조사': { color: '#FF6B6B', emoji: '🎉', label: '모임/경조사' },
    '경조사비': { color: '#FF6B6B', emoji: '🎉', label: '모임/경조사' },
    '주거/공과금': { color: '#48DBFB', emoji: '🏠', label: '주거/공과금' },
    '의료/건강': { color: '#FF9FF3', emoji: '🏥', label: '의료/건강' },
    '교육/학습': { color: '#F368E0', emoji: '📚', label: '교육/학습' },
    '기타': { color: '#C8D6E5', emoji: '📦', label: '기타' },
};

const getCategoryStyle = (catName: string): CategoryConfigType => {
    if (catName.includes('식비')) return CATEGORY_CONFIG['식비'];
    if (catName.includes('카페') || catName.includes('간식')) return CATEGORY_CONFIG['카페/간식'];
    if (catName.includes('쇼핑') || catName.includes('생활')) return CATEGORY_CONFIG['쇼핑/생활'];
    if (catName.includes('교통') || catName.includes('차량') || catName.includes('주유')) return CATEGORY_CONFIG['교통/차량'];
    if (catName.includes('이체') || catName.includes('출금')) return CATEGORY_CONFIG['이체/출금'];
    if (catName.includes('경조사') || catName.includes('모임')) return CATEGORY_CONFIG['모임/경조사'];
    if (catName.includes('주거') || catName.includes('공과금') || catName.includes('관리비')) return CATEGORY_CONFIG['주거/공과금'];
    if (catName.includes('의료') || catName.includes('건강') || catName.includes('병원')) return CATEGORY_CONFIG['의료/건강'];
    if (catName.includes('교육') || catName.includes('학원')) return CATEGORY_CONFIG['교육/학습'];
    return CATEGORY_CONFIG['기타'];
};

interface CategoryData {
    category: string;
    amount: number;
    count: number;
    percent: number;
}

// --- 2. COMPONENTS ---

const InsightCard = ({ title, value, subtext, icon, color, isDark }: any) => (
    <View style={[styles.insightCard, { backgroundColor: isDark ? '#1E293B' : '#FFF' }]}>
        <View style={[styles.insightIcon, { backgroundColor: color + '20' }]}>
            <Text style={{ fontSize: 20 }}>{icon}</Text>
        </View>
        <View style={{ gap: 2 }}>
            <Text style={[styles.insightTitle, { color: isDark ? '#94A3B8' : '#64748B' }]}>{title}</Text>
            <Text style={[styles.insightValue, { color: isDark ? '#FFF' : '#1E293B' }]}>{value}</Text>
            {subtext && <Text style={[styles.insightSub, { color: color }]}>{subtext}</Text>}
        </View>
    </View>
);

const CategoryListTile = ({ item, maxAmount, isDark }: { item: CategoryData; maxAmount: number; isDark: boolean }) => {
    const styleConfig = getCategoryStyle(item.category);

    return (
        <View style={[styles.tileContainer, { backgroundColor: isDark ? '#1E293B' : '#FFF' }]}>
            <View style={[styles.tileIcon, { backgroundColor: styleConfig.color + '20' }]}>
                <Text style={{ fontSize: 20 }}>{styleConfig.emoji}</Text>
            </View>
            <View style={styles.tileInfo}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={[styles.tileCategory, { color: isDark ? '#FFF' : '#1E293B' }]}>{item.category}</Text>
                    <Text style={[styles.tileAmount, { color: isDark ? '#FFF' : '#1E293B' }]}>
                        {item.amount.toLocaleString()}원
                    </Text>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
                    <Text style={[styles.tileCount, { color: isDark ? '#64748B' : '#94A3B8' }]}>
                        {item.count}건
                    </Text>
                    <Text style={[styles.tilePercent, { color: styleConfig.color }]}>
                        {item.percent.toFixed(1)}%
                    </Text>
                </View>
                <View style={styles.progressBarBg}>
                    <View style={[styles.progressBarFill, { width: `${item.percent}%`, backgroundColor: styleConfig.color }]} />
                </View>
            </View>
        </View>
    );
};

// --- 3. MAIN SCREEN ---

export default function StatsScreen() {
    const router = useRouter();
    const { colors, isDark } = useTheme();

    const [loading, setLoading] = useState(true);
    const [categoryData, setCategoryData] = useState<CategoryData[]>([]);
    const [totalSpending, setTotalSpending] = useState(0);
    const [spendingDiff, setSpendingDiff] = useState(0); // Comparison Logic

    const fetchData = useCallback(async () => {
        try {
            setLoading(true);
            const now = new Date();
            const currentYear = now.getFullYear();
            const currentMonthIndex = now.getMonth();

            // 1. Fetch Range: Last Month Start ~ Next Month Start (Covering 2 months)
            const startDateObj = new Date(currentYear, currentMonthIndex - 1, 1);
            const startDate = `${startDateObj.getFullYear()}-${String(startDateObj.getMonth() + 1).padStart(2, '0')}-01`;
            const endDateObj = new Date(currentYear, currentMonthIndex + 1, 1);
            const endDate = `${endDateObj.getFullYear()}-${String(endDateObj.getMonth() + 1).padStart(2, '0')}-01`;

            const stats = await fetchPeriodStats(startDate, endDate);

            // Keys for checking month
            const thisMonthKey = `${currentYear}-${String(currentMonthIndex + 1).padStart(2, '0')}`;
            // Last month handling (handles year rollover automatically by Date obj but string key needs care)
            // Actually simpler: just use startWith
            const lastMonthDate = new Date(currentYear, currentMonthIndex - 1, 1);
            const lastMonthKey = `${lastMonthDate.getFullYear()}-${String(lastMonthDate.getMonth() + 1).padStart(2, '0')}`;

            // unified logic
            const processExpenseItem = (item: any, source: 'event' | 'ledger' | 'bank') => {
                if (source === 'event') {
                    if (!item.is_received && item.memo?.includes('[송금완료]')) return item.amount;
                    return 0;
                }
                if (source === 'ledger') {
                    const isExcluded =
                        item.category_group === 'income' ||
                        item.category_group === 'asset_transfer' ||
                        item.category === '수입' ||
                        item.category === '입금' ||
                        item.category === '이체' ||
                        item.category === '저축';
                    if (!isExcluded) return item.amount;
                    return 0;
                }
                if (source === 'bank') {
                    if (item.transaction_type === 'withdrawal') return item.amount;
                    return 0;
                }
                return 0;
            };

            const getCategory = (item: any, source: 'event' | 'ledger' | 'bank') => {
                if (source === 'event') return '경조사비';
                if (source === 'bank') return item.category || '이체/출금';
                return item.category;
            };

            const categoryMap = new Map<string, CategoryData>();
            let thisMonthTotal = 0;
            let lastMonthTotal = 0;

            const processItem = (item: any, source: 'event' | 'ledger' | 'bank', dateStr: string) => {
                if (!dateStr) return;
                const amount = processExpenseItem(item, source);
                if (amount > 0) {
                    // Check Month
                    if (dateStr.startsWith(thisMonthKey)) {
                        thisMonthTotal += amount;
                        const cat = getCategory(item, source);
                        const existing = categoryMap.get(cat) || { category: cat, amount: 0, count: 0, percent: 0 };
                        existing.amount += amount;
                        existing.count += 1;
                        categoryMap.set(cat, existing);
                    } else if (dateStr.startsWith(lastMonthKey)) {
                        lastMonthTotal += amount;
                    }
                }
            };

            stats.raw.events.forEach((e: any) => processItem(e, 'event', e.event_date));
            stats.raw.ledger.forEach((e: any) => processItem(e, 'ledger', e.transaction_date));
            stats.raw.bank.forEach((e: any) => processItem(e, 'bank', e.transaction_date));

            // Diff
            const diff = thisMonthTotal - lastMonthTotal;

            // Sort & Percent
            const sorted = Array.from(categoryMap.values())
                .map(i => ({ ...i, percent: thisMonthTotal > 0 ? (i.amount / thisMonthTotal) * 100 : 0 }))
                .sort((a, b) => b.amount - a.amount);

            setCategoryData(sorted);
            setTotalSpending(thisMonthTotal);
            setSpendingDiff(diff);

        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const pieData = categoryData.map(item => ({
        name: item.category,
        population: item.amount,
        color: getCategoryStyle(item.category).color,
        legendFontColor: isDark ? '#FFF' : '#333',
        legendFontSize: 12
    }));

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                    <Ionicons name="arrow-back" size={24} color={colors.text} />
                </TouchableOpacity>
                <Text style={[styles.headerTitle, { color: colors.text }]}>소비 분석</Text>
                <View style={{ width: 40 }} />
            </View>

            <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
                {/* 1. Insights Scroll */}
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.insightScroll} contentContainerStyle={styles.insightContent}>
                    {/* A. Total Spending */}
                    <InsightCard
                        title="이번 달 총 지출"
                        value={`${(totalSpending / 10000).toFixed(0)}만원`}
                        icon="💰"
                        color={Colors.orange}
                        isDark={isDark}
                    />

                    {/* B. Comparison (New) */}
                    <InsightCard
                        title="지난달 대비"
                        value={`${Math.abs(spendingDiff / 10000).toFixed(0)}만원 ${spendingDiff > 0 ? '더 씀' : '덜 씀'}`}
                        subtext={spendingDiff > 0 ? `▲ ${(spendingDiff / 10000).toFixed(1)}만` : `▼ ${(Math.abs(spendingDiff) / 10000).toFixed(1)}만`}
                        icon={spendingDiff > 0 ? "📈" : "📉"}
                        color={spendingDiff > 0 ? Colors.danger : Colors.success}
                        isDark={isDark}
                    />

                    {/* C. Max Category */}
                    {categoryData.length > 0 && (
                        <InsightCard
                            title="최대 지출 항목"
                            value={categoryData[0].category}
                            subtext={`${categoryData[0].percent.toFixed(0)}% 차지`}
                            icon={getCategoryStyle(categoryData[0].category).emoji}
                            color={getCategoryStyle(categoryData[0].category).color}
                            isDark={isDark}
                        />
                    )}
                </ScrollView>

                {/* 2. Donut Chart */}
                <View style={[styles.chartCard, { backgroundColor: isDark ? '#1E293B' : '#FFF' }]}>
                    <View style={styles.chartWrapper}>
                        <PieChart
                            data={pieData}
                            width={width}
                            height={220}
                            chartConfig={{
                                color: (opacity = 1) => `rgba(0, 0, 0, ${opacity})`,
                            }}
                            accessor={"population"}
                            backgroundColor={"transparent"}
                            paddingLeft={"80"}
                            absolute={false}
                            hasLegend={false}
                        />
                        <View style={styles.chartCenterOverlay}>
                            <Text style={[styles.chartCenterValue, { color: colors.text }]}>
                                {(totalSpending / 10000).toFixed(0)}
                            </Text>
                            <Text style={[styles.chartCenterLabel, { color: colors.subText }]}>만원</Text>
                        </View>
                    </View>

                    <View style={styles.legendGrid}>
                        {categoryData.slice(0, 4).map((item, idx) => {
                            const style = getCategoryStyle(item.category);
                            return (
                                <View key={idx} style={styles.legendItem}>
                                    <View style={[styles.legendDot, { backgroundColor: style.color }]} />
                                    <Text style={[styles.legendText, { color: colors.subText }]}>{style.emoji} {item.category} {item.percent.toFixed(0)}%</Text>
                                </View>
                            );
                        })}
                    </View>
                </View>

                {/* 3. Detailed List */}
                <Text style={[styles.sectionTitle, { color: colors.text }]}>지출 상세</Text>
                <View style={styles.listContainer}>
                    {categoryData.map((item, index) => (
                        <CategoryListTile
                            key={index}
                            item={item}
                            maxAmount={totalSpending}
                            isDark={isDark}
                        />
                    ))}
                </View>
                <View style={{ height: 40 }} />
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
    backButton: { padding: 8 },
    headerTitle: { fontFamily: 'Pretendard-Bold', fontSize: 18 },
    content: { flex: 1 },
    insightScroll: { marginTop: 10, marginBottom: 20 },
    insightContent: { paddingHorizontal: 16, gap: 12 },
    insightCard: { width: 140, padding: 16, borderRadius: 16, gap: 12, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
    insightIcon: { width: 36, height: 36, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
    insightTitle: { fontSize: 12, fontFamily: 'Pretendard-Medium' },
    insightValue: { fontSize: 15, fontFamily: 'Pretendard-Bold' },
    insightSub: { fontSize: 11, fontFamily: 'Pretendard-Bold' },
    chartCard: { marginHorizontal: 16, borderRadius: 24, paddingVertical: 20, alignItems: 'center', marginBottom: 24, shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 12, elevation: 3 },
    chartWrapper: { position: 'relative', alignItems: 'center', justifyContent: 'center', height: 220 },
    chartCenterOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center', pointerEvents: 'none', paddingRight: 60 },
    chartCenterValue: { fontSize: 24, fontFamily: 'Pretendard-Bold' },
    chartCenterLabel: { fontSize: 12, fontFamily: 'Pretendard-Medium', marginTop: 2 },
    legendGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 16, paddingHorizontal: 20, marginTop: 10 },
    legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    legendDot: { width: 8, height: 8, borderRadius: 4 },
    legendText: { fontSize: 12, fontFamily: 'Pretendard-Medium' },
    sectionTitle: { fontSize: 18, fontFamily: 'Pretendard-Bold', marginHorizontal: 20, marginBottom: 12 },
    listContainer: { paddingHorizontal: 16, gap: 12 },
    tileContainer: { flexDirection: 'row', padding: 16, borderRadius: 16, alignItems: 'center', gap: 16, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.03, shadowRadius: 4, elevation: 1 },
    tileIcon: { width: 44, height: 44, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
    tileInfo: { flex: 1, gap: 2 },
    tileCategory: { fontFamily: 'Pretendard-Bold', fontSize: 15 },
    tileAmount: { fontFamily: 'Pretendard-Bold', fontSize: 15 },
    tileCount: { fontSize: 12, fontFamily: 'Pretendard-Medium' },
    tilePercent: { fontSize: 12, fontFamily: 'Pretendard-Bold' },
    progressBarBg: { height: 4, backgroundColor: '#F1F5F9', borderRadius: 2, marginTop: 6, overflow: 'hidden' },
    progressBarFill: { height: '100%', borderRadius: 2 }
});
