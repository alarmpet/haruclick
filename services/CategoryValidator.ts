/**
 * CategoryValidator.ts
 * 카테고리/서브카테고리 정합성 검증 레이어
 * 저장 전 및 AI 결과 매핑 시 표준 카테고리로 정규화
 */

import { CATEGORY_MAP, CategoryGroupType } from '../constants/categories';

export interface ValidatedCategory {
    category: string;
    subCategory: string | null;
    categoryGroup: CategoryGroupType;
}

// AI가 반환할 수 있는 비표준 카테고리 → 표준 카테고리 매핑
const CATEGORY_ALIASES: Record<string, string> = {
    // 식비 관련
    '음식': '식비',
    '음식비': '식비',
    '식사': '식비',
    '배달': '식비',
    '카페': '식비',
    '외식': '식비',
    'food': '식비',

    // 교통 관련
    '교통비': '교통/차량',
    '교통': '교통/차량',
    '차량': '교통/차량',
    '주유': '교통/차량',
    'transport': '교통/차량',

    // 쇼핑 관련
    '쇼핑': '쇼핑/생활',
    '생활': '쇼핑/생활',
    '생활용품': '쇼핑/생활',
    'shopping': '쇼핑/생활',

    // 문화/여가 관련
    '문화': '문화/여가',
    '여가': '문화/여가',
    '엔터테인먼트': '문화/여가',
    '구독': '문화/여가',
    'entertainment': '문화/여가',

    // 의료 관련
    '의료': '의료/건강',
    '건강': '의료/건강',
    '병원': '의료/건강',
    '약국': '의료/건강',
    'medical': '의료/건강',

    // 주거 관련
    '주거': '주거/통신/광열',
    '통신': '주거/통신/광열',
    '공과금': '주거/통신/광열',
    '관리비': '주거/통신/광열',
    'utility': '주거/통신/광열',

    // 교육 관련
    '학원': '교육',
    '서적': '교육',
    'education': '교육',

    // 금융 관련
    '금융': '비소비지출/금융',
    '보험': '비소비지출/금융',
    '세금': '비소비지출/금융',
    'finance': '비소비지출/금융',

    // 인맥 관련
    '경조사': '인맥',
    '축의금': '인맥',
    '조의금': '인맥',
    '선물': '인맥',
    '모임': '인맥',
    'social': '인맥',

    // 수입 관련
    '월급': '수입',
    '급여': '수입',
    '용돈': '수입',
    'income': '수입',

    // 이체 관련
    '저축': '이체',
    '투자': '이체',
    'transfer': '이체',
};

// 서브카테고리 별칭 매핑
const SUB_CATEGORY_ALIASES: Record<string, string> = {
    // 식비 서브카테고리
    '커피': '카페/베이커리',
    '카페': '카페/베이커리',
    '베이커리': '카페/베이커리',
    '배달': '외식/배달',
    '외식': '외식/배달',
    '마트': '식료품',
    '장보기': '식료품',

    // 인맥 서브카테고리
    '결혼': '경조사',
    '장례': '경조사',
    '축의금': '경조사',
    '조의금': '경조사',
    '부조': '경조사',
};

/**
 * 카테고리를 정규화 (별칭 → 표준 카테고리)
 */
function normalizeCategory(rawCategory: string | undefined): string {
    if (!rawCategory) return '기타';

    const trimmed = rawCategory.trim().toLowerCase();

    // 1. 정확히 일치하는 표준 카테고리 확인
    if (CATEGORY_MAP[rawCategory]) {
        return rawCategory;
    }

    // 2. 별칭 매핑 확인
    for (const [alias, standard] of Object.entries(CATEGORY_ALIASES)) {
        if (trimmed === alias.toLowerCase() || trimmed.includes(alias.toLowerCase())) {
            return standard;
        }
    }

    // 3. 부분 일치 확인 (CATEGORY_MAP 키)
    for (const key of Object.keys(CATEGORY_MAP)) {
        if (trimmed.includes(key.toLowerCase()) || key.toLowerCase().includes(trimmed)) {
            return key;
        }
    }

    return '기타';
}

/**
 * 서브카테고리를 정규화
 */
function normalizeSubCategory(
    rawSubCategory: string | undefined,
    validSubCategories: string[]
): string | null {
    if (!rawSubCategory) return null;

    const trimmed = rawSubCategory.trim();

    // 1. 정확히 일치하는 서브카테고리 확인
    if (validSubCategories.includes(trimmed)) {
        return trimmed;
    }

    // 2. 별칭 매핑 확인
    const aliasResult = SUB_CATEGORY_ALIASES[trimmed.toLowerCase()];
    if (aliasResult && validSubCategories.includes(aliasResult)) {
        return aliasResult;
    }

    // 3. 부분 일치 확인
    for (const validSub of validSubCategories) {
        if (
            trimmed.toLowerCase().includes(validSub.toLowerCase()) ||
            validSub.toLowerCase().includes(trimmed.toLowerCase())
        ) {
            return validSub;
        }
    }

    return null;
}

/**
 * 카테고리와 서브카테고리를 검증하고 정규화
 * @param category 원본 카테고리
 * @param subCategory 원본 서브카테고리
 * @returns 검증된 카테고리 정보
 */
export function validateCategory(
    category: string | undefined,
    subCategory: string | undefined
): ValidatedCategory {
    // 1. 카테고리 정규화
    const normalizedCategory = normalizeCategory(category);

    // 2. CATEGORY_MAP에서 정보 조회
    const categorySpec = CATEGORY_MAP[normalizedCategory];

    if (!categorySpec) {
        // 기타로 폴백
        return {
            category: '기타',
            subCategory: null,
            categoryGroup: 'variable_expense'
        };
    }

    // 3. 서브카테고리 정규화
    const normalizedSubCategory = normalizeSubCategory(
        subCategory,
        categorySpec.subCategories
    );

    return {
        category: normalizedCategory,
        subCategory: normalizedSubCategory,
        categoryGroup: categorySpec.group
    };
}

/**
 * 카테고리가 유효한지 확인
 */
export function isValidCategory(category: string | undefined): boolean {
    if (!category) return false;
    return CATEGORY_MAP[category] !== undefined;
}

/**
 * 서브카테고리가 해당 카테고리에 유효한지 확인
 */
export function isValidSubCategory(
    category: string,
    subCategory: string | undefined
): boolean {
    if (!subCategory) return true; // null은 허용
    const spec = CATEGORY_MAP[category];
    if (!spec) return false;
    return spec.subCategories.includes(subCategory);
}
