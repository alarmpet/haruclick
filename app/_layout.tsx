import { Tabs, useRouter, useSegments } from 'expo-router';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { View, Text, Linking, Platform } from 'react-native';
import { supabase } from '../services/supabase';
import { Colors } from '../constants/Colors';
import { ReciprocityEngine } from '../services/ReciprocityEngine';
import { registerForPushNotificationsAsync } from '../services/notification';
import * as Notifications from 'expo-notifications';
import Ionicons from '@expo/vector-icons/Ionicons';
import { LoadingProvider } from '../components/LoadingOverlay';
import { ThemeProvider } from '../contexts/ThemeContext';

SplashScreen.preventAutoHideAsync();

// OAuth 딥링크에서 토큰 추출 및 세션 설정
const handleDeepLink = async (url: string) => {
    console.log('Deep link received:', url);

    if (url.includes('login-callback')) {
        try {
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
                    console.log('Setting session from deep link...');
                    const { error } = await supabase.auth.setSession({
                        access_token,
                        refresh_token,
                    });

                    if (error) {
                        console.log('setSession error:', error);
                    } else {
                        console.log('Session set successfully!');
                    }
                }
            }
        } catch (e) {
            console.log('Deep link handling error:', e);
        }
    }
};

// Helper to save push token
const savePushToken = async (userId: string, token: string) => {
    try {
        const { error } = await supabase
            .from('user_push_tokens')
            .upsert({
                user_id: userId,
                push_token: token,
                device_type: Platform.OS,
                last_updated: new Date().toISOString()
            }, { onConflict: 'push_token' });

        if (error) console.error('Error saving push token:', error);
    } catch (e) {
        console.error('Exception saving push token:', e);
    }
};

export default function RootLayout() {
    const router = useRouter();
    const [loaded, error] = useFonts({
        'Pretendard-Medium': require('../assets/fonts/Pretendard-Medium.otf'),
        'Pretendard-Bold': require('../assets/fonts/Pretendard-Bold.otf'),
    });

    const segments = useSegments();
    const [session, setSession] = useState<any>(null);
    const [initialized, setInitialized] = useState(false);

    useEffect(() => {
        if (loaded || error) {
            SplashScreen.hideAsync();
        }

        // 딥링크 리스너 설정
        const linkingListener = Linking.addEventListener('url', (event) => {
            handleDeepLink(event.url);
        });

        // 앱 시작 시 초기 URL 확인
        Linking.getInitialURL().then((url) => {
            if (url) handleDeepLink(url);
        });

        // Initialize Notifications
        const init = async () => {
            try {
                const token = await registerForPushNotificationsAsync();
                if (token) {
                    const { data: { session: currentSession } } = await supabase.auth.getSession();
                    if (currentSession?.user) {
                        await savePushToken(currentSession.user.id, token);
                    }
                    await ReciprocityEngine.runChecks();
                }
            } catch (e) {
                console.log('Notification init failed (likely missing FCM config):', e);
            }
        };
        init();

        // Auth Check
        supabase.auth.getSession().then(({ data: { session } }) => {
            setSession(session);
            setInitialized(true);
        });

        const { data: { subscription: authListener } } = supabase.auth.onAuthStateChange(async (_event, session) => {
            setSession(session);
            if (session?.user) {
                // 로그인 시 토큰 저장 시도 (FCM 설정 없으면 조용히 실패)
                try {
                    const token = await registerForPushNotificationsAsync();
                    if (token) {
                        await savePushToken(session.user.id, token);
                    }
                } catch (e) {
                    console.log('Login push token fetch failed:', e);
                }
            }
        });

        // Notification Listener
        const subscription = Notifications.addNotificationResponseReceivedListener(response => {
            const title = response.notification.request.content.title;
            if (title && title.includes('보답')) {
                setTimeout(() => {
                    router.push('/gifticon/payback');
                }, 500);
            }
        });

        return () => {
            linkingListener.remove();
            authListener.unsubscribe();
            subscription.remove();
        };

    }, [loaded, error]);

    useEffect(() => {
        if (!initialized || !loaded) return;

        const inAuthGroup = segments[0] === 'auth';
        const isCallback = segments[0] === 'login-callback';

        if (session && (inAuthGroup || isCallback)) {
            // 로그인 상태인데 로그인 화면(또는 콜백)이면 메인으로
            router.replace('/');
        } else if (!session && !inAuthGroup && !isCallback) {
            // 비로그인 상태인데 메인 화면이면 로그인으로 (콜백 제외)
            router.replace('/auth/welcome');
        }
    }, [session, segments, initialized, loaded]);


    // Debugging logs
    console.log('RootLayout rendering. Loaded:', loaded, 'Error:', error, 'Initialized:', initialized);

    // 폰트 로딩 중이거나 인증 상태 확인 중이면 로딩 화면 표시
    if (!loaded && !error) {
        return (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.background }}>
                <Text style={{ fontSize: 24, color: Colors.navy }}>Loading 하루클릭...</Text>
            </View>
        );
    }

    // 인증 상태 확인이 완료되지 않았으면 로딩 화면 유지
    if (!initialized) {
        return (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.background }}>
                <Text style={{ fontSize: 24, color: Colors.navy }}>Loading 하루클릭...</Text>
            </View>
        );
    }


    return (
        <ThemeProvider>
            <LoadingProvider>
                <Tabs
                    screenOptions={{
                        headerStyle: {
                            backgroundColor: Colors.navy,
                        },
                        headerTintColor: Colors.white,
                        headerTitleStyle: {
                            fontFamily: 'Pretendard-Bold',
                        },
                        tabBarStyle: {
                            backgroundColor: Colors.navy,
                            borderTopWidth: 0,
                            height: Platform.OS === 'ios' ? 90 : 70,
                            paddingBottom: Platform.OS === 'ios' ? 30 : 10,
                            paddingTop: 10,
                            elevation: 0,
                            shadowOpacity: 0,
                        },
                        tabBarActiveTintColor: Colors.orange,
                        tabBarInactiveTintColor: 'rgba(255, 255, 255, 0.4)',
                        tabBarLabelStyle: {
                            fontFamily: 'Pretendard-Medium',
                            fontSize: 12,
                            marginTop: 4,
                        },
                    }}
                >
                    <Tabs.Screen
                        name="index"
                        options={{
                            title: '홈',
                            tabBarIcon: ({ color, focused }) => (
                                <Ionicons name={focused ? "home" : "home-outline"} size={24} color={color} />
                            ),
                        }}
                    />
                    <Tabs.Screen
                        name="history/index"
                        options={{
                            title: '리포트',
                            tabBarIcon: ({ color, focused }) => (
                                <Ionicons name={focused ? "stats-chart" : "stats-chart-outline"} size={24} color={color} />
                            ),
                        }}
                    />
                    <Tabs.Screen
                        name="calendar/index"
                        options={{
                            title: '캘린더',
                            tabBarIcon: ({ color, focused }) => (
                                <Ionicons name={focused ? "calendar" : "calendar-outline"} size={24} color={color} />
                            ),
                        }}
                    />
                    <Tabs.Screen
                        name="settings/index"
                        options={{
                            title: '설정',
                            tabBarIcon: ({ color, focused }) => (
                                <Ionicons name={focused ? "settings" : "settings-outline"} size={24} color={color} />
                            ),
                        }}
                    />

                    {/* Hide all other routes from tab bar */}
                    <Tabs.Screen
                        name="gifticon/index"
                        options={{
                            href: null,
                        }}
                    />
                    <Tabs.Screen
                        name="gifticon/analyze"
                        options={{
                            href: null,
                        }}
                    />
                    <Tabs.Screen
                        name="gifticon/payback"
                        options={{
                            href: null,
                        }}
                    />
                    <Tabs.Screen
                        name="scan/index"
                        options={{
                            href: null,
                        }}
                    />
                    <Tabs.Screen
                        name="scan/result"
                        options={{
                            href: null,
                        }}
                    />
                    <Tabs.Screen
                        name="scan/universal"
                        options={{
                            href: null,
                        }}
                    />
                    <Tabs.Screen
                        name="community/index"
                        options={{
                            href: null,
                        }}
                    />
                    {/* Auth routes hidden */}
                    <Tabs.Screen
                        name="auth/login"
                        options={{
                            href: null,
                            tabBarStyle: { display: 'none' }
                        }}
                    />
                    <Tabs.Screen
                        name="auth/signup"
                        options={{
                            href: null,
                            tabBarStyle: { display: 'none' }
                        }}
                    />
                    <Tabs.Screen
                        name="auth/welcome"
                        options={{
                            href: null,
                            tabBarStyle: { display: 'none' }
                        }}
                    />
                    {/* Login Callback hidden */}
                    <Tabs.Screen
                        name="login-callback"
                        options={{
                            href: null,
                            tabBarStyle: { display: 'none' }
                        }}
                    />
                    {/* Settings subpages hidden */}
                    <Tabs.Screen
                        name="settings/customer-support/index"
                        options={{
                            href: null,
                        }}
                    />
                    <Tabs.Screen
                        name="settings/customer-support/write"
                        options={{
                            href: null,
                        }}
                    />
                    <Tabs.Screen
                        name="settings/profile"
                        options={{
                            href: null,
                        }}
                    />
                    <Tabs.Screen
                        name="settings/notifications"
                        options={{
                            href: null,
                        }}
                    />
                    <Tabs.Screen
                        name="settings/terms"
                        options={{
                            href: null,
                        }}
                    />
                    <Tabs.Screen
                        name="settings/privacy"
                        options={{
                            href: null,
                        }}
                    />
                    <Tabs.Screen
                        name="settings/calendar-sync"
                        options={{
                            href: null,
                        }}
                    />
                    <Tabs.Screen
                        name="stats/index"
                        options={{
                            href: null,
                        }}
                    />
                </Tabs>
            </LoadingProvider>
        </ThemeProvider>
    );
}
