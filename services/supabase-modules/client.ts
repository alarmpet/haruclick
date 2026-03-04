import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { showError } from '../errorHandler';

// TODO: Replace with actual Env variables in .env file
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export const DB_CONNECTION_ERROR = "DB 연결 설정이 필요합니다.";
let isConfigured = false;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.warn('[Supabase] Missing credentials. DB features will be disabled.');
} else {
    isConfigured = true;
}

export function checkSupabaseConfigured(): boolean {
    if (!isConfigured) {
        console.warn(`[Supabase] Operation skipped: ${DB_CONNECTION_ERROR}`);
    }
    return isConfigured;
}

// ✅ AsyncStorage를 사용하여 세션 지속성 활성화 (네이티브 빌드 필수)
// 환경변수가 없어도 앱이 터지지 않도록 더미 값으로 초기화하되, 실 사용 시 에러 발생
export const supabase = createClient(
    SUPABASE_URL || 'https://placeholder.supabase.co',
    SUPABASE_ANON_KEY || 'placeholder',
    {
        auth: {
            storage: AsyncStorage,
            autoRefreshToken: true,
            persistSession: true,
            detectSessionInUrl: false, // React Native에서는 URL 감지 비활성화
        },
    });

// ========================================
// 🚀 In-Memory Cache for Performance
// ========================================
interface CacheEntry<T> {
    data: T;
    timestamp: number;
}

const CACHE_TTL_MS = 30000; // 30 seconds
const cache: Map<string, CacheEntry<any>> = new Map();
const inflight: Map<string, Promise<any>> = new Map();

export function getCached<T>(key: string): T | null {
    const entry = cache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
        cache.delete(key);
        return null;
    }
    return entry.data;
}

export function setCache<T>(key: string, data: T): void {
    cache.set(key, { data, timestamp: Date.now() });
}

export function invalidateCache(prefix?: string): void {
    if (prefix) {
        for (const key of cache.keys()) {
            if (key.startsWith(prefix)) cache.delete(key);
        }
    } else {
        cache.clear();
    }
}

export function withInflight<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
    const existing = inflight.get(key) as Promise<T> | undefined;
    if (existing) return existing;
    const promise = fetcher().finally(() => {
        inflight.delete(key);
    });
    inflight.set(key, promise);
    return promise;
}

export function invalidateUserScopedCache(prefixes: string[], userId?: string | null): void {
    if (userId) {
        prefixes.forEach((prefix) => invalidateCache(`${prefix}${userId}_`));
        return;
    }
    prefixes.forEach((prefix) => invalidateCache(prefix));
}

export function invalidateCalendarCache(userId: string): void {
    // Invalidate events and upcoming events cache when calendar membership changes
    invalidateUserScopedCache(['events_', 'upcoming_'], userId);
}

export async function testConnection() {
    try {
        const { data, error } = await supabase.from('events').select('count').limit(1);
        if (error) throw error;
        return { success: true, message: 'Connected to Supabase!' };
    } catch (e: any) {
        showError(e.message ?? 'Supabase 연결 실패');
        return { success: false, message: e.message };
    }
}
