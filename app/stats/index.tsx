import { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { supabase, fetchPeriodStats } from '../../services/supabase';
import { Colors } from '../../constants/Colors';
import Ionicons from '@expo/vector-icons/Ionicons';
import { PieChart, BarChart } from 'react-native-chart-kit';
import { getCategoryEmoji, getCategoryColor, classifyMerchant, ExpenseCategory } from '../../services/CategoryClassifier';
import { CategoryGroupType } from '../../constants/categories';

const screenWidth = Dimensions.get('window').width;

interface CategoryData {
    category: string;
    amount: number;
    count: number;
}

interface MonthlyData {
    month: string;
    amount: number;
}

export default function StatsScreen() {
    const router = useRouter();

    const [loading, setLoading] = useState(true);
    const [categoryData, setCategoryData] = useState<CategoryData[]>([]);
    const [monthlyData, setMonthlyData] = useState<MonthlyData[]>([]);
    const [totalSpending, setTotalSpending] = useState(0);

    const fetchData = useCallback(async () => {
        try {
            setLoading(true);

            // Calculate Date Range (Last 6 Months)
            const now = new Date();
            const currentYear = now.getFullYear();
            const currentMonthIndex = now.getMonth(); // 0-11

            // Start Date: 5 months ago
            const startDateObj = new Date(currentYear, currentMonthIndex - 5, 1);
            const startDate = `${startDateObj.getFullYear()}-${String(startDateObj.getMonth() + 1).padStart(2, '0')}-01`;

            // End Date: Next Month 1st
            const endDateObj = new Date(currentYear, currentMonthIndex + 1, 1);
            const endDate = `${endDateObj.getFullYear()}-${String(endDateObj.getMonth() + 1).padStart(2, '0')}-01`;

            console.log('[Stats] Fetching period stats:', { startDate, endDate });

            const stats = await fetchPeriodStats(startDate, endDate);

            // Helper to check if expense (Matches Unified Definition)
            // Note: fetchPeriodStats filters ledger/bank somewhat, but raw includes what query returned.
            // Actually fetchPeriodStats query strictly filters Ledger by date, but selects category_group.
            // We need to apply the Spending Definition to the raw items.

            const processExpenseItem = (item: any, source: 'event' | 'ledger' | 'bank') => {
                if (source === 'event') {
                    // Paid Events only
                    if (!item.is_received && item.memo?.includes('[송금완료]')) return item.amount;
                    return 0;
                }
                if (source === 'ledger') {
                    // Expenses only (Unified Definition: Exclude Income, Transfer, Savings)
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
                    // Withdrawals only
                    if (item.transaction_type === 'withdrawal') return item.amount;
                    return 0;
                }
                return 0;
            };

            const getCategory = (item: any, source: 'event' | 'ledger' | 'bank') => {
                if (source === 'event') return '경조사비'; // Event Expenses
                if (source === 'bank') return item.category || '이체/출금';
                return item.category;
            };

            // Process Monthly Data (Last 6 Months)
            const monthlyMap = new Map<string, number>();
            // Initialize last 6 months
            for (let i = 5; i >= 0; i--) {
                const d = new Date(currentYear, currentMonthIndex - i, 1);
                const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
                monthlyMap.set(key, 0);
            }

            // Aggregate Monthly
            const addToMonthly = (dateStr: string, amount: number) => {
                const key = dateStr.substring(0, 7); // YYYY-MM
                if (monthlyMap.has(key)) {
                    monthlyMap.set(key, (monthlyMap.get(key) || 0) + amount);
                }
            };

            stats.raw.events.forEach((e: any) => addToMonthly(e.event_date || '', processExpenseItem(e, 'event')));
            stats.raw.ledger.forEach((e: any) => addToMonthly(e.transaction_date || '', processExpenseItem(e, 'ledger')));
            stats.raw.bank.forEach((e: any) => addToMonthly(e.transaction_date || '', processExpenseItem(e, 'bank')));

            const monthlyArr: MonthlyData[] = [];
            monthlyMap.forEach((amount, month) => {
                const [, m] = month.split('-');
                monthlyArr.push({ month: `${parseInt(m)}월`, amount });
            });
            setMonthlyData(monthlyArr);


            // Process Category Data (Current Month Only)
            const currentMonthKey = `${currentYear}-${String(currentMonthIndex + 1).padStart(2, '0')}`;
            const categoryMap = new Map<string, CategoryData>();
            let currentMonthTotal = 0;

            const processCurrentMonthItem = (item: any, source: 'event' | 'ledger' | 'bank', dateStr: string) => {
                if (dateStr.startsWith(currentMonthKey)) {
                    const amount = processExpenseItem(item, source);
                    if (amount > 0) {
                        const cat = getCategory(item, source);
                        const existing = categoryMap.get(cat) || { category: cat, amount: 0, count: 0 };
                        existing.amount += amount;
                        existing.count += 1;
                        categoryMap.set(cat, existing);
                        currentMonthTotal += amount;
                    }
                }
            };

            stats.raw.events.forEach((e: any) => processCurrentMonthItem(e, 'event', e.event_date || ''));
            stats.raw.ledger.forEach((e: any) => processCurrentMonthItem(e, 'ledger', e.transaction_date || ''));
            stats.raw.bank.forEach((e: any) => processCurrentMonthItem(e, 'bank', e.transaction_date || ''));

            const sortedCategories = Array.from(categoryMap.values())
                .sort((a, b) => b.amount - a.amount)
                .slice(0, 6);

            setCategoryData(sortedCategories);
            setTotalSpending(currentMonthTotal);

        } catch (error) {
            console.error('Error fetching stats:', error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const pieChartData = categoryData.map(item => ({
        name: item.category,
        amount: item.amount,
        color: getCategoryColor(item.category),
        legendFontColor: '#333',
        legendFontSize: 12
    }));

    const barChartData = {
        labels: monthlyData.map(d => d.month),
        datasets: [{
            data: monthlyData.map(d => d.amount / 10000) // 만원 단위
        }]
    };

    return (
        <SafeAreaView style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                    <Ionicons name="arrow-back" size={24} color={Colors.text} />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>소비 통계</Text>
                <View style={{ width: 40 }} />
            </View>

            <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
                {/* Summary Card */}
                <View style={styles.summaryCard}>
                    <Text style={styles.summaryLabel}>이번 달 총 지출</Text>
                    <Text style={styles.summaryAmount}>
                        {totalSpending.toLocaleString()}원
                    </Text>
                </View>

                {/* Monthly Bar Chart */}
                <View style={styles.chartCard}>
                    <Text style={styles.chartTitle}>📊 월별 지출 추이</Text>
                    {monthlyData.length > 0 ? (
                        <BarChart
                            data={barChartData}
                            width={screenWidth - 48}
                            height={200}
                            yAxisLabel=""
                            yAxisSuffix="만"
                            chartConfig={{
                                backgroundColor: '#fff',
                                backgroundGradientFrom: '#fff',
                                backgroundGradientTo: '#fff',
                                decimalPlaces: 0,
                                color: (opacity = 1) => `rgba(59, 130, 246, ${opacity})`,
                                labelColor: () => '#666',
                                barPercentage: 0.6,
                                propsForBackgroundLines: {
                                    strokeDasharray: ''
                                }
                            }}
                            style={styles.chart}
                            showValuesOnTopOfBars
                        />
                    ) : (
                        <Text style={styles.noData}>데이터가 없습니다</Text>
                    )}
                </View>

                {/* Category Pie Chart */}
                <View style={styles.chartCard}>
                    <Text style={styles.chartTitle}>🏷️ 카테고리별 지출</Text>
                    {pieChartData.length > 0 ? (
                        <PieChart
                            data={pieChartData}
                            width={screenWidth - 48}
                            height={200}
                            chartConfig={{
                                color: () => '#000'
                            }}
                            accessor="amount"
                            backgroundColor="transparent"
                            paddingLeft="15"
                            absolute
                        />
                    ) : (
                        <Text style={styles.noData}>데이터가 없습니다</Text>
                    )}
                </View>

                {/* Category List */}
                <View style={styles.categoryList}>
                    <Text style={styles.chartTitle}>📋 세부 내역</Text>
                    {categoryData.map((item, index) => (
                        <View key={item.category} style={styles.categoryItem}>
                            <View style={styles.categoryLeft}>
                                <Text style={styles.categoryRank}>{index + 1}</Text>
                                <Text style={styles.categoryEmoji}>{getCategoryEmoji(item.category)}</Text>
                                <Text style={styles.categoryName}>{item.category}</Text>
                            </View>
                            <View style={styles.categoryRight}>
                                <Text style={styles.categoryAmount}>{item.amount.toLocaleString()}원</Text>
                                <Text style={styles.categoryCount}>{item.count}건</Text>
                            </View>
                        </View>
                    ))}
                </View>
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.background
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: Colors.border
    },
    backButton: {
        padding: 8
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: Colors.text
    },
    content: {
        flex: 1,
        padding: 16
    },
    summaryCard: {
        backgroundColor: Colors.primary,
        borderRadius: 16,
        padding: 24,
        alignItems: 'center',
        marginBottom: 16
    },
    summaryLabel: {
        color: 'rgba(255,255,255,0.8)',
        fontSize: 14,
        marginBottom: 8
    },
    summaryAmount: {
        color: '#fff',
        fontSize: 32,
        fontWeight: '700'
    },
    chartCard: {
        backgroundColor: '#fff',
        borderRadius: 16,
        padding: 16,
        marginBottom: 16,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
        elevation: 2
    },
    chartTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: Colors.text,
        marginBottom: 16
    },
    chart: {
        borderRadius: 12
    },
    noData: {
        textAlign: 'center',
        color: Colors.subText,
        paddingVertical: 40
    },
    categoryList: {
        backgroundColor: '#fff',
        borderRadius: 16,
        padding: 16,
        marginBottom: 32
    },
    categoryItem: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: Colors.border
    },
    categoryLeft: {
        flexDirection: 'row',
        alignItems: 'center'
    },
    categoryRank: {
        width: 24,
        fontSize: 14,
        fontWeight: '600',
        color: Colors.subText
    },
    categoryEmoji: {
        fontSize: 20,
        marginRight: 8
    },
    categoryName: {
        fontSize: 15,
        color: Colors.text
    },
    categoryRight: {
        alignItems: 'flex-end'
    },
    categoryAmount: {
        fontSize: 15,
        fontWeight: '600',
        color: Colors.text
    },
    categoryCount: {
        fontSize: 12,
        color: Colors.subText
    }
});
