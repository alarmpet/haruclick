import { View, Text, StyleSheet, TouchableOpacity, Alert, TextInput } from 'react-native';
import { useState } from 'react';
import { useRouter, Stack } from 'expo-router';
import { resendVerificationEmail } from '../../services/authService';
import { Colors } from '../../constants/Colors';
import Ionicons from '@expo/vector-icons/Ionicons';

export default function VerifyEmailScreen() {
    const router = useRouter();
    const [email, setEmail] = useState('');
    const [loading, setLoading] = useState(false);

    const handleResend = async () => {
        if (!email) {
            Alert.alert('알림', '이메일을 입력해주세요.');
            return;
        }

        setLoading(true);
        const result = await resendVerificationEmail(email);
        setLoading(false);

        if (result.success) {
            Alert.alert('발송 완료', `${email}로 인증 메일이 재전송되었습니다.`);
        } else {
            Alert.alert('오류', result.error ?? '재전송 실패');
        }
    };

    return (
        <View style={styles.container}>
            <Stack.Screen
                options={{
                    headerShown: true,
                    title: '이메일 인증',
                    headerStyle: { backgroundColor: Colors.darkBackground },
                    headerTintColor: Colors.white,
                    headerLeft: () => (
                        <TouchableOpacity onPress={() => router.back()}>
                            <Ionicons name="arrow-back" size={24} color={Colors.white} />
                        </TouchableOpacity>
                    ),
                }}
            />

            <View style={styles.content}>
                <Ionicons name="mail-outline" size={64} color={Colors.primaryGreen} />
                <Text style={styles.title}>이메일을 확인해주세요</Text>
                <Text style={styles.description}>
                    가입하신 이메일로 인증 메일이 발송되었습니다.{'\n'}
                    이메일의 링크를 클릭하여 인증을 완료해주세요.
                </Text>

                <View style={styles.inputContainer}>
                    <TextInput
                        style={styles.input}
                        placeholder="이메일 주소"
                        placeholderTextColor={Colors.subText}
                        value={email}
                        onChangeText={setEmail}
                        autoCapitalize="none"
                        keyboardType="email-address"
                    />
                </View>

                <TouchableOpacity
                    style={[styles.resendButton, loading && styles.buttonDisabled]}
                    onPress={handleResend}
                    disabled={loading}
                >
                    <Text style={styles.resendButtonText}>
                        {loading ? '재전송 중...' : '인증 메일 재전송'}
                    </Text>
                </TouchableOpacity>

                <TouchableOpacity
                    style={styles.loginLink}
                    onPress={() => router.replace('/auth/login')}
                >
                    <Text style={styles.loginLinkText}>로그인 화면으로</Text>
                </TouchableOpacity>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.darkBackground,
    },
    content: {
        flex: 1,
        padding: 24,
        alignItems: 'center',
        justifyContent: 'center',
    },
    title: {
        fontFamily: 'Pretendard-Bold',
        fontSize: 24,
        color: Colors.white,
        marginTop: 24,
        marginBottom: 12,
    },
    description: {
        fontFamily: 'Pretendard-Medium',
        fontSize: 15,
        color: Colors.subText,
        textAlign: 'center',
        lineHeight: 22,
        marginBottom: 40,
    },
    inputContainer: {
        width: '100%',
        backgroundColor: Colors.darkCard,
        borderRadius: 12,
        paddingHorizontal: 16,
        paddingVertical: 14,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: Colors.darkBorder,
    },
    input: {
        flex: 1,
        fontFamily: 'Pretendard-Medium',
        fontSize: 16,
        color: Colors.white,
    },
    resendButton: {
        width: '100%',
        backgroundColor: Colors.primaryGreen,
        paddingVertical: 16,
        borderRadius: 12,
        alignItems: 'center',
    },
    buttonDisabled: {
        opacity: 0.6,
    },
    resendButtonText: {
        fontFamily: 'Pretendard-SemiBold',
        fontSize: 16,
        color: Colors.darkBackground,
    },
    loginLink: {
        marginTop: 24,
    },
    loginLinkText: {
        fontFamily: 'Pretendard-Medium',
        fontSize: 14,
        color: Colors.subText,
    },
});
