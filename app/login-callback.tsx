import { useEffect, useState } from 'react';
import { View, ActivityIndicator, Text, StyleSheet, Linking } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../services/supabase';
import { Colors } from '../constants/Colors';

export default function LoginCallback() {
    const router = useRouter();
    const [status, setStatus] = useState('로그인 처리 중...');

    useEffect(() => {
        const handleCallback = async () => {
            try {
                // 현재 URL 가져오기 (딥링크에서 토큰 포함)
                const url = await Linking.getInitialURL();
                console.log('Callback URL:', url);

                if (url) {
                    // URL에서 토큰 추출
                    // 형식: haruclick://login-callback#access_token=...&refresh_token=...
                    let params: URLSearchParams | null = null;

                    if (url.includes('#')) {
                        const hashPart = url.split('#')[1];
                        if (hashPart) params = new URLSearchParams(hashPart);
                    } else if (url.includes('?')) {
                        const queryPart = url.split('?')[1];
                        if (queryPart) params = new URLSearchParams(queryPart);
                    }

                    if (params) {
                        const access_token = params.get('access_token');
                        const refresh_token = params.get('refresh_token');

                        if (access_token && refresh_token) {
                            setStatus('세션 설정 중...');

                            // 세션 수동 설정
                            const { error } = await supabase.auth.setSession({
                                access_token,
                                refresh_token,
                            });

                            if (error) {
                                console.log('setSession error:', error);
                                throw error;
                            }

                            setStatus('로그인 성공!');
                            setTimeout(() => router.replace('/'), 500);
                            return;
                        }
                    }
                }

                // URL에 토큰이 없으면 기존 세션 확인
                setStatus('세션 확인 중...');
                const { data: { session } } = await supabase.auth.getSession();

                if (session) {
                    setStatus('로그인 성공!');
                    setTimeout(() => router.replace('/'), 500);
                } else {
                    throw new Error('세션을 찾을 수 없습니다');
                }

            } catch (e: any) {
                console.log('Callback error:', e);
                setStatus('로그인 실패');
                setTimeout(() => router.replace('/auth/login'), 2000);
            }
        };

        handleCallback();
    }, []);

    return (
        <View style={styles.container}>
            <ActivityIndicator size="large" color={Colors.navy} />
            <Text style={styles.text}>{status}</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: Colors.background,
        gap: 16,
    },
    text: {
        fontFamily: 'Pretendard-Medium',
        fontSize: 16,
        color: Colors.subText,
    },
});
