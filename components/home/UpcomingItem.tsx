import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Colors } from '../../constants/Colors';
import { getEventEmoji } from '../../services/EmojiService';
import { useTheme } from '../../contexts/ThemeContext';
import type { EventRecord } from '../../services/supabase';

interface UpcomingItemProps {
    event: EventRecord;
    dDay: string;
}

export const UpcomingItem = React.memo(({ event, dDay }: UpcomingItemProps) => {
    const router = useRouter();
    const { colors } = useTheme();

    const handlePress = () => {
        router.push({ pathname: '/calendar', params: { date: event.date.split('T')[0] } });
    };

    return (
        <TouchableOpacity
            style={[styles.upcomingItem, { borderBottomColor: colors.border }]}
            onPress={handlePress}
            activeOpacity={0.7}
        >
            <View style={styles.upcomingLeft}>
                <Text style={styles.upcomingType}>{getEventEmoji(event)}</Text>
                <View>
                    <Text style={[styles.upcomingName, { color: colors.text }]}>{event.name || '일정'}</Text>
                    <Text style={[styles.upcomingDate, { color: colors.subText }]}>
                        {event.date?.split('T')[0]}{event.relation ? ` · ${event.relation} ` : ''}
                    </Text>
                </View>
            </View>
            <Text style={[styles.upcomingDDay, dDay === 'D-Day' && { color: colors.orange }]}>{dDay}</Text>
        </TouchableOpacity>
    );
});

UpcomingItem.displayName = 'UpcomingItem';

const styles = StyleSheet.create({
    upcomingItem: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.05)',
    },
    upcomingLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
    },
    upcomingType: {
        fontSize: 24,
        marginRight: 12,
    },
    upcomingName: {
        fontFamily: 'Pretendard-Bold',
        fontSize: 15,
        color: Colors.white,
        marginBottom: 2,
    },
    upcomingDate: {
        fontFamily: 'Pretendard-Regular',
        fontSize: 13,
        color: Colors.subText,
    },
    upcomingDDay: {
        fontFamily: 'Pretendard-Bold',
        fontSize: 14,
        color: Colors.subText,
    },
});
