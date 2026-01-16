import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '../constants/Colors';

interface VoteResultsBarProps {
    amount: number;
    count: number;
    percentage: number;
}

export function VoteResultsBar({ amount, count, percentage }: VoteResultsBarProps) {
    const formatAmount = (amount: number) => {
        return `${(amount / 10000).toFixed(0)}만원`;
    };

    return (
        <View style={styles.container}>
            <View style={styles.labelRow}>
                <Text style={styles.amountLabel}>{formatAmount(amount)}</Text>
                <Text style={styles.percentageLabel}>{percentage.toFixed(1)}%</Text>
            </View>

            <View style={styles.barContainer}>
                <View
                    style={[
                        styles.barFill,
                        { width: `${percentage}%` }
                    ]}
                />
            </View>

            <Text style={styles.countLabel}>{count}표</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        marginBottom: 12,
    },
    labelRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 6,
    },
    amountLabel: {
        fontFamily: 'Pretendard-Bold',
        fontSize: 14,
        color: Colors.text,
    },
    percentageLabel: {
        fontFamily: 'Pretendard-Bold',
        fontSize: 14,
        color: Colors.orange,
    },
    barContainer: {
        height: 24,
        backgroundColor: Colors.background,
        borderRadius: 12,
        overflow: 'hidden',
        marginBottom: 4,
    },
    barFill: {
        height: '100%',
        backgroundColor: Colors.orange,
        borderRadius: 12,
        minWidth: 2, // Ensure at least a small bar is visible even with low percentages
    },
    countLabel: {
        fontFamily: 'Pretendard-Medium',
        fontSize: 11,
        color: Colors.subText,
        textAlign: 'right',
    },
});
