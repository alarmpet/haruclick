import { View, StyleSheet, Animated, Dimensions } from 'react-native';
import { useEffect, useRef } from 'react';
import { Colors } from '../constants/Colors';

const { width } = Dimensions.get('window');
const CELL_SIZE = (width - 40) / 7;

export function SkeletonCalendar() {
    const shimmerValue = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        const shimmerAnimation = Animated.loop(
            Animated.sequence([
                Animated.timing(shimmerValue, {
                    toValue: 1,
                    duration: 1000,
                    useNativeDriver: true,
                }),
                Animated.timing(shimmerValue, {
                    toValue: 0,
                    duration: 1000,
                    useNativeDriver: true,
                }),
            ])
        );
        shimmerAnimation.start();
        return () => shimmerAnimation.stop();
    }, [shimmerValue]);

    const shimmerOpacity = shimmerValue.interpolate({
        inputRange: [0, 1],
        outputRange: [0.3, 0.6],
    });

    // 6주 x 7일 = 42일
    const cells = Array.from({ length: 42 }, (_, i) => i);

    return (
        <View style={styles.container}>
            {/* 요일 헤더 스켈레톤 */}
            <View style={styles.weekHeader}>
                {Array.from({ length: 7 }, (_, i) => (
                    <Animated.View
                        key={`header-${i}`}
                        style={[styles.weekDayCell, { opacity: shimmerOpacity }]}
                    />
                ))}
            </View>

            {/* 캘린더 그리드 스켈레톤 */}
            <View style={styles.grid}>
                {cells.map((_, i) => (
                    <View key={`cell-${i}`} style={styles.cell}>
                        <Animated.View
                            style={[styles.dateCircle, { opacity: shimmerOpacity }]}
                        />
                        {/* 랜덤하게 이벤트 바 표시 */}
                        {i % 5 === 0 && (
                            <Animated.View
                                style={[styles.eventBar, { opacity: shimmerOpacity }]}
                            />
                        )}
                        {i % 7 === 3 && (
                            <Animated.View
                                style={[styles.eventBar, styles.eventBarShort, { opacity: shimmerOpacity }]}
                            />
                        )}
                    </View>
                ))}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        paddingHorizontal: 20,
        paddingTop: 10,
    },
    weekHeader: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        marginBottom: 12,
    },
    weekDayCell: {
        width: 24,
        height: 14,
        backgroundColor: 'rgba(255,255,255,0.1)',
        borderRadius: 4,
    },
    grid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
    },
    cell: {
        width: CELL_SIZE,
        height: CELL_SIZE + 20,
        alignItems: 'center',
        paddingTop: 6,
    },
    dateCircle: {
        width: 28,
        height: 28,
        borderRadius: 14,
        backgroundColor: 'rgba(255,255,255,0.08)',
        marginBottom: 4,
    },
    eventBar: {
        width: CELL_SIZE - 8,
        height: 14,
        backgroundColor: 'rgba(255,255,255,0.06)',
        borderRadius: 4,
        marginTop: 2,
    },
    eventBarShort: {
        width: CELL_SIZE - 20,
    },
});
