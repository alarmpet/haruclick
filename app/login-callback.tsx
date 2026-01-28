import { useEffect, useState } from 'react';
import { View, ActivityIndicator, Text, StyleSheet, Linking } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../services/supabase';
import { Colors } from '../constants/Colors';

export default function LoginCallback() {
    const router = useRouter();
    const [status, setStatus] = useState('로그인 처리 중...');

    useEffect(() => {
        let completed = false;
        const timeoutMs = 8000;

        const setSessionFromUrl = async (url: string) => {
            if (!url.includes('login-callback')) return false;

            let params: URLSearchParams | null = null;
            if (url.includes('#')) {
                const hashPart = url.split('#')[1];
                if (hashPart) params = new URLSearchParams(hashPart);
            } else if (url.includes('?')) {
                const queryPart = url.split('?')[1];
                if (queryPart) params = new URLSearchParams(queryPart);
            }

            if (!params) return false;

            const access_token = params.get('access_token');
            const refresh_token = params.get('refresh_token');

            if (access_token && refresh_token) {
                setStatus('세션 설정 중...');
                const { error } = await supabase.auth.setSession({
                    access_token,
                    refresh_token,
                });
                if (error) {
                    console.log('setSession error:', error);
                    return false;
                }
                return true;
            }

            return false;
        };

        const handleCallback = async () => {
            let linkSub: { remove: () => void } | null = null;
            try {
                linkSub = Linking.addEventListener('url', async (event) => {
                    const applied = await setSessionFromUrl(event.url);
                    if (applied && !completed) {
                        completed = true;
                        setStatus('로그인 성공!');
                        router.replace('/');
                    }
                });

                const url = await Linking.getInitialURL();
                console.log('Callback URL:', url);
                if (url) {
                    const applied = await setSessionFromUrl(url);
                    if (applied) {
                        completed = true;
                        setStatus('로그인 성공!');
                        router.replace('/');
                        linkSub.remove();
                        return;
                    }
                }

                setStatus('세션 확인 중...');
                const timeoutPromise = new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('Session timeout')), timeoutMs)
                );
                const { data: { session } } = await Promise.race([
                    supabase.auth.getSession(),
                    timeoutPromise,
                ]) as any;

                if (session) {
                    completed = true;
                    setStatus('로그인 성공!');
                    router.replace('/');
                    linkSub.remove();
                    return;
                }

                throw new Error('세션을 찾을 수 없습니다');
            } catch (e: any) {
                console.log('Callback error:', e);
                setStatus('로그인 실패');
                setTimeout(() => router.replace('/auth/login'), 2000);
            } finally {
                if (linkSub) linkSub.remove();
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
