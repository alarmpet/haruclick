import { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { supabase } from '../../services/supabase';
import { Colors } from '../../constants/Colors';
import Ionicons from '@expo/vector-icons/Ionicons';
import { PieChart, BarChart } from 'react-native-chart-kit';
import { getCategoryEmoji, getCategoryColor, classifyMerchant, ExpenseCategory } from '../../services/CategoryClassifier';

const screenWidth = Dimensions.get('window').width;

interface CategoryData {
    category: ExpenseCategory;
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

            // Fetch ledger data
            const { data: ledger } = await supabase
                .from('ledger')
                .select('*')
                .order('transaction_date', { ascending: false });

            // Fetch bank transactions
            const { data: bank } = await supabase
                .from('bank_transactions')
                .select('*')
                .order('transaction_date', { ascending: false });

            // Combine and process
            const allExpenses: { date: string; amount: number; name: string; category?: string }[] = [];

            (ledger || []).forEach((item: any) => {
                if (item.category !== '수입' && item.category !== '입금') {
                    allExpenses.push({
                        date: item.transaction_date?.split('T')[0] || '',
                        amount: Math.abs(item.amount || 0),
                        name: item.merchant_name || '',
                        category: item.category
                    });
                }
            });

            (bank || []).forEach((item: any) => {
                if (item.transaction_type !== 'deposit') {
                    allExpenses.push({
                        date: item.transaction_date?.split('T')[0] || '',
                        amount: Math.abs(item.amount || 0),
                        name: item.receiver_name || ''
                    });
                }
            });

            // Process category data (current month)
            const now = new Date();
            const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

            const categoryMap = new Map<ExpenseCategory, CategoryData>();
            let total = 0;

            allExpenses.forEach(expense => {
                if (expense.date.startsWith(currentMonth)) {
                    const cat = classifyMerchant(expense.name);
                    const existing = categoryMap.get(cat) || { category: cat, amount: 0, count: 0 };
                    existing.amount += expense.amount;
                    existing.count += 1;
                    categoryMap.set(cat, existing);
                    total += expense.amount;
                }
            });

            const sortedCategories = Array.from(categoryMap.values())
                .sort((a, b) => b.amount - a.amount)
                .slice(0, 6); // Top 6

            setCategoryData(sortedCategories);
            setTotalSpending(total);

            // Process monthly data (last 6 months)
            const monthlyMap = new Map<string, number>();
            for (let i = 5; i >= 0; i--) {
                const d = new Date();
                d.setMonth(d.getMonth() - i);
                const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
                monthlyMap.set(key, 0);
            }

            allExpenses.forEach(expense => {
                const monthKey = expense.date.substring(0, 7);
                if (monthlyMap.has(monthKey)) {
                    monthlyMap.set(monthKey, (monthlyMap.get(monthKey) || 0) + expense.amount);
                }
            });

            const monthlyArr: MonthlyData[] = [];
            monthlyMap.forEach((amount, month) => {
                const [, m] = month.split('-');
                monthlyArr.push({ month: `${parseInt(m)}월`, amount });
            });

            setMonthlyData(monthlyArr);
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
