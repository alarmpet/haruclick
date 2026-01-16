import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Line, Text as SvgText, G } from 'react-native-svg';

interface AnalogTimePickerProps {
    hour: number; // 0-23
    minute: number; // 0-59
    onChange: (h: number, m: number) => void;
}

const AnalogTimePicker: React.FC<AnalogTimePickerProps> = ({ hour, minute, onChange }) => {
    const [viewMode, setViewMode] = useState<'hour' | 'minute'>('hour');
    const [clockSize, setClockSize] = useState(250); // Default size

    // 24h -> 12h conversion
    const isPm = hour >= 12;
    const displayHour = hour % 12 === 0 ? 12 : hour % 12;

    // Calculate angles
    const hourAngle = (displayHour * 30) - 90; // 360 / 12 = 30
    const minuteAngle = (minute * 6) - 90; // 360 / 60 = 6

    const handleClockLayout = (event: LayoutChangeEvent) => {
        const { width, height } = event.nativeEvent.layout;
        setClockSize(Math.min(width, height));
    };

    const handleAmPmToggle = (period: 'AM' | 'PM') => {
        if (period === 'AM' && isPm) {
            onChange(hour - 12, minute);
        } else if (period === 'PM' && !isPm) {
            onChange(hour + 12, minute);
        }
    };

    const handleClockPress = (x: number, y: number) => {
        const radius = clockSize / 2;
        const centerX = radius;
        const centerY = radius;

        // Relativize coordinates
        const dx = x - centerX;
        const dy = y - centerY;

        // Calculate angle in degrees
        let angle = Math.atan2(dy, dx) * (180 / Math.PI) + 90;
        if (angle < 0) angle += 360;

        if (viewMode === 'hour') {
            // Round to nearest 30 degrees (12 hours)
            const sector = Math.round(angle / 30) || 12;
            let newHour = sector === 12 ? 0 : sector;

            if (isPm) {
                newHour += 12;
            }
            // If 12 AM/PM logic edge cases:
            // 12 AM is 0, 12 PM is 12.
            // If isPm=true, sector=12 -> 12 (No change needed unless logic above was strict)
            // Correct logic for 0-23:
            // sector 12 (top) is 0 for AM, 12 for PM.
            // sector 1 (30deg) is 1 for AM, 13 for PM.

            // Simplest:
            let h = sector === 12 ? 0 : sector;
            if (isPm) h += 12;

            // Wait, if it's 12 PM, hour is 12. sector is 12. h becomes 12.
            // If it's 12 AM, hour is 0. sector is 12. h becomes 0.
            // If it's 1 PM, hour is 13. sector is 1. h becomes 13.

            onChange(h, minute);
            // Auto-switch to minute after short delay or immediately?
            // Google usually does immediate switch
            setTimeout(() => setViewMode('minute'), 300);
        } else {
            // Minute view
            // Round to nearest 6 degrees (60 minutes)
            // Or maybe 5-minute intervals for easier snapping? Let's do 1-minute precision visually but snap to touches.
            let m = Math.round(angle / 6);
            if (m === 60) m = 0;
            onChange(hour, m);
        }
    };

    // Calculate hand position
    const radius = clockSize / 2;
    const handLength = radius * 0.8;
    const currentAngle = viewMode === 'hour' ? hourAngle : minuteAngle;
    const handX = radius + handLength * Math.cos(currentAngle * Math.PI / 180);
    const handY = radius + handLength * Math.sin(currentAngle * Math.PI / 180);

    return (
        <View style={styles.container}>
            {/* Header: Time Display & AM/PM */}
            <View style={styles.header}>
                <View style={styles.timeDisplay}>
                    <TouchableOpacity
                        onPress={() => setViewMode('hour')}
                        style={[styles.timeUnit, viewMode === 'hour' && styles.timeUnitActive]}
                    >
                        <Text style={[styles.timeText, viewMode === 'hour' && styles.activeText]}>
                            {displayHour.toString().padStart(2, '0')}
                        </Text>
                    </TouchableOpacity>
                    <Text style={styles.timeSeparator}>:</Text>
                    <TouchableOpacity
                        onPress={() => setViewMode('minute')}
                        style={[styles.timeUnit, viewMode === 'minute' && styles.timeUnitActive]}
                    >
                        <Text style={[styles.timeText, viewMode === 'minute' && styles.activeText]}>
                            {minute.toString().padStart(2, '0')}
                        </Text>
                    </TouchableOpacity>
                </View>

                <View style={styles.amPmContainer}>
                    <TouchableOpacity
                        style={[styles.amPmButton, !isPm && styles.amPmActive]}
                        onPress={() => handleAmPmToggle('AM')}
                    >
                        <Text style={[styles.amPmText, !isPm && styles.amPmTextActive]}>오전</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.amPmButton, isPm && styles.amPmActive]}
                        onPress={() => handleAmPmToggle('PM')}
                    >
                        <Text style={[styles.amPmText, isPm && styles.amPmTextActive]}>오후</Text>
                    </TouchableOpacity>
                </View>
            </View>

            {/* Clock Face */}
            <View
                style={[styles.clockContainer, { width: clockSize, height: clockSize }]}
                onLayout={handleClockLayout}
                onStartShouldSetResponder={() => true}
                onResponderRelease={(e) => handleClockPress(e.nativeEvent.locationX, e.nativeEvent.locationY)}
            >
                <Svg height={clockSize} width={clockSize} viewBox={`0 0 ${clockSize} ${clockSize}`}>
                    {/* Background */}
                    <Circle cx={radius} cy={radius} r={radius} fill="#333355" />

                    {/* Hand */}
                    <Line
                        x1={radius}
                        y1={radius}
                        x2={handX}
                        y2={handY}
                        stroke="#5B7FBF"
                        strokeWidth="2"
                    />
                    <Circle cx={radius} cy={radius} r="4" fill="#5B7FBF" />
                    <Circle cx={handX} cy={handY} r={viewMode === 'hour' ? 16 : 8} fill="#5B7FBF" />

                    {/* Numbers */}
                    {viewMode === 'hour' ? (
                        // Hour Numbers (1-12)
                        Array.from({ length: 12 }, (_, i) => {
                            const val = i === 0 ? 12 : i;
                            const a = (val * 30 - 90) * (Math.PI / 180);
                            const numRadius = radius * 0.8;
                            const x = radius + numRadius * Math.cos(a);
                            const y = radius + numRadius * Math.sin(a);
                            const isSelected = displayHour === val;

                            return (
                                <G key={i}>
                                    <SvgText
                                        x={x}
                                        y={y}
                                        fill={isSelected ? "#fff" : "#aeaeae"}
                                        fontSize="16"
                                        fontWeight="bold"
                                        textAnchor="middle"
                                        alignmentBaseline="middle"
                                    >
                                        {val}
                                    </SvgText>
                                </G>
                            );
                        })
                    ) : (
                        // Minute Numbers (0, 5, ..., 55)
                        Array.from({ length: 12 }, (_, i) => {
                            const val = i * 5;
                            const a = (val * 6 - 90) * (Math.PI / 180);
                            const numRadius = radius * 0.8;
                            const x = radius + numRadius * Math.cos(a);
                            const y = radius + numRadius * Math.sin(a);
                            const isSelected = Math.abs(minute - val) < 3; // Highlight near

                            return (
                                <G key={i}>
                                    <SvgText
                                        x={x}
                                        y={y}
                                        fill={isSelected ? "#fff" : "#aeaeae"}
                                        fontSize="14"
                                        textAnchor="middle"
                                        alignmentBaseline="middle"
                                    >
                                        {val.toString().padStart(2, '0')}
                                    </SvgText>
                                </G>
                            );
                        })
                    )}
                </Svg>
            </View>
            <Text style={styles.hintText}>
                {viewMode === 'hour' ? '시를 선택하세요' : '분을 선택하세요'}
            </Text>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        alignItems: 'center',
        padding: 20,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        width: '100%',
        marginBottom: 30,
        paddingHorizontal: 20,
    },
    timeDisplay: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    timeUnit: {
        padding: 10,
        borderRadius: 8,
        backgroundColor: '#2b2b40',
    },
    timeUnitActive: {
        backgroundColor: '#3a3a5e',
    },
    timeText: {
        fontSize: 48,
        fontFamily: 'Pretendard-Bold',
        color: '#888',
    },
    activeText: {
        color: '#8CA6DB',
    },
    timeSeparator: {
        fontSize: 48,
        fontFamily: 'Pretendard-Bold',
        color: '#fff',
        marginHorizontal: 10,
        marginBottom: 8,
    },
    amPmContainer: {
        flexDirection: 'column',
        gap: 8,
    },
    amPmButton: {
        paddingVertical: 8,
        paddingHorizontal: 16,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: '#3a3a5e',
    },
    amPmActive: {
        backgroundColor: '#5B7FBF',
        borderColor: '#5B7FBF',
    },
    amPmText: {
        fontFamily: 'Pretendard-Medium',
        color: '#888',
        fontSize: 14,
    },
    amPmTextActive: {
        color: '#fff',
    },
    clockContainer: {
        width: 250,
        height: 250,
        alignItems: 'center',
        justifyContent: 'center',
    },
    hintText: {
        marginTop: 20,
        color: '#666',
        fontFamily: 'Pretendard-Regular',
    },
});

export default AnalogTimePicker;
