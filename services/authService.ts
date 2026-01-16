// services/authService.ts
import { supabase } from './supabase';
import { Platform, Linking } from 'react-native';
import { loginWithNaver } from './NaverAuthService';
import { Alert } from 'react-native';

/** Result type for auth operations */
export type AuthResult = {
    success: boolean;
    error?: string;
};

/** Email/Password login */
export async function loginWithEmail(email: string, password: string): Promise<AuthResult> {
    try {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) return { success: false, error: error.message };
        return { success: true };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

/** Social login (Google, Kakao, etc.) */
export async function loginWithSocial(provider: 'google' | 'kakao'): Promise<AuthResult> {
    try {
        const redirectTo = Platform.select({
            ios: 'haruclick://login-callback',
            android: 'haruclick://login-callback',
            default: 'haruclick://login-callback',
        });
        const { data, error } = await supabase.auth.signInWithOAuth({
            provider: provider as any,
            options: { redirectTo, skipBrowserRedirect: true },
        });
        if (error) return { success: false, error: error.message };
        if (data?.url) await Linking.openURL(data.url);
        return { success: true };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

/** Naver login – wrapper around existing NaverAuthService */
export async function loginWithNaverWrapper(): Promise<AuthResult> {
    try {
        const { success, error } = await loginWithNaver();
        if (success) return { success: true };
        return { success: false, error: error?.message ?? 'Naver login failed' };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

/** Logout */
export async function logout(): Promise<AuthResult> {
    try {
        const { error } = await supabase.auth.signOut();
        if (error) return { success: false, error: error.message };
        return { success: true };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

/** Sign‑up (email/password) */
export async function signUp(email: string, password: string): Promise<AuthResult> {
    try {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) return { success: false, error: error.message };
        return { success: true };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}
