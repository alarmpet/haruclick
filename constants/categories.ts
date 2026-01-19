export type CategoryGroupType = 'fixed_expense' | 'variable_expense' | 'income' | 'asset_transfer';

export interface CategorySpec {
    group: CategoryGroupType;
    category: string;
    subCategories: string[];
}

export const CATEGORY_MAP: Record<string, CategorySpec> = {
    // === Fixed Expense ===
    '주거/통신/광열': {
        group: 'fixed_expense',
        category: '주거/통신/광열',
        subCategories: ['주거/관리비', '통신비', '전기/가스/수도']
    },
    '비소비지출/금융': {
        group: 'fixed_expense',
        category: '비소비지출/금융',
        subCategories: ['이자/세금', '보험', '경조사', '기부']
    },

    // === Variable Expense ===
    '식비': {
        group: 'variable_expense',
        category: '식비',
        subCategories: ['식료품', '외식/배달', '카페/베이커리']
    },
    '교통/차량': {
        group: 'variable_expense',
        category: '교통/차량',
        subCategories: ['대중교통', '자차/유지', '주유', '택시']
    },
    '문화/여가': {
        group: 'variable_expense',
        category: '문화/여가',
        subCategories: ['OTT/구독', '여행', '문화생활', '게임']
    },
    '쇼핑/생활': {
        group: 'variable_expense',
        category: '쇼핑/생활',
        subCategories: ['온라인', '오프라인', '생활용품']
    },
    '의료/건강': {
        group: 'variable_expense',
        category: '의료/건강',
        subCategories: ['병원', '약국', '건강식품']
    },
    '교육': {
        group: 'variable_expense',
        category: '교육',
        subCategories: ['학원/과외', '서적', '온라인강의']
    },
    '인맥': {
        group: 'variable_expense',
        category: '인맥',
        subCategories: ['경조사', '선물', '모임']
    },
    '기타': {
        group: 'variable_expense',
        category: '기타',
        subCategories: ['기타', '미분류']
    },

    // === Income ===
    '수입': {
        group: 'income',
        category: '수입',
        subCategories: ['월급', '용돈', '금융수입', '기타'] // Expanded subcategories based on income_type columns
    },

    // === Asset Transfer ===
    '이체': {
        group: 'asset_transfer',
        category: '이체',
        subCategories: ['자산인출', '저축', '투자']
    }
};

// UI Helpers
export const CATEGORY_GROUPS: { label: string; value: CategoryGroupType }[] = [
    { label: '고정지출 (매월 발생)', value: 'fixed_expense' },
    { label: '변동지출 (생활비)', value: 'variable_expense' },
    { label: '수입', value: 'income' },
    { label: '이체/자산', value: 'asset_transfer' }
];

export const getReviewCategoryList = (group?: CategoryGroupType) => {
    return Object.values(CATEGORY_MAP).filter(c => !group || c.group === group);
};

// For backward compatibility / prompt generation
export const APP_CATEGORIES: Record<string, string[]> = Object.values(CATEGORY_MAP).reduce((acc, curr) => {
    acc[curr.category] = curr.subCategories;
    return acc;
}, {} as Record<string, string[]>);
