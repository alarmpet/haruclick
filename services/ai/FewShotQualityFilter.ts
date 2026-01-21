/**
 * Few-Shot Quality Filter
 * 학습 데이터 품질 검증 - 저품질 후보를 자동 필터링
 */

interface QualityCheckResult {
    passed: boolean;
    reason?: string;
    score: number;
}

/**
 * Few-shot 후보의 품질을 검증합니다.
 * 
 * @param inputText OCR에서 추출한 원본 텍스트
 * @param outputJson AI가 추출한 결과
 * @returns 품질 검증 결과
 */
export function checkFewShotQuality(inputText: string, outputJson: any): QualityCheckResult {
    let score = 100;
    const reasons: string[] = [];

    // 1. 입력 텍스트 길이 검사 (최소 50자)
    if (!inputText || inputText.length < 50) {
        score -= 50;
        reasons.push(`input_too_short (${inputText?.length || 0} chars)`);
    }

    // 2. 출력 타입 검사 (UNKNOWN 제외)
    if (!outputJson || outputJson.type === 'UNKNOWN') {
        score -= 100;
        reasons.push('unknown_type');
    }

    // 3. 필수 필드 검사
    const essentialFields = countEssentialFields(outputJson);
    if (essentialFields < 3) {
        score -= 30;
        reasons.push(`insufficient_fields (${essentialFields})`);
    }

    // 4. 신뢰도 검사 (0.7 이상)
    const confidence = outputJson?.confidence ?? 0;
    if (confidence < 0.7) {
        score -= 20;
        reasons.push(`low_confidence (${confidence})`);
    }

    // 5. 날짜/금액 필드 검증
    if (outputJson?.type === 'STORE_PAYMENT' || outputJson?.type === 'BANK_TRANSFER') {
        if (!outputJson.amount || outputJson.amount <= 0) {
            score -= 30;
            reasons.push('missing_amount');
        }
    }

    return {
        passed: score >= 70,
        reason: reasons.length > 0 ? reasons.join(', ') : undefined,
        score: Math.max(0, score)
    };
}

/**
 * 필수 필드 개수를 계산합니다.
 */
function countEssentialFields(data: any): number {
    if (!data) return 0;

    const importantFields = [
        'type', 'date', 'eventDate', 'expiryDate',
        'amount', 'recommendedAmount',
        'merchant', 'targetName', 'mainName',
        'eventLocation', 'location',
        'category', 'subCategory'
    ];

    return importantFields.filter(field => {
        const value = data[field];
        return value !== undefined && value !== null && value !== '';
    }).length;
}

/**
 * 중복 패턴인지 확인합니다.
 * (실제 구현은 DB 조회가 필요하므로 별도 서비스에서 처리)
 */
export async function checkDuplicatePattern(inputText: string, documentType: string): Promise<boolean> {
    // TODO: Supabase에서 유사한 패턴이 3개 이상 있는지 확인
    // 현재는 항상 false 반환 (중복 아님)
    return false;
}
