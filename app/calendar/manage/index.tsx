import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, RefreshControl, Pressable } from 'react-native';
import { Stack, useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../../constants/Colors';
import { Calendar, getMyCalendars } from '../../../services/supabase-modules/calendars';

export default function CalendarManageScreen() {
    const router = useRouter();
    const [calendars, setCalendars] = useState<Calendar[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const loadCalendars = async () => {
        try {
            const data = await getMyCalendars();
            setCalendars(data);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    useFocusEffect(
        useCallback(() => {
            loadCalendars();
        }, [])
    );

    const onRefresh = () => {
        setRefreshing(true);
        loadCalendars();
    };

    const renderItem = ({ item }: { item: Calendar }) => (
        <TouchableOpacity
            testID={`calendar-manage-item-${item.id}`}
            style={styles.itemContainer}
            onPress={() => router.push(`/calendar/manage/${item.id}`)}
        >
            <View style={styles.itemLeft}>
                <View style={[styles.colorDot, { backgroundColor: item.color || Colors.primary }]} />
                <View style={styles.textContainer}>
                    <Text style={styles.itemName}>{item.name}</Text>
                    {item.is_personal && <Text style={styles.personalBadge}>개인 캘린더</Text>}
                </View>
            </View>

            <View style={styles.itemRight}>
                <View style={[styles.roleBadge, { backgroundColor: item.role === 'owner' ? '#DBEAFE' : '#E0F2FE' }]}>
                    <Text style={[styles.roleText, { color: item.role === 'owner' ? '#1E40AF' : '#0369A1' }]}>
                        {item.role === 'owner' ? '소유자' : item.role === 'editor' ? '편집자' : '뷰어'}
                    </Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={Colors.subText} style={{ marginLeft: 8 }} />
            </View>
        </TouchableOpacity>
    );

    return (
        <View style={styles.container}>
            <Stack.Screen
                options={{
                    title: '캘린더 관리',
                    headerStyle: { backgroundColor: Colors.white },
                    headerShadowVisible: false,
                    headerTintColor: Colors.navy,
                    headerRight: () => (
                        <View style={{ flexDirection: 'row', gap: 16 }}>
                            <Pressable
                                testID="calendar-manage-join-button"
                                onPress={() => router.push('/calendar/manage/join')}
                                hitSlop={10}
                            >
                                <Ionicons name="enter-outline" size={24} color={Colors.navy} />
                            </Pressable>
                            <Pressable
                                testID="calendar-manage-create-button"
                                onPress={() => router.push('/calendar/manage/create')}
                                hitSlop={10}
                            >
                                <Ionicons name="add" size={24} color={Colors.navy} />
                            </Pressable>
                        </View>
                    )
                }}
            />

            {loading ? (
                <View style={styles.center}>
                    <ActivityIndicator size="large" color={Colors.primary} />
                </View>
            ) : (
                <FlatList
                    data={calendars}
                    renderItem={renderItem}
                    keyExtractor={item => item.id}
                    contentContainerStyle={styles.listContent}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
                    ListEmptyComponent={
                        <View style={styles.center}>
                            <Text style={styles.emptyText}>캘린더가 없습니다.</Text>
                        </View>
                    }
                />
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.background,
    },
    listContent: {
        padding: 20,
    },
    center: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 40,
    },
    emptyText: {
        fontSize: 16,
        color: Colors.subText,
        textAlign: 'center',
    },
    itemContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: Colors.white,
        padding: 16,
        borderRadius: 16,
        marginBottom: 12,
        shadowColor: Colors.shadow,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
        elevation: 2,
    },
    itemLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
    },
    colorDot: {
        width: 12,
        height: 12,
        borderRadius: 6,
        marginRight: 12,
    },
    textContainer: {
        justifyContent: 'center',
    },
    itemName: {
        fontSize: 16,
        fontWeight: '600',
        color: Colors.text,
    },
    personalBadge: {
        fontSize: 11,
        color: Colors.subText,
        marginTop: 2,
    },
    itemRight: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    roleBadge: {
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 6,
    },
    roleText: {
        fontSize: 11,
        fontWeight: '600',
    },
});
