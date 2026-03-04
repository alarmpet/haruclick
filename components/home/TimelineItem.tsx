import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Colors } from '../../constants/Colors';
import { getEventEmoji } from '../../services/EmojiService';
import { useTheme } from '../../contexts/ThemeContext';
import type { EventRecord } from '../../services/supabase';

interface TimelineItemProps {
    event: EventRecord;
}

export const TimelineItem = React.memo(({ event }: TimelineItemProps) => {
    const router = useRouter();
    const { colors, isDark } = useTheme();

    const handlePress = () => {
        router.push({ pathname: '/calendar', params: { date: event.date?.split('T')[0] } });
    };

    return (
        <TouchableOpacity
            style={[
                styles.timelineItem,
                event.source === 'events' && { backgroundColor: isDark ? 'rgba(255, 126, 54, 0.1)' : '#FFF7ED' }
            ]}
            onPress={handlePress}
            activeOpacity={0.7}
        >
            {event.source === 'events' ? (
                <View style={[styles.timelineIconContainer, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0,0,0,0.05)' }]}>
                    <Text style={{ fontSize: 12 }}>
                        {getEventEmoji(event)}
                    </Text>
                </View>
            ) : (
                <View style={[styles.timelineDot, event.isReceived ? { backgroundColor: colors.success } : { backgroundColor: colors.danger }]} />
            )}
            <Text
                style={[
                    styles.timelineName,
                    { color: colors.text },
                    event.source === 'events' && { color: colors.orange, fontFamily: 'Pretendard-Bold' }
                ]}
                numberOfLines={1}
            >
                {event.name || '내역'}
                {event.source === 'events' && event.location && (
                    <Text style={{ color: colors.subText, fontFamily: 'Pretendard-Medium' }}>
                        {' / '}{event.location}
                    </Text>
                )}
            </Text>
            {event.amount && event.amount > 0 ? (
                <Text style={[styles.timelineAmount, event.isReceived ? { color: colors.success } : { color: colors.danger }]}>
                    {event.isReceived ? '+' : '-'}{event.amount.toLocaleString()}
                </Text>
            ) : (
                event.source === 'events' && (
                    <Text style={[styles.timelineTime, { color: colors.subText }]}>
                        {event.startTime ? event.startTime.substring(0, 5) : '하루 종일'}
                    </Text>
                )
            )}
        </TouchableOpacity>
    );
});

TimelineItem.displayName = 'TimelineItem';

const styles = StyleSheet.create({
    timelineItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 10,
    },
    timelineIconContainer: {
        width: 24,
        height: 24,
        borderRadius: 12,
        backgroundColor: 'rgba(255, 255, 255, 0.2)',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 10,
    },
    timelineDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        marginRight: 12,
    },
    timelineName: {
        flex: 1,
        fontFamily: 'Pretendard-Medium',
        fontSize: 14,
    },
    timelineAmount: {
        fontFamily: 'Pretendard-Bold',
        fontSize: 14,
    },
    timelineTime: {
        fontFamily: 'Pretendard-Medium',
        fontSize: 13,
        color: Colors.subText,
    },
});
