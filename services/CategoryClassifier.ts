/**
 * CategoryClassifier.ts
 * 가맹점명 기반 자동 카테고리 분류 서비스 (API 비용 0원)
 */

import { CATEGORY_MAP } from '../constants/categories';

// New Category Types based on constants/categories.ts
export type ExpenseCategory = keyof typeof CATEGORY_MAP | '기타';

// 카테고리별 키워드 매핑 (New System)
const CATEGORY_KEYWORDS: Record<string, string[]> = {
    '식비': [
        // 카페
        '스타벅스', '메가커피', '투썸', '이디야', '카페', '커피', '배스킨', '던킨',
        // 식당/배달
        '맥도날드', '버거킹', '식당', '김밥', '치킨', '피자', '배달', '요기요', '쿠팡이츠',
        // 식료품/마트
        '이마트', '홈플러스', '롯데마트', '하나로마트', '편의점', 'GS25', 'CU', '마트'
    ],
    '주거/통신/광열': [
        '관리비', '도시가스', '한전', '수도', 'SKT', 'KT', 'LGU', '인터넷', '가스'
    ],
    '교통/차량': [
        '택시', '카카오T', '버스', '지하철', '코레일', '주유', 'GS칼텍스', 'S-OIL', '주차'
    ],
    '문화/여가': [
        'CGV', '롯데시네마', '넷플릭스', '유튜브', '티빙', '멜론', '여행', '숙소', '야놀자', '골프', 'PC방'
    ],
    '쇼핑/생활': [
        '쿠팡', '네이버페이', '다이소', '올리브영', '백화점', '아울렛', '컬리', '무신사', '지그재그'
    ],
    '의료/건강': [
        '병원', '약국', '의원', '치과', '한의원', '헬스'
    ],
    '교육': [
        '학원', '강의', '서적', '교보문고', '알라딘'
    ],
    '비소비지출/금융': [
        '이자', '세금', '보험', '기부', '은행', '카드'
    ],
    '인맥': [
        '축의금', '조의금', '선물', '모임'
    ],
    '기타': []
};

/**
 * 가맹점명으로 카테고리 자동 분류
 * @param merchantName 가맹점명
 * @returns 분류된 카테고리
 */
export function classifyMerchant(merchantName: string): string {
    if (!merchantName) return '기타';

    const normalizedName = merchantName.toLowerCase().replace(/\s/g, '');

    for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
        for (const keyword of keywords) {
            const normalizedKeyword = keyword.toLowerCase().replace(/\s/g, '');
            if (normalizedName.includes(normalizedKeyword)) {
                return category;
            }
        }
    }

    return '기타';
}

/**
 * 카테고리별 이모지 반환
 */
export function getCategoryEmoji(category: string): string {
    const emojis: Record<string, string> = {
        '식비': '🍽️',
        '주거/통신/광열': '🏠',
        '교통/차량': '🚗',
        '문화/여가': '🎬',
        '쇼핑/생활': '🛍️',
        '의료/건강': '🏥',
        '교육': '📚',
        '비소비지출/금융': '💸',
        '인맥': '🤝',
        '기타': '📦'
    };
    return emojis[category] || '📦';
}

/**
 * 카테고리별 색상 반환
 */
export function getCategoryColor(category: string): string {
    const colors: Record<string, string> = {
        '식비': '#FF6B6B',
        '주거/통신/광열': '#4ECDC4',
        '교통/차량': '#3B82F6',
        '문화/여가': '#A855F7',
        '쇼핑/생활': '#F59E0B',
        '의료/건강': '#EF4444',
        '교육': '#6366F1',
        '비소비지출/금융': '#059669',
        '인맥': '#F472B6',
        '기타': '#6B7280'
    };
    return colors[category] || '#6B7280';
}

