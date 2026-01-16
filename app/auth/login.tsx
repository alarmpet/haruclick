import { View, Text, StyleSheet, TextInput, TouchableOpacity, Alert, ScrollView, Platform, Linking, StatusBar } from 'react-native';
import { useState, useEffect } from 'react';
import { useRouter, Stack, Link } from 'expo-router';
import { loginWithEmail } from '../../services/authService';
import { supabase } from '../../services/supabase';
import { Colors } from '../../constants/Colors';
import Ionicons from '@expo/vector-icons/Ionicons';
import { initializeNaverLogin, loginWithNaver } from '../../services/NaverAuthService';
import { useTheme } from '../../contexts/ThemeContext';

export default function LoginScreen() {
    const router = useRouter();
    const { colors, isDark } = useTheme();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);

    useEffect(() => {
        initializeNaverLogin();
    }, []);

    const handleLogin = async () => {
        if (!email || !password) {
            Alert.alert('알림', '이메일과 비밀번호를 입력해주세요.');
            return;
        }
        setLoading(true);
        const result = await loginWithEmail(email, password);
        if (!result.success) {
            Alert.alert('로그인 실패', result.error ?? '알 수 없는 오류');
        }
        setLoading(false);
    };

    const handleSocialLogin = async (provider: 'google' | 'kakao') => {
        try {
            const redirectTo = Platform.select({
                ios: 'haruclick://login-callback',
                android: 'haruclick://login-callback',
                default: 'haruclick://login-callback',
            });

            const { data, error } = await supabase.auth.signInWithOAuth({
                provider: provider as any,
                options: {
                    redirectTo,
                    skipBrowserRedirect: true,
                }
            });

            if (error) throw error;

            if (data?.url) {
                await Linking.openURL(data.url);
            }
        } catch (e: any) {
            Alert.alert('로그인 에러', e.message);
        }
    };

    const handleNaverLogin = async () => {
        setLoading(true);
        const { success, error } = await loginWithNaver();
        if (success) {
            router.replace('/');
        } else if (error) {
            console.log('Naver login failed');
        }
        setLoading(false);
    };

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={colors.background} />
            <Stack.Screen
                options={{
                    headerShown: true,
                    title: '',
                    headerStyle: { backgroundColor: colors.background },
                    headerTintColor: colors.text,
                    headerLeft: () => (
                        <TouchableOpacity onPress={() => router.back()} accessibilityLabel="뒤로 가기">
                            <Ionicons name="close" size={24} color={colors.text} />
                        </TouchableOpacity>
                    ),
                }}
            />

            <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
                {/* Logo */}
                <View style={styles.logoContainer}>
                    <Text style={styles.logoEmoji}>📅</Text>
                    <Text style={[styles.logoText, { color: colors.primary }]}>하루클릭</Text>
                    <Text style={[styles.subtitle, { color: colors.subText }]}>내 손안의 경조사 관리 비서</Text>
                </View>

                {/* Email Input */}
                <View style={[styles.inputContainer, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <TextInput
                        style={[styles.input, { color: colors.text }]}
                        placeholder="이메일"
                        placeholderTextColor={colors.subText}
                        value={email}
                        onChangeText={setEmail}
                        autoCapitalize="none"
                        keyboardType="email-address"
                        accessibilityLabel="이메일 입력창"
                    />
                </View>

                {/* Password Input */}
                <View style={[styles.inputContainer, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <TextInput
                        style={[styles.input, { color: colors.text }]}
                        placeholder="비밀번호"
                        placeholderTextColor={colors.subText}
                        value={password}
                        onChangeText={setPassword}
                        secureTextEntry={!showPassword}
                        accessibilityLabel="비밀번호 입력창"
                    />
                    <TouchableOpacity
                        onPress={() => setShowPassword(!showPassword)}
                        accessibilityLabel={showPassword ? "비밀번호 숨기기" : "비밀번호 보기"}
                    >
                        <Ionicons name={showPassword ? "eye" : "eye-off"} size={20} color={colors.subText} />
                    </TouchableOpacity>
                </View>

                {/* Login Button */}
                <TouchableOpacity
                    style={[styles.loginButton, loading && styles.buttonDisabled, { backgroundColor: colors.primary }]}
                    onPress={handleLogin}
                    disabled={loading}
                    accessibilityLabel="로그인 버튼"
                >
                    <Text style={[styles.loginButtonText, { color: colors.background }]}>{loading ? '로그인 중...' : '로그인'}</Text>
                </TouchableOpacity>

                {/* Divider */}
                <View style={styles.divider}>
                    <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
                    <Text style={[styles.dividerText, { color: colors.subText }]}>또는</Text>
                    <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
                </View>

                {/* Social Login Buttons */}
                <View style={styles.socialContainer}>
                    <TouchableOpacity
                        style={[styles.socialButton, { backgroundColor: Colors.kakaoYellow }]}
                        onPress={() => handleSocialLogin('kakao')}
                        accessibilityLabel="카카오 로그인"
                    >
                        <Ionicons name="chatbubble-sharp" size={20} color="#3C1E1E" />
                        <Text style={[styles.socialText, { color: '#3C1E1E' }]}>카카오 로그인</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[styles.socialButton, { backgroundColor: Colors.naverGreen }]}
                        onPress={handleNaverLogin}
                        accessibilityLabel="네이버 로그인"
                    >
                        <Text style={[styles.socialText, { color: 'white', fontWeight: 'bold' }]}>N</Text>
                        <Text style={[styles.socialText, { color: 'white' }]}> 네이버 로그인</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[styles.socialButton, { backgroundColor: Colors.googleBlue }]}
                        onPress={() => handleSocialLogin('google')}
                        accessibilityLabel="구글 로그인"
                    >
                        <Ionicons name="logo-google" size={20} color="white" />
                        <Text style={[styles.socialText, { color: 'white' }]}>구글 로그인</Text>
                    </TouchableOpacity>
                </View>

                {/* Signup Link */}
                <View style={styles.signupLinkContainer}>
                    <Text style={[styles.signupLinkText, { color: colors.subText }]}>계정이 없으신가요? </Text>
                    <Link href="/auth/signup" asChild>
                        <TouchableOpacity accessibilityLabel="회원가입 하기">
                            <Text style={[styles.signupLink, { color: colors.primary }]}>회원가입</Text>
                        </TouchableOpacity>
                    </Link>
                </View>
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    content: {
        padding: 24,
        paddingTop: 16,
    },
    logoContainer: {
        alignItems: 'center',
        marginBottom: 40,
    },
    logoEmoji: {
        fontSize: 48,
        marginBottom: 12,
    },
    logoText: {
        fontFamily: 'Pretendard-Bold',
        fontSize: 28,
        marginBottom: 8,
    },
    subtitle: {
        fontFamily: 'Pretendard-Medium',
        fontSize: 14,
    },
    inputContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: 12,
        paddingHorizontal: 16,
        paddingVertical: 14,
        marginBottom: 12,
        borderWidth: 1,
    },
    input: {
        flex: 1,
        fontFamily: 'Pretendard-Medium',
        fontSize: 16,
    },
    loginButton: {
        paddingVertical: 16,
        borderRadius: 12,
        alignItems: 'center',
        marginTop: 8,
    },
    buttonDisabled: {
        opacity: 0.6,
    },
    loginButtonText: {
        fontFamily: 'Pretendard-SemiBold',
        fontSize: 16,
    },
    divider: {
        flexDirection: 'row',
        alignItems: 'center',
        marginVertical: 24,
    },
    dividerLine: {
        flex: 1,
        height: 1,
    },
    dividerText: {
        fontFamily: 'Pretendard-Medium',
        fontSize: 14,
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
    signupLinkContainer: {
        flexDirection: 'row',
        justifyContent: 'center',
        marginTop: 24,
        marginBottom: 40,
    },
    signupLinkText: {
        fontFamily: 'Pretendard-Regular',
        fontSize: 14,
    },
    signupLink: {
        fontFamily: 'Pretendard-SemiBold',
        fontSize: 14,
    },
});
