/**
 * Dynamic Few-Shot 로더
 * approved_fewshots 테이블에서 승인된 예제를 가져와 프롬프트에 주입
 */

import { supabase } from './supabase';

interface ApprovedFewShot {
    input_text: string;
    output_json: any;
    document_type: string;
}

let cachedFewShots: ApprovedFewShot[] | null = null;
let lastFetchTime: number = 0;
const CACHE_DURATION_MS = 5 * 60 * 1000; // 5분 캐시

/**
 * 승인된 Few-Shot 예제를 가져옴 (캐시 적용)
 */
export async function getApprovedFewShots(maxCount: number = 15): Promise<ApprovedFewShot[]> {
    const now = Date.now();

    // 캐시가 유효하면 캐시 반환
    if (cachedFewShots && (now - lastFetchTime) < CACHE_DURATION_MS) {
        return cachedFewShots.slice(0, maxCount);
    }

    try {
        const { data, error } = await supabase
            .from('approved_fewshots')
            .select('input_text, output_json, document_type')
            .eq('is_active', true)
            .order('priority', { ascending: false })
            .order('approved_at', { ascending: false })
            .limit(maxCount);

        if (error) {
            console.warn('Failed to fetch approved few-shots:', error);
            return cachedFewShots || [];
        }

        cachedFewShots = data || [];
        lastFetchTime = now;
        return cachedFewShots;
    } catch (e) {
        console.warn('Error fetching few-shots:', e);
        return cachedFewShots || [];
    }
}

/**
 * Few-Shot 예제를 프롬프트 문자열로 변환
 */
export function formatFewShotsForPrompt(fewShots: ApprovedFewShot[]): string {
    if (!fewShots || fewShots.length === 0) return '';

    const examples = fewShots.map((shot, i) => `
Example ${i + 1} (User-Verified, Type: ${shot.document_type}):
Input: "${shot.input_text.slice(0, 300).replace(/"/g, '\\"')}${shot.input_text.length > 300 ? '...' : ''}"
Output: ${JSON.stringify(shot.output_json)}`
    ).join('\n');

    return `
═══════════════════════════════════════════════════════════════
📚 DYNAMICALLY LOADED FEW-SHOT EXAMPLES (User-Verified):
═══════════════════════════════════════════════════════════════
${examples}
═══════════════════════════════════════════════════════════════
`;
}

/**
 * 프롬프트에 동적 Few-Shot 섹션 추가
 */
export async function getDynamicFewShotSection(): Promise<string> {
    const fewShots = await getApprovedFewShots(15);
    return formatFewShotsForPrompt(fewShots);
}

/**
 * 캐시 강제 무효화 (새 예제 승인 후 호출)
 */
export function invalidateFewShotCache(): void {
    cachedFewShots = null;
    lastFetchTime = 0;
}
