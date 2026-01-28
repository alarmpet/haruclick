import React, { useState } from 'react';
import { View, Text, StyleSheet, Modal, TextInput, TouchableOpacity, Alert, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/Colors'; // Direct import since we might not have ThemeContext fully everywhere yet, or can use useTheme
import { useTheme } from '../contexts/ThemeContext';
import { supabase } from '../services/supabase';

interface OcrContext {
    rawText?: string;
    classifiedType?: string;
    classifiedData?: any;
}

interface VoiceContext {
    rawText?: string;
    classifiedType?: string;
    classifiedData?: any;
    source?: string;
}

interface FeedbackModalProps {
    visible: boolean;
    onClose: () => void;
    ocrContext?: OcrContext; // OCR 결과 화면에서 전달되는 컨텍스트
    voiceContext?: VoiceContext; // Voice ??? ?????? ?????? ??????
}

type FeedbackType = 'bug' | 'feature' | 'ocr' | 'voice' | 'other';

export function FeedbackModal({ visible, onClose, ocrContext, voiceContext }: FeedbackModalProps) {
    const { colors, isDark } = useTheme();
    const [type, setType] = useState<FeedbackType>(voiceContext ? 'voice' : ocrContext ? 'ocr' : 'feature');
    const [content, setContent] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async () => {
        if (!content.trim()) {
            Alert.alert('알림', '내용을 입력해주세요.');
            return;
        }

        setLoading(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();

            const { error } = await supabase
                .from('feedbacks')
                .insert({
                    user_id: user?.id,
                    type,
                    content,
                    metadata: voiceContext ? JSON.stringify(voiceContext) : ocrContext ? JSON.stringify(ocrContext) : null
                });

            if (error) throw error;

            Alert.alert('성공', '소중한 의견 감사합니다! 🙇‍♂️');
            setContent('');
            onClose();
        } catch (e: any) {
            Alert.alert('오류', '의견 전송 중 문제가 발생했습니다.');
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const TypeButton = ({ label, value }: { label: string, value: FeedbackType }) => (
        <TouchableOpacity
            style={[
                styles.typeButton,
                { borderColor: colors.border },
                type === value && { backgroundColor: colors.primary, borderColor: colors.primary }
            ]}
            onPress={() => setType(value)}
        >
            <Text style={[
                styles.typeText,
                { color: colors.subText },
                type === value && { color: colors.white, fontWeight: 'bold' }
            ]}>
                {label}
            </Text>
        </TouchableOpacity>
    );

    return (
        <Modal
            visible={visible}
            transparent
            animationType="slide"
            onRequestClose={onClose}
        >
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                style={styles.container}
            >
                <View style={[styles.content, { backgroundColor: colors.background }]}>
                    <View style={styles.header}>
                        <Text style={[styles.title, { color: colors.text }]}>의견 보내기</Text>
                        <TouchableOpacity onPress={onClose}>
                            <Ionicons name="close" size={24} color={colors.text} />
                        </TouchableOpacity>
                    </View>

                    <Text style={[styles.label, { color: colors.text }]}>어떤 종류의 의견인가요?</Text>
                    <View style={styles.typeContainer}>
                        {voiceContext && <TypeButton label="?? ?? ?? ??" value="voice" />}
                        {ocrContext && <TypeButton label="🔍 AI 분류 개선" value="ocr" />}
                        <TypeButton label="✨ 기능 제안" value="feature" />
                        <TypeButton label="🐛 버그 신고" value="bug" />
                        <TypeButton label="💬 기타" value="other" />
                    </View>

                    <Text style={[styles.label, { color: colors.text }]}>내용</Text>
                    <TextInput
                        style={[styles.input, { backgroundColor: colors.card, color: colors.text, borderColor: colors.border }]}
                        multiline
                        placeholder={voiceContext ? "?? ??? ?? ?????? (?: ??/??/??)" : ocrContext ? "어떻게 분류되어야 하나요? (예: 이건 보험료 납부인데 입금으로 분류됐어요)" : "자유롭게 의견을 남겨주세요."}
                        placeholderTextColor={colors.subText}
                        value={content}
                        onChangeText={setContent}
                        textAlignVertical="top"
                    />

                    <TouchableOpacity
                        style={[styles.submitButton, { backgroundColor: colors.primary }, loading && { opacity: 0.7 }]}
                        onPress={handleSubmit}
                        disabled={loading}
                    >
                        {loading ? (
                            <ActivityIndicator color="white" />
                        ) : (
                            <Text style={styles.submitText}>보내기</Text>
                        )}
                    </TouchableOpacity>
                </View>
            </KeyboardAvoidingView>
        </Modal>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'flex-end',
        backgroundColor: 'rgba(0,0,0,0.5)',
    },
    content: {
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        padding: 24,
        paddingBottom: 40,
        minHeight: 400,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 24,
    },
    title: {
        fontFamily: 'Pretendard-Bold',
        fontSize: 20,
    },
    label: {
        fontFamily: 'Pretendard-Medium',
        fontSize: 16,
        marginBottom: 12,
        marginTop: 12,
    },
    typeContainer: {
        flexDirection: 'row',
        gap: 8,
        marginBottom: 12,
    },
    typeButton: {
        paddingVertical: 8,
        paddingHorizontal: 16,
        borderRadius: 20,
        borderWidth: 1,
    },
    typeText: {
        fontSize: 14,
        fontFamily: 'Pretendard-Medium',
    },
    input: {
        height: 120,
        borderRadius: 12,
        padding: 16,
        fontSize: 16,
        borderWidth: 1,
    },
    submitButton: {
        marginTop: 24,
        borderRadius: 12,
        paddingVertical: 16,
        alignItems: 'center',
    },
    submitText: {
        color: 'white',
        fontFamily: 'Pretendard-Bold',
        fontSize: 16,
    },
});
