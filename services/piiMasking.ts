/**
 * PII (개인식별정보) 마스킹 유틸리티
 * 학습 데이터 생성 시 개인정보를 자동으로 마스킹 처리
 */

export interface MaskingOptions {
    maskNames?: boolean;       // 이름 마스킹
    maskAccounts?: boolean;    // 계좌번호 마스킹
    maskPhones?: boolean;      // 전화번호 마스킹
    maskAddresses?: boolean;   // 상세주소 마스킹
    maskEmails?: boolean;      // 이메일 마스킹
}

const DEFAULT_OPTIONS: MaskingOptions = {
    maskNames: true,
    maskAccounts: true,
    maskPhones: true,
    maskAddresses: true,
    maskEmails: true
};

/**
 * 텍스트에서 개인정보를 마스킹 처리
 */
export function maskPII(text: string, options: MaskingOptions = DEFAULT_OPTIONS): string {
    if (!text) return text;

    let masked = text;

    // 1. 전화번호 마스킹: 010-1234-5678 → 010-****-****
    if (options.maskPhones) {
        masked = masked.replace(/01[0-9]-\d{4}-\d{4}/g, '010-****-****');
        masked = masked.replace(/01[0-9]\d{8}/g, '010********');
    }

    // 2. 계좌번호 마스킹: 123-456-789012 → 123-***-******
    if (options.maskAccounts) {
        // 하이픈 있는 계좌
        masked = masked.replace(/(\d{3,4})-(\d{2,6})-(\d{4,8})/g, '$1-***-******');
        // 하이픈 없는 긴 숫자 (계좌로 추정)
        masked = masked.replace(/\b(\d{3})\d{6,}(\d{2})\b/g, '$1******$2');
    }

    // 3. 이름 마스킹: 홍길동 → 홍*동, 김철수 → 김*수
    if (options.maskNames) {
        // 한글 2-4글자 이름 (성 + 이름)
        masked = masked.replace(/([가-힣])([가-힣]{1,2})([가-힣])/g, '$1*$3');
        // 영문 이름 마스킹 (First Last → F*** L***)
        masked = masked.replace(/\b([A-Z])([a-z]+)\s+([A-Z])([a-z]+)\b/g, '$1*** $3***');
    }

    // 4. 상세주소 마스킹: 101동 1502호 → ***동 ***호
    if (options.maskAddresses) {
        masked = masked.replace(/\d+동\s*\d+호/g, '***동 ***호');
        masked = masked.replace(/\d+층\s*\d+호/g, '***층 ***호');
        // 상세 도로명 주소 마스킹
        masked = masked.replace(/(\d+)(번길|로)\s*\d+/g, '***$2 ***');
    }

    // 5. 이메일 마스킹: example@email.com → ex***@email.com
    if (options.maskEmails) {
        masked = masked.replace(/([a-zA-Z0-9]{2})[a-zA-Z0-9._%+-]*@([a-zA-Z0-9._-]+)/g, '$1***@$2');
    }

    return masked;
}

/**
 * JSON 객체 내의 모든 문자열 값에서 PII 마스킹
 */
export function maskPIIInObject(obj: any, options: MaskingOptions = DEFAULT_OPTIONS): any {
    if (obj === null || obj === undefined) return obj;

    if (typeof obj === 'string') {
        return maskPII(obj, options);
    }

    if (Array.isArray(obj)) {
        return obj.map(item => maskPIIInObject(item, options));
    }

    if (typeof obj === 'object') {
        const masked: Record<string, any> = {};
        for (const [key, value] of Object.entries(obj)) {
            // 특정 필드는 완전히 마스킹
            if (['account', 'virtualAccount', 'phone', 'contact'].includes(key)) {
                if (typeof value === 'string') {
                    masked[key] = maskPII(value, options);
                } else {
                    masked[key] = value;
                }
            } else {
                masked[key] = maskPIIInObject(value, options);
            }
        }
        return masked;
    }

    return obj;
}

/**
 * Few-Shot 예제용 마스킹된 데이터 생성
 */
export function generateMaskedFewShotExample(
    originalText: string,
    classifiedData: any,
    userFeedback: string
): string {
    const maskedText = maskPII(originalText);
    const maskedData = maskPIIInObject(classifiedData);

    return `
Example - User Verified:
Input: "${maskedText.slice(0, 300).replace(/"/g, '\\"')}${originalText.length > 300 ? '...' : ''}"
Correct Output: ${JSON.stringify(maskedData)}
Context: ${userFeedback}
---`;
}
