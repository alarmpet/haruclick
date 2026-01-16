import { View, Text, StyleSheet, TextInput, TouchableOpacity, Alert, ScrollView, StatusBar } from 'react-native';
import { useState, useMemo } from 'react';
import { useRouter, Stack, Link } from 'expo-router';
import { supabase } from '../../services/supabase';
import { Colors } from '../../constants/Colors';
import Ionicons from '@expo/vector-icons/Ionicons';

// Password Validation Helper
const validatePassword = (password: string, confirmPassword: string) => {
    const hasMinLength = password.length >= 8 && password.length <= 64;
    const hasUppercase = /[A-Z]/.test(password);
    const hasLowercase = /[a-z]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    const hasSpecial = /[!@#$%^&*(),.?":{}|<>]/.test(password);
    const typeCount = [hasUppercase, hasLowercase, hasNumber, hasSpecial].filter(Boolean).length;
    const hasTwoTypes = typeCount >= 2;
    const passwordsMatch = password.length > 0 && password === confirmPassword;

    let securityLevel: 'low' | 'medium' | 'high' = 'low';
    if (hasMinLength && typeCount >= 3) securityLevel = 'high';
    else if (hasMinLength && typeCount >= 2) securityLevel = 'medium';

    return { hasMinLength, hasTwoTypes, securityLevel, passwordsMatch, typeCount };
};

export default function SignupScreen() {
    const router = useRouter();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);

    const validation = useMemo(() => validatePassword(password, confirmPassword), [password, confirmPassword]);

    const handleSignup = async () => {
        if (!email || !password || !confirmPassword) {
            Alert.alert('알림', '모든 필드를 입력해주세요.');
            return;
        }

        if (!validation.hasMinLength) {
            Alert.alert('알림', '비밀번호는 8~64자여야 합니다.');
            return;
        }

        if (!validation.hasTwoTypes) {
            Alert.alert('알림', '비밀번호는 영어 대문자, 소문자, 숫자, 특수문자 중 2종류 이상 조합해야 합니다.');
            return;
        }

        if (!validation.passwordsMatch) {
            Alert.alert('알림', '비밀번호가 일치하지 않습니다.');
            return;
        }

        setLoading(true);
        const { error } = await supabase.auth.signUp({ email, password });

        if (error) {
            Alert.alert('회원가입 실패', error.message);
        } else {
            Alert.alert('회원가입 성공', '회원가입이 완료되었습니다. 로그인해주세요.', [
                { text: '확인', onPress: () => router.replace('/auth/login') }
            ]);
        }
        setLoading(false);
    };

    const securityLevelText = {
        low: { text: '안정성 낮음', color: Colors.red },
        medium: { text: '안정성 보통', color: Colors.orange },
        high: { text: '안정성 높음', color: Colors.primaryGreen },
    };

    return (
        <View style={styles.container}>
            <StatusBar barStyle="light-content" backgroundColor={Colors.darkBackground} />
            <Stack.Screen
                options={{
                    headerShown: true,
                    title: '',
                    headerStyle: { backgroundColor: Colors.darkBackground },
                    headerTintColor: Colors.white,
                    headerLeft: () => (
                        <TouchableOpacity onPress={() => router.back()}>
                            <Ionicons name="close" size={24} color={Colors.white} />
                        </TouchableOpacity>
                    ),
                    headerRight: () => (
                        <TouchableOpacity onPress={() => router.replace('/')}>
                            <Text style={styles.laterText}>나중에</Text>
                        </TouchableOpacity>
                    ),
                }}
            />

            <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
                <Text style={styles.title}>계정 등록</Text>

                {/* Email Input */}
                <View style={styles.inputContainer}>
                    <TextInput
                        style={styles.input}
                        placeholder="이메일"
                        placeholderTextColor={Colors.subText}
                        value={email}
                        onChangeText={setEmail}
                        autoCapitalize="none"
                        keyboardType="email-address"
                    />
                    {email.length > 0 && (
                        <TouchableOpacity onPress={() => setEmail('')}>
                            <Ionicons name="close-circle" size={20} color={Colors.subText} />
                        </TouchableOpacity>
                    )}
                </View>

                {/* Password Input */}
                <View style={styles.inputContainer}>
                    <TextInput
                        style={styles.input}
                        placeholder="비밀번호"
                        placeholderTextColor={Colors.subText}
                        value={password}
                        onChangeText={setPassword}
                        secureTextEntry={!showPassword}
                    />
                    <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                        <Ionicons name={showPassword ? "eye" : "eye-off"} size={20} color={Colors.subText} />
                    </TouchableOpacity>
                </View>

                {/* Confirm Password Input */}
                <View style={styles.inputContainer}>
                    <TextInput
                        style={styles.input}
                        placeholder="비밀번호 확인"
                        placeholderTextColor={Colors.subText}
                        value={confirmPassword}
                        onChangeText={setConfirmPassword}
                        secureTextEntry={!showConfirmPassword}
                    />
                    <TouchableOpacity onPress={() => setShowConfirmPassword(!showConfirmPassword)}>
                        <Ionicons name={showConfirmPassword ? "eye" : "eye-off"} size={20} color={Colors.subText} />
                    </TouchableOpacity>
                </View>

                {/* Validation Indicators */}
                <View style={styles.validationContainer}>
                    <ValidationItem
                        checked={validation.hasMinLength}
                        text="8~64자 이상 입력"
                    />
                    <ValidationItem
                        checked={validation.hasTwoTypes}
                        text="영어 대문자, 소문자, 숫자, 특수문자 중 2종류 이상 조합"
                    />
                    <ValidationItem
                        checked={password.length > 0}
                        text={securityLevelText[validation.securityLevel].text}
                        color={password.length > 0 ? securityLevelText[validation.securityLevel].color : undefined}
                    />
                    <ValidationItem
                        checked={validation.passwordsMatch}
                        text={validation.passwordsMatch ? "비밀번호 일치" : "비밀번호 불일치"}
                    />
                </View>

                {/* Register Button */}
                <TouchableOpacity
                    style={[styles.registerButton, loading && styles.buttonDisabled]}
                    onPress={handleSignup}
                    disabled={loading}
                >
                    <Text style={styles.registerButtonText}>{loading ? '등록 중...' : '등록'}</Text>
                </TouchableOpacity>

                {/* Divider */}
                <View style={styles.divider}>
                    <View style={styles.dividerLine} />
                    <Text style={styles.dividerText}>or</Text>
                    <View style={styles.dividerLine} />
                </View>

                {/* Social Login Buttons */}
                <View style={styles.socialContainer}>
                    <TouchableOpacity style={[styles.socialButton, { backgroundColor: Colors.kakaoYellow }]}>
                        <Ionicons name="chatbubble-sharp" size={20} color="#3C1E1E" />
                        <Text style={[styles.socialText, { color: '#3C1E1E' }]}>카카오로 시작하기</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={[styles.socialButton, { backgroundColor: Colors.naverGreen }]}>
                        <Text style={[styles.socialText, { color: 'white', fontWeight: 'bold' }]}>N</Text>
                        <Text style={[styles.socialText, { color: 'white' }]}>네이버로 시작하기</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={[styles.socialButton, { backgroundColor: Colors.googleBlue }]}>
                        <Ionicons name="logo-google" size={20} color="white" />
                        <Text style={[styles.socialText, { color: 'white' }]}>구글로 시작하기</Text>
                    </TouchableOpacity>
                </View>

                {/* Login Link */}
                <View style={styles.loginLinkContainer}>
                    <Text style={styles.loginLinkText}>계정이 있으신가요? </Text>
                    <Link href="/auth/login" asChild>
                        <TouchableOpacity>
                            <Text style={styles.loginLink}>로그인</Text>
                        </TouchableOpacity>
                    </Link>
                </View>
            </ScrollView>
        </View>
    );
}

// Validation Item Component
function ValidationItem({ checked, text, color }: { checked: boolean; text: string; color?: string }) {
    const iconColor = checked ? (color || Colors.primaryGreen) : Colors.subText;
    const textColor = checked ? (color || Colors.white) : Colors.subText;

    return (
        <View style={styles.validationItem}>
            <Ionicons
                name={checked ? "checkmark-circle" : "ellipse-outline"}
                size={18}
                color={iconColor}
            />
            <Text style={[styles.validationText, { color: textColor }]}>{text}</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.darkBackground,
    },
    content: {
        padding: 24,
        paddingTop: 16,
    },
    laterText: {
        fontFamily: 'Pretendard-Medium',
        fontSize: 14,
        color: Colors.subText,
    },
    title: {
        fontFamily: 'Pretendard-Bold',
        fontSize: 24,
        color: Colors.white,
        textAlign: 'center',
        marginBottom: 32,
    },
    inputContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: Colors.darkCard,
        borderRadius: 12,
        paddingHorizontal: 16,
        paddingVertical: 14,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: Colors.darkBorder,
    },
    input: {
        flex: 1,
        fontFamily: 'Pretendard-Medium',
        fontSize: 16,
        color: Colors.white,
    },
    validationContainer: {
        gap: 8,
        marginTop: 8,
        marginBottom: 24,
    },
    validationItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    validationText: {
        fontFamily: 'Pretendard-Regular',
        fontSize: 13,
    },
    registerButton: {
        backgroundColor: Colors.primaryGreen,
        paddingVertical: 16,
        borderRadius: 12,
        alignItems: 'center',
    },
    buttonDisabled: {
        opacity: 0.6,
    },
    registerButtonText: {
        fontFamily: 'Pretendard-SemiBold',
        fontSize: 16,
        color: Colors.darkBackground,
    },
    divider: {
        flexDirection: 'row',
        alignItems: 'center',
        marginVertical: 24,
    },
    dividerLine: {
        flex: 1,
        height: 1,
        backgroundColor: Colors.darkBorder,
    },
    dividerText: {
        fontFamily: 'Pretendard-Medium',
        fontSize: 14,
        color: Colors.subText,
        marginHorizontal: 16,
    },
    socialContainer: {
        gap: 12,
    },
    socialButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 14,
        borderRadius: 12,
        gap: 8,
    },
    socialText: {
        fontFamily: 'Pretendard-Medium',
        fontSize: 15,
    },
    loginLinkContainer: {
        flexDirection: 'row',
        justifyContent: 'center',
        marginTop: 24,
        marginBottom: 40,
    },
    loginLinkText: {
        fontFamily: 'Pretendard-Regular',
        fontSize: 14,
        color: Colors.subText,
    },
    loginLink: {
        fontFamily: 'Pretendard-SemiBold',
        fontSize: 14,
        color: Colors.primaryGreen,
    },
});
