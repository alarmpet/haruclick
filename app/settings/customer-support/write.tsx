import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Alert, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { supabase } from '../../../services/supabase';
import { Colors } from '../../../constants/Colors';
import { Ionicons } from '@expo/vector-icons';

export default function WriteInquiryScreen() {
    const router = useRouter();
    const [title, setTitle] = useState('');
    const [content, setContent] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const handleSubmit = async () => {
        if (!title.trim() || !content.trim()) {
            Alert.alert('알림', '제목과 내용을 모두 입력해주세요.');
            return;
        }

        setSubmitting(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error('Not authenticated');

            const { error } = await supabase.from('inquiries').insert({
                user_id: user.id,
                title: title.trim(),
                content: content.trim(),
                status: 'pending' // redundant but safe
            });

            if (error) throw error;

            Alert.alert('완료', '문의가 등록되었습니다.', [
                { text: '확인', onPress: () => router.back() }
            ]);
        } catch (e: any) {
            console.error(e);
            Alert.alert('오류', '문의 등록에 실패했습니다.');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <KeyboardAvoidingView
            style={styles.container}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 100 : 0}
        >
            <Stack.Screen options={{ title: '문의하기' }} />

            <ScrollView contentContainerStyle={styles.scrollContent}>
                <View style={styles.formGroup}>
                    <Text style={styles.label}>제목</Text>
                    <TextInput
                        style={styles.input}
                        placeholder="문의 제목을 입력해주세요"
                        value={title}
                        onChangeText={setTitle}
                        maxLength={50}
                    />
                </View>

                <View style={[styles.formGroup, { flex: 1 }]}>
                    <Text style={styles.label}>내용</Text>
                    <TextInput
                        style={[styles.input, styles.textArea]}
                        placeholder="궁금한 내용을 자세히 적어주세요."
                        value={content}
                        onChangeText={setContent}
                        multiline
                        textAlignVertical="top"
                    />
                </View>

                <TouchableOpacity
                    style={[styles.submitButton, submitting && styles.disabledButton]}
                    onPress={handleSubmit}
                    disabled={submitting}
                >
                    <Text style={styles.submitButtonText}>{submitting ? '등록 중...' : '문의 등록하기'}</Text>
                </TouchableOpacity>
            </ScrollView>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#fff',
    },
    scrollContent: {
        flexGrow: 1,
        padding: 20,
    },
    formGroup: {
        marginBottom: 24,
    },
    label: {
        fontSize: 14,
        fontWeight: 'bold',
        color: '#333',
        marginBottom: 8,
    },
    input: {
        backgroundColor: '#f9f9f9',
        borderWidth: 1,
        borderColor: '#eee',
        borderRadius: 8,
        paddingHorizontal: 16,
        paddingVertical: 12,
        fontSize: 15,
        color: '#333',
    },
    textArea: {
        minHeight: 200,
        height: 200, // Fixed height for consistency
    },
    submitButton: {
        backgroundColor: Colors.primary,
        paddingVertical: 16,
        borderRadius: 12,
        alignItems: 'center',
        marginTop: 'auto', // push to bottom
    },
    disabledButton: {
        opacity: 0.7,
    },
    submitButtonText: {
        color: 'white',
        fontSize: 16,
        fontWeight: 'bold',
    },
});
