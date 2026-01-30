import { Tabs, useRouter, useSegments } from 'expo-router';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState, useRef } from 'react';
import { View, Text, Linking, Platform, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../services/supabase';
import { Colors } from '../constants/Colors';
import { ReciprocityEngine } from '../services/ReciprocityEngine';
import { registerForPushNotificationsAsync } from '../services/notifications';
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
                const type = params.get('type');

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

                        // Show welcome message for first-time email confirmation
                        if (type === 'signup') {
                            setTimeout(() => {
                                Alert.alert(
                                    '환영합니다! 🎉',
                                    '이메일 인증이 완료되었습니다.\n하루클릭을 시작해보세요!',
                                    [{ text: '시작하기' }]
                                );
                            }, 500);
                        }
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
    const isTimedOut = useRef(false);

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

        // Auth Check with Timeout Safety (10s)
        const startTime = Date.now();


        const sessionTimeout = setTimeout(() => {
            if (!initialized && !isTimedOut.current) {
                isTimedOut.current = true;
                if (__DEV__) {
                    console.warn(`Session check timeout (${Date.now() - startTime}ms) - proceeding without session`);
                }
                setInitialized(true);
            }
        }, 10000);

        supabase.auth.getSession().then(({ data: { session }, error }) => {
            clearTimeout(sessionTimeout);
            if (error) {
                console.log('Session init error:', error);

                // ✅ Invalid Refresh Token 에러 발생 시 강력한(Robust) 로그아웃 처리
                if (error.message && (
                    error.message.includes('Refresh Token') ||
                    error.message.includes('Invalid Refresh Token')
                )) {
                    handleSessionError();
                }
            }
            // 타임아웃이 이미 발생했더라도 세션이 있으면 업데이트 (결과적 일관성)
            // 단, 불필요한 상태 업데이트를 막기 위해 initialized 체크
            if (!isTimedOut.current) {
                setSession(session);
                setInitialized(true);
            } else {
                // 이미 타임아웃으로 진행된 상태에서 세션이 늦게 도착한 경우
                // 세션만 업데이트하면 useEffect가 라우팅을 처리함
                if (session) {
                    if (__DEV__) console.log('Session arrived late after timeout, updating...');
                    setSession(session);
                }
            }
        }).catch(e => {
            clearTimeout(sessionTimeout);
            console.log('Session check failed:', e);
            if (!isTimedOut.current) {
                setInitialized(true);
            }
        });

        // 🛡️ Helper: 세션 에러 시 로컬 데이터 강제 초기화
        const handleSessionError = async () => {
            console.warn('[Auth] Handling Invalid Refresh Token - Force Logout');

            // 1. Supabase SignOut (Best Effort) - 네트워크 실패해도 진행
            try {
                await supabase.auth.signOut();
            } catch (e) {
                console.log('[Auth] Remote signOut failed, proceeding to local cleanup', e);
            }

            // 2. Local Storage 강제 정리 (Dynamic Key)
            try {
                const keys = await AsyncStorage.getAllKeys();
                // Supabase 관련 키(sb-...) 모두 찾아서 제거
                const supabaseKeys = keys.filter(k => k.startsWith('sb-') || k.includes('supabase'));

                if (supabaseKeys.length > 0) {
                    console.log('[Auth] Clearing stale keys:', supabaseKeys);
                    await AsyncStorage.multiRemove(supabaseKeys);
                }
            } catch (e) {
                console.error('[Auth] Storage cleanup failed:', e);
            }

            // 3. UI 및 라우팅 강제 리셋
            setSession(null);
            router.replace('/auth/login');
        };

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
                    router.push('/relationship-ledger');
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
                        listeners={{
                            tabPress: (e: any) => {
                                // 탭 누를 때마다 강제 리프레시 (날짜 파라미터 삭제 & refresh param 갱신)
                                e.preventDefault();
                                router.push({
                                    pathname: '/calendar',
                                    params: {
                                        refresh: Date.now(),
                                        date: '' // date 파라미터 초기화
                                    }
                                });
                            },
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
                        name="relationship-ledger/index"
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
                    <Tabs.Screen
                        name="auth/verify-email"
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
