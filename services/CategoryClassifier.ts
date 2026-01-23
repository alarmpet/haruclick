/**
 * CategoryClassifier.ts
 * 가맹점명 기반 자동 카테고리 분류 서비스 (API 비용 0원)
 */

import { CATEGORY_MAP } from '../constants/categories';

// New Category Types based on constants/categories.ts
export type ExpenseCategory = keyof typeof CATEGORY_MAP | '기타';

// 우선순위 배열: 충돌 시 앞쪽 카테고리 우선
const PRIORITY_ORDER = [
    '인맥',           // 경조사 최우선
    '의료/건강',      // 병원 키워드 충돌 방지
    '식비',
    '교통/차량',
    '주거/통신/광열',
    '문화/여가',
    '쇼핑/생활',
    '교육',
    '비소비지출/금융',
    '기타'
];

// 카테고리별 키워드 매핑 (확장됨)
const CATEGORY_KEYWORDS: Record<string, string[]> = {
    '인맥': [
        '축의금', '조의금', '부조', '선물', '모임', '경조사', '부의금', '화환'
    ],
    '의료/건강': [
        '병원', '약국', '의원', '치과', '한의원', '헬스', '클리닉', '정형외과', '내과', '피부과'
    ],
    '식비': [
        // 카페 (영문 포함)
        '스타벅스', 'starbucks', '메가커피', '투썸', '이디야', '카페', '커피', 'coffee',
        '배스킨', '던킨', '빽다방', '컴포즈', '할리스', '폴바셋', '블루보틀',
        // 식당/배달
        '맥도날드', 'mcdonald', '버거킹', 'burgerking', '롯데리아', 'kfc',
        '식당', '김밥', '치킨', '피자', '배달', '요기요', '쿠팡이츠', '배민',
        // 식료품/마트
        '이마트', 'emart', '홈플러스', '롯데마트', '하나로마트', '마트',
        '편의점', 'GS25', 'CU', '세븐일레븐', '7-eleven', '미니스톱'
    ],
    '교통/차량': [
        '택시', '카카오T', 'kakao', '타다', '버스', '지하철', '코레일', 'korail',
        '주유', 'GS칼텍스', 'SK에너지', 'S-OIL', '오일뱅크', '주차', '톨게이트', '하이패스'
    ],
    '주거/통신/광열': [
        '관리비', '도시가스', '한전', '전기', '수도', 'SKT', 'KT', 'LGU', 'LG유플러스',
        '인터넷', '가스', '통신비', '월세', '전세'
    ],
    '문화/여가': [
        'CGV', '롯데시네마', '메가박스', '넷플릭스', 'netflix', '유튜브', 'youtube',
        '티빙', '웨이브', '왓챠', '멜론', '스포티파이', 'spotify',
        '여행', '숙소', '야놀자', '여기어때', '골프', 'PC방', '노래방'
    ],
    '쇼핑/생활': [
        '쿠팡', 'coupang', '네이버페이', '다이소', '올리브영', '백화점', '아울렛',
        '컬리', '무신사', '지그재그', '에이블리', '오늘의집', '이케아', 'ikea',
        // 간편결제 (결제수단)
        '삼성페이', '애플페이', '제로페이', '페이코', 'payco', '토스', 'toss'
    ],
    '교육': [
        '학원', '강의', '서적', '교보문고', '알라딘', '예스24', '인강', '클래스101'
    ],
    '비소비지출/금융': [
        '이자', '세금', '보험', '기부', '은행', '카드', '대출', '적금', '펀드'
    ],
    '기타': []
};

/**
 * 가맹점명으로 카테고리 자동 분류 (우선순위 적용)
 * @param merchantName 가맹점명
 * @returns 분류된 카테고리
 */
export function classifyMerchant(merchantName: string): string {
    if (!merchantName) return '기타';

    const normalizedName = merchantName.toLowerCase().replace(/\s/g, '');

    // 우선순위 순서대로 검사
    for (const category of PRIORITY_ORDER) {
        const keywords = CATEGORY_KEYWORDS[category];
        if (!keywords) continue;

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

