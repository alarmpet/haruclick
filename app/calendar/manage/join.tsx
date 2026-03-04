import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Colors } from '../../../constants/Colors';
import { joinCalendarByCode } from '../../../services/supabase-modules/calendars';
import { Ionicons } from '@expo/vector-icons';

export default function JoinCalendarScreen() {
    const router = useRouter();
    const [code, setCode] = useState('');
    const [joining, setJoining] = useState(false);

    const handleJoin = async () => {
        if (!code.trim() || code.trim().length !== 8) {
            Alert.alert('알림', '8자리 초대 코드를 입력해주세요.');
            return;
        }

        setJoining(true);
        try {
            const success = await joinCalendarByCode(code.trim().toUpperCase());
            if (success) {
                Alert.alert('성공', '캘린더에 참여했습니다.', [
                    { text: '확인', onPress: () => router.back() }
                ]);
            }
        } catch (e: any) {
            console.error(e);
            Alert.alert('오류', e.message || '캘린더 참여에 실패했습니다.');
        } finally {
            setJoining(false);
        }
    };

    return (
        <View style={styles.container}>
            <Stack.Screen
                options={{
                    title: '초대 코드로 참여',
                    headerStyle: { backgroundColor: Colors.white },
                    headerShadowVisible: false,
                    headerTintColor: Colors.navy
                }}
            />

            <View style={styles.content}>
                <View style={styles.inputContainer}>
                    <Text style={styles.label}>초대 코드 (8자리)</Text>
                    <TextInput
                        testID="join-calendar-code-input"
                        style={styles.input}
                        placeholder="ABCD1234"
                        value={code}
                        onChangeText={text => setCode(text.toUpperCase())}
                        placeholderTextColor={Colors.lightGray}
                        maxLength={8}
                        autoCapitalize="characters"
                    />
                    <Text style={styles.helperText}>
                        공유받은 8자리 초대 코드를 입력하세요.
                    </Text>
                </View>

                <TouchableOpacity
                    testID="join-calendar-submit-button"
                    style={[styles.joinButton, joining && styles.disabledButton]}
                    onPress={handleJoin}
                    disabled={joining}
                >
                    {joining ? (
                        <ActivityIndicator color="white" />
                    ) : (
                        <>
                            <Ionicons name="enter-outline" size={20} color="white" style={{ marginRight: 8 }} />
                            <Text style={styles.joinButtonText}>참여하기</Text>
                        </>
                    )}
                </TouchableOpacity>
            </View>
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
    inputContainer: {
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
        fontSize: 20,
        fontWeight: 'bold',
        textAlign: 'center',
        borderWidth: 1,
        borderColor: Colors.border,
        color: Colors.text,
        letterSpacing: 4,
    },
    helperText: {
        marginTop: 12,
        color: Colors.subText,
        fontSize: 14,
        textAlign: 'center',
    },
    joinButton: {
        flexDirection: 'row',
        backgroundColor: Colors.navy,
        padding: 18,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
    },
    disabledButton: {
        opacity: 0.7,
    },
    joinButtonText: {
        color: Colors.white,
        fontSize: 18,
        fontWeight: 'bold',
    },
});
