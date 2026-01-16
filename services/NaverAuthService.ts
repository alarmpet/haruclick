import NaverLogin from '@react-native-seoul/naver-login';
import { Alert, Platform } from 'react-native';
import { supabase } from './supabase';

// ⚠️ [User Action Required]: Replace these placeholders with actual keys from Naver Developers Center
const NAVER_CLIENT_ID = 'SV3gCTZ4KAw35797giHx';
const NAVER_CLIENT_SECRET = 'oqJh6rBz2b';
const NAVER_URL_SCHEME = 'haruclick'; // Must match app.json scheme

export const initializeNaverLogin = () => {
    NaverLogin.initialize({
        appName: '하루클릭',
        consumerKey: NAVER_CLIENT_ID,
        consumerSecret: NAVER_CLIENT_SECRET,
        serviceUrlSchemeIOS: NAVER_URL_SCHEME,
        disableNaverAppAuthIOS: true, // If true, use webview defined in serviceUrlSchemeIOS
    });
};

export const loginWithNaver = async () => {
    try {
        // 1. Login with Naver (Native/Web)
        const { failureResponse, successResponse } = await NaverLogin.login();

        if (failureResponse) {
            console.log('Naver Login Failed:', failureResponse);
            return { error: failureResponse };
        }

        if (successResponse) {
            const { accessToken } = successResponse;
            console.log('Naver Access Token:', accessToken);

            // 2. Call Supabase Edge Function to verify token and get session
            // Note: You must deploy the 'naver-auth' function first!
            const { data, error } = await supabase.functions.invoke('naver-auth', {
                body: { accessToken },
            });

            if (error) {
                console.error('Edge Function Error:', error);
                throw new Error('서버 인증 실패: ' + error.message);
            }

            if (data?.session) {
                // 3. Set Session in Supabase Client
                const { error: sessionError } = await supabase.auth.setSession(data.session);
                if (sessionError) throw sessionError;

                return { success: true };
            } else {
                throw new Error('세션 정보를 받아오지 못했습니다.');
            }
        }
    } catch (e: any) {
        Alert.alert('로그인 오류', e.message);
        return { error: e };
    }
    return { error: 'Unknown error' };
};
