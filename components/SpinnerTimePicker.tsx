import React, { useRef, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, NativeSyntheticEvent, NativeScrollEvent } from 'react-native';
import { Colors } from '../constants/Colors';

interface SpinnerTimePickerProps {
    hour: number; // 0-23
    minute: number; // 0-59
    onChange: (h: number, m: number) => void;
}

const ITEM_HEIGHT = 50;
const VISIBLE_ITEMS = 3; // Number of items visible at once (must be odd)
const CONTAINER_HEIGHT = ITEM_HEIGHT * VISIBLE_ITEMS;

export default function SpinnerTimePicker({ hour, minute, onChange }: SpinnerTimePickerProps) {
    // 1. Data Setup
    // Base arrays
    const HOURS_BASE = Array.from({ length: 12 }, (_, i) => i === 0 ? 12 : i); // [12, 1, 2, ... 11]
    const MINUTES_BASE = Array.from({ length: 60 }, (_, i) => i); // [0, 1, ... 59]
    const AMPM = ['오전', '오후'];

    // Infinite Loop Config
    const LOOPS = 400; // Large enough loop count
    const HALF_LOOPS = Math.floor(LOOPS / 2);

    // Create massive arrays for infinite illusion
    // useMemo prevents recreation on every render
    const HOURS_DATA = useMemo(() => Array.from({ length: LOOPS }, () => HOURS_BASE).flat(), []);
    const MINUTES_DATA = useMemo(() => Array.from({ length: LOOPS }, () => MINUTES_BASE).flat(), []);

    // 2. State & Index Calculation
    const isPm = hour >= 12;
    const displayHour12 = hour % 12 === 0 ? 12 : hour % 12;

    // Find where the current time is in the *Base* array
    const baseHourIndex = HOURS_BASE.indexOf(displayHour12);
    const baseMinuteIndex = MINUTES_BASE.indexOf(minute);

    // Initial scroll position: Start at the middle set of data
    const initialHourIndex = (HALF_LOOPS * HOURS_BASE.length) + baseHourIndex;
    const initialMinuteIndex = (HALF_LOOPS * MINUTES_BASE.length) + baseMinuteIndex;

    // 3. Render Item
    const renderItem = ({ item, index, type }) => {
        let isSelected = false;
        if (type === 'ampm') {
            isSelected = ((index === 0 && !isPm) || (index === 1 && isPm));
        } else if (type === 'hour') {
            isSelected = item === displayHour12;
        } else if (type === 'minute') {
            isSelected = item === minute;
        }

        return (
            <View style={[styles.item, { height: ITEM_HEIGHT }]}>
                <Text style={[styles.text, isSelected && styles.selectedText]}>
                    {type === 'minute' ? item.toString().padStart(2, '0') : item}
                </Text>
            </View>
        );
    };

    // 4. Scroll Handler
    const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>, type: 'ampm' | 'hour' | 'minute') => {
        const offsetY = event.nativeEvent.contentOffset.y;
        const index = Math.round(offsetY / ITEM_HEIGHT);

        if (type === 'ampm') {
            const newIsPm = index === 1;
            // Prevent out of bounds for AMPM (since it's not infinite)
            if (index < 0 || index > 1) return;

            if (newIsPm !== isPm) {
                let newH = hour;
                if (newIsPm && hour < 12) newH += 12;
                if (!newIsPm && hour >= 12) newH -= 12;
                onChange(newH, minute);
            }
        } else if (type === 'hour') {
            // Safe modulo access
            if (index < 0) return;
            const safeIndex = index % HOURS_DATA.length;
            const selected12 = HOURS_DATA[safeIndex];

            if (selected12 !== undefined) {
                let newH = selected12 === 12 ? 0 : selected12;
                if (isPm) newH += 12;
                // Only update if changed (prevents loop)
                if (newH !== hour) onChange(newH, minute);
            }
        } else if (type === 'minute') {
            if (index < 0) return;
            const safeIndex = index % MINUTES_DATA.length;
            const newM = MINUTES_DATA[safeIndex];

            if (newM !== undefined && newM !== minute) {
                onChange(hour, newM);
            }
        }
    };

    return (
        <View style={styles.container}>
            <View style={styles.overlay} pointerEvents="none" />

            {/* AM/PM (Finite) */}
            <View style={styles.column}>
                <FlatList
                    data={AMPM}
                    keyExtractor={(item) => item}
                    renderItem={({ item, index }) => renderItem({ item, index, type: 'ampm' })}
                    snapToInterval={ITEM_HEIGHT}
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={{ paddingVertical: ITEM_HEIGHT * (VISIBLE_ITEMS - 1) / 2 }}
                    onMomentumScrollEnd={(e) => handleScroll(e, 'ampm')}
                    onScrollEndDrag={(e) => handleScroll(e, 'ampm')}
                    initialScrollIndex={isPm ? 1 : 0}
                    getItemLayout={(_, index) => ({ length: ITEM_HEIGHT, offset: ITEM_HEIGHT * index, index })}
                />
            </View>

            {/* Hour (Infinite) */}
            <View style={styles.column}>
                <FlatList
                    data={HOURS_DATA}
                    keyExtractor={(item, index) => `${index}`}
                    renderItem={({ item, index }) => renderItem({ item, index, type: 'hour' })}
                    snapToInterval={ITEM_HEIGHT}
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={{ paddingVertical: ITEM_HEIGHT * (VISIBLE_ITEMS - 1) / 2 }}
                    onMomentumScrollEnd={(e) => handleScroll(e, 'hour')}
                    onScrollEndDrag={(e) => handleScroll(e, 'hour')}
                    initialScrollIndex={initialHourIndex}
                    getItemLayout={(_, index) => ({ length: ITEM_HEIGHT, offset: ITEM_HEIGHT * index, index })}
                    windowSize={5}
                    initialNumToRender={15}
                    maxToRenderPerBatch={15}
                />
            </View>

            <Text style={styles.colon}>:</Text>

            {/* Minute (Infinite) */}
            <View style={styles.column}>
                <FlatList
                    data={MINUTES_DATA}
                    keyExtractor={(item, index) => `${index}`}
                    renderItem={({ item, index }) => renderItem({ item, index, type: 'minute' })}
                    snapToInterval={ITEM_HEIGHT}
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={{ paddingVertical: ITEM_HEIGHT * (VISIBLE_ITEMS - 1) / 2 }}
                    onMomentumScrollEnd={(e) => handleScroll(e, 'minute')}
                    onScrollEndDrag={(e) => handleScroll(e, 'minute')}
                    initialScrollIndex={initialMinuteIndex}
                    getItemLayout={(_, index) => ({ length: ITEM_HEIGHT, offset: ITEM_HEIGHT * index, index })}
                    windowSize={5}
                    initialNumToRender={15}
                    maxToRenderPerBatch={15}
                />
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        height: CONTAINER_HEIGHT,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'transparent',
        borderRadius: 16,
        overflow: 'hidden',
        width: '100%',
        // borderWidth: 1, // Removed border for cleaner look
        // borderColor: '#334155', 
    },
    column: {
        width: 70,
        height: '100%',
        alignItems: 'center',
    },
    item: {
        height: ITEM_HEIGHT,
        justifyContent: 'center',
        alignItems: 'center',
    },
    text: {
        fontFamily: 'Pretendard-Medium',
        fontSize: 18,
        color: '#94A3B8', // Slate 400 (Subtle text)
    },
    selectedText: {
        fontFamily: 'Pretendard-Bold',
        fontSize: 22,
        color: Colors.orange, // Theme Orange for active item
    },
    colon: {
        fontFamily: 'Pretendard-Bold',
        fontSize: 22,
        color: Colors.white, // Keep colon white or orange? Let's go White for readability
        marginHorizontal: 10,
        paddingBottom: 4,
    },
    overlay: {
        position: 'absolute',
        top: ITEM_HEIGHT,
        height: ITEM_HEIGHT,
        width: '100%',
        backgroundColor: '#1E293B', // Slate 800 (Slightly lighter than navy)
        borderRadius: 8,
        opacity: 0.5, // highlight effect
    }
});
