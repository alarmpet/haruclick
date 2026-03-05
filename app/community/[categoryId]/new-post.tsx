import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TextInput,
    TouchableOpacity,
    KeyboardAvoidingView,
    Platform,
    ActivityIndicator,
    Alert,
    Keyboard,
    TouchableWithoutFeedback
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { Colors } from '../../../constants/Colors';
import { supabase } from '../../../services/supabase-modules/client';
import { createChannelPost } from '../../../services/supabase-modules/channel-posts';
import { showError } from '../../../services/errorHandler';

const MAX_LENGTH = 2000;

export default function NewPostScreen() {
    const { categoryId } = useLocalSearchParams<{ categoryId: string }>();
    const router = useRouter();

    const [content, setContent] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [checkingUser, setCheckingUser] = useState(true);

    useEffect(() => {
        checkUserNickname();
    }, []);

    const checkUserNickname = async () => {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
                showError('로그인이 필요합니다.');
                router.back();
                return;
            }

            const displayName = user.user_metadata?.display_name;
            if (!displayName) {
                Alert.alert(
                    '닉네임 설정 필요',
                    '커뮤니티 활동을 위해 닉네임 설정이 필요합니다.\n설정 화면으로 이동하시겠습니까?',
                    [
                        { text: '취소', style: 'cancel', onPress: () => router.back() },
                        {
                            text: '이동',
                            onPress: () => {
                                router.back();
                                // 설정의 프로필 화면으로 이동
                                router.push('/settings/profile');
                            }
                        }
                    ]
                );
            }
        } catch (error) {
            console.error('Failed to check user:', error);
        } finally {
            setCheckingUser(false);
        }
    };

    const handleSubmit = async () => {
        if (!content.trim()) {
            showError('내용을 입력해주세요.');
            return;
        }

        setSubmitting(true);
        const post = await createChannelPost(categoryId, content.trim());
        setSubmitting(false);

        if (post) {
            router.back();
            // TODO: In a real app, we might need a way to refresh the previous screen's list. 
            // Expo router doesn't have a simple push-to-refresh without params, but the user can pull-to-refresh.
        }
    };

    if (checkingUser) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={Colors.navy} />
            </View>
        );
    }

    return (
        <KeyboardAvoidingView
            style={styles.container}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
            <Stack.Screen
                options={{
                    title: '새 글 쓰기',
                    presentation: 'modal',
                    headerLeft: () => (
                        <TouchableOpacity onPress={() => router.back()} style={styles.headerButton}>
                            <Text style={styles.headerButtonText}>취소</Text>
                        </TouchableOpacity>
                    ),
                    headerRight: () => (
                        <TouchableOpacity
                            onPress={handleSubmit}
                            style={[
                                styles.headerButton,
                                styles.submitButton,
                                (!content.trim() || submitting) && styles.submitButtonDisabled
                            ]}
                            disabled={!content.trim() || submitting}
                        >
                            {submitting ? (
                                <ActivityIndicator size="small" color={Colors.white} />
                            ) : (
                                <Text style={styles.submitText}>등록</Text>
                            )}
                        </TouchableOpacity>
                    )
                }}
            />

            <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
                <View style={styles.inner}>
                    <TextInput
                        style={styles.input}
                        placeholder="이 채널에 일정이나 정보를 공유해보세요..."
                        placeholderTextColor={Colors.subText}
                        multiline
                        maxLength={MAX_LENGTH}
                        value={content}
                        onChangeText={setContent}
                        autoFocus
                        textAlignVertical="top"
                    />
                    <View style={styles.footer}>
                        <Text style={styles.lengthText}>
                            {content.length} / {MAX_LENGTH}
                        </Text>
                    </View>
                </View>
            </TouchableWithoutFeedback>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.white,
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: Colors.white,
    },
    headerButton: {
        paddingHorizontal: 16,
        paddingVertical: 8,
    },
    headerButtonText: {
        fontSize: 16,
        fontFamily: 'Pretendard-Medium',
        color: Colors.subText,
    },
    submitButton: {
        backgroundColor: Colors.navy,
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 20,
        marginRight: 8,
        justifyContent: 'center',
        alignItems: 'center',
        minWidth: 60,
    },
    submitButtonDisabled: {
        backgroundColor: Colors.border,
    },
    submitText: {
        color: Colors.white,
        fontFamily: 'Pretendard-Bold',
        fontSize: 14,
    },
    inner: {
        flex: 1,
        padding: 20,
    },
    input: {
        flex: 1,
        fontSize: 16,
        fontFamily: 'Pretendard-Medium',
        color: Colors.text,
        lineHeight: 24,
    },
    footer: {
        borderTopWidth: 1,
        borderTopColor: Colors.border,
        paddingVertical: 12,
        alignItems: 'flex-end',
    },
    lengthText: {
        fontSize: 13,
        fontFamily: 'Pretendard-Medium',
        color: Colors.subText,
    },
});
