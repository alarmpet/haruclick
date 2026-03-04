import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Alert, ActivityIndicator, ScrollView } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Colors } from '../../../constants/Colors';
import { createCalendar } from '../../../services/supabase-modules/calendars';

const PALETTE = [
    '#8B5CF6', // Purple (Default)
    '#3B82F6', // Blue
    '#10B981', // Green
    '#F59E0B', // Yellow
    '#EF4444', // Red
    '#EC4899', // Pink
    '#6366F1', // Indigo
    '#14B8A6', // Teal
    '#F97316', // Orange
    '#64748B', // Slate
];

export default function CreateCalendarScreen() {
    const router = useRouter();
    const [name, setName] = useState('');
    const [selectedColor, setSelectedColor] = useState(PALETTE[0]);
    const [submitting, setSubmitting] = useState(false);

    const handleCreate = async () => {
        if (!name.trim()) {
            Alert.alert('알림', '캘린더 이름을 입력해주세요.');
            return;
        }

        setSubmitting(true);
        try {
            const result = await createCalendar(name.trim(), selectedColor, false); // Always create shared/normal calendar
            if (result) {
                Alert.alert('성공', '캘린더가 생성되었습니다.', [
                    { text: '확인', onPress: () => router.back() }
                ]);
            }
        } catch (e) {
            console.error(e);
            Alert.alert('오류', '캘린더 생성 중 문제가 발생했습니다.');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <View style={styles.container}>
            <Stack.Screen
                options={{
                    title: '새 캘린더 만들기',
                    headerStyle: { backgroundColor: Colors.white },
                    headerShadowVisible: false,
                    headerTintColor: Colors.navy
                }}
            />

            <ScrollView contentContainerStyle={styles.content}>
                <View style={styles.section}>
                    <Text style={styles.label}>캘린더 이름</Text>
                    <TextInput
                        testID="create-calendar-name-input"
                        style={styles.input}
                        placeholder="예: 가족 캘린더, 커플 캘린더"
                        value={name}
                        onChangeText={setName}
                        placeholderTextColor={Colors.lightGray}
                    />
                </View>

                <View style={styles.section}>
                    <Text style={styles.label}>색상 선택</Text>
                    <View style={styles.paletteContainer}>
                        {PALETTE.map(color => (
                            <TouchableOpacity
                                key={color}
                                style={[
                                    styles.colorOption,
                                    { backgroundColor: color },
                                    selectedColor === color && styles.selectedColor
                                ]}
                                onPress={() => setSelectedColor(color)}
                            >
                                {selectedColor === color && (
                                    <View style={styles.checkDot} />
                                )}
                            </TouchableOpacity>
                        ))}
                    </View>
                </View>

                <TouchableOpacity
                    testID="create-calendar-submit-button"
                    style={[styles.createButton, submitting && styles.disabledButton]}
                    onPress={handleCreate}
                    disabled={submitting}
                >
                    {submitting ? (
                        <ActivityIndicator color="white" />
                    ) : (
                        <Text style={styles.createButtonText}>만들기</Text>
                    )}
                </TouchableOpacity>
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.background,
    },
    content: {
        padding: 24,
    },
    section: {
        marginBottom: 32,
    },
    label: {
        fontSize: 16,
        fontWeight: '600',
        color: Colors.text,
        marginBottom: 12,
    },
    input: {
        backgroundColor: Colors.white,
        padding: 16,
        borderRadius: 12,
        fontSize: 16,
        borderWidth: 1,
        borderColor: Colors.border,
        color: Colors.text,
    },
    paletteContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 16,
    },
    colorOption: {
        width: 48,
        height: 48,
        borderRadius: 24,
        justifyContent: 'center',
        alignItems: 'center',
    },
    selectedColor: {
        borderWidth: 3,
        borderColor: Colors.white,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 4,
        elevation: 4,
        width: 52, // Slightly larger when selected
        height: 52,
        margin: -2, // Offset visual growth
    },
    checkDot: {
        width: 12,
        height: 12,
        borderRadius: 6,
        backgroundColor: 'white',
    },
    createButton: {
        backgroundColor: Colors.navy,
        padding: 18,
        borderRadius: 16,
        alignItems: 'center',
        marginTop: 20,
    },
    disabledButton: {
        opacity: 0.7,
    },
    createButtonText: {
        color: Colors.white,
        fontSize: 18,
        fontWeight: 'bold',
    },
});
