import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '../constants/Colors';
import { BlurView } from 'expo-blur';

interface MonthlySummaryProps {
    month: number;
    totalAmount: number;
    completedCount: number;
    totalCount: number;
}

export function MonthlySummary({ month, totalAmount, completedCount, totalCount }: MonthlySummaryProps) {
    return (
        <View style={styles.container}>
            <View style={styles.shadowContainer}>
                <View style={styles.content}>
                    <View style={styles.row}>
                        <View>
                            <Text style={styles.label}>{month}월 나갈 돈 (예상)</Text>
                            <Text style={styles.amount}>{totalAmount.toLocaleString()}원</Text>
                        </View>
                        <View style={styles.divider} />
                        <View>
                            <Text style={styles.label}>송금 완료</Text>
                            <Text style={styles.status}>
                                <Text style={styles.highlight}>{completedCount}</Text>
                                <Text style={styles.total}> / {totalCount}건</Text>
                            </Text>
                        </View>
                    </View>

                    <View style={styles.progressBarBg}>
                        <View style={[styles.progressBarFill, { width: `${(completedCount / totalCount) * 100}%` }]} />
                    </View>
                </View>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        position: 'absolute',
        bottom: 24,
        left: 20,
        right: 20,
    },
    shadowContainer: {
        backgroundColor: Colors.white,
        borderRadius: 20,
        shadowColor: "#000",
        shadowOffset: {
            width: 0,
            height: 4,
        },
        shadowOpacity: 0.1,
        shadowRadius: 12,
        elevation: 8,
    },
    content: {
        padding: 20,
    },
    row: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
    },
    label: {
        fontFamily: 'Pretendard-Medium',
        fontSize: 13,
        color: Colors.subText,
        marginBottom: 4,
    },
    amount: {
        fontFamily: 'Pretendard-Bold',
        fontSize: 20,
        color: Colors.navy,
    },
    divider: {
        width: 1,
        height: 32,
        backgroundColor: '#F2F4F6',
    },
    status: {
        fontFamily: 'Pretendard-Bold',
        fontSize: 20,
        color: Colors.subText,
    },
    highlight: {
        color: Colors.orange,
    },
    total: {
        fontSize: 16,
    },
    progressBarBg: {
        height: 6,
        backgroundColor: '#F2F4F6',
        borderRadius: 3,
        overflow: 'hidden',
    },
    progressBarFill: {
        height: '100%',
        backgroundColor: Colors.orange,
        borderRadius: 3,
    }
});
