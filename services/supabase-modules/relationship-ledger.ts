import { supabase, getCached, setCache, withInflight } from './client';
import { showError } from '../errorHandler';

export type RelationshipSource = 'events' | 'ledger' | 'bank_transactions';

export interface RelationshipTransaction {
    id: string;
    source: RelationshipSource;
    personName: string;
    relation?: string;
    amount: number;
    isReceived: boolean;
    date: string; // YYYY-MM-DD
    type?: string;
    raw?: any;
}

export interface RelationshipSummary {
    personName: string;
    relation: string;
    totalGiven: number;
    totalReceived: number;
    transactionCount: number;
    lastTransactionDate: string;
}

const CEREMONY_TYPES = new Set(['wedding', 'funeral', 'birthday', 'gift']);
const RELATION_SUBCATEGORIES = new Set(['경조사', '선물', '모임']);
const KEYWORDS = [
    '결혼', '혼인', '청첩장', '축의', '축의금',
    '장례', '부고', '조의', '부의', '부의금', '조문', '발인', '상가',
    '돌잔치', '돌', '백일',
    '생일', '생신', '선물'
];
const EXCLUDED_LEDGER_CATEGORIES = new Set(['수입', '입금', '이체', '저축']);
const EXCLUDED_LEDGER_GROUPS = new Set(['income', 'asset_transfer']);
const SOURCE_PRIORITY: Record<RelationshipSource, number> = {
    events: 3,
    bank_transactions: 2,
    ledger: 1
};

function toDateOnly(value?: string | null): string {
    if (!value) return '';
    const [date] = value.split('T');
    return date || '';
}

function addDays(dateStr: string, days: number): string {
    const date = new Date(dateStr);
    if (Number.isNaN(date.getTime())) return dateStr;
    date.setDate(date.getDate() + days);
    return date.toISOString().split('T')[0];
}

function normalizeName(name?: string | null): string {
    if (!name) return '';
    return name.replace(/\s+/g, '').trim();
}

function hasKeyword(text: string): boolean {
    if (!text) return false;
    return KEYWORDS.some(keyword => text.includes(keyword));
}

function buildKeywordText(parts: Array<string | null | undefined>): string {
    return parts.filter(Boolean).join(' ');
}

function isValidAmount(amount: any): amount is number {
    return typeof amount === 'number' && amount > 0;
}

function dedupeTransactions(items: RelationshipTransaction[]): RelationshipTransaction[] {
    const map = new Map<string, RelationshipTransaction>();

    items.forEach((item) => {
        const normalizedName = normalizeName(item.personName);
        const nameKey = normalizedName && normalizedName !== '미지정' ? normalizedName : '';
        const amountKey = item.amount || 0;
        const dateKey = item.date || '';
        const base = nameKey
            ? `${nameKey}:${amountKey}`
            : `${item.source}:${normalizedName || '미지정'}:${amountKey}`;
        const candidateDates = dateKey ? [dateKey, addDays(dateKey, -1), addDays(dateKey, 1)] : [''];

        let existingKey: string | null = null;
        for (const candidate of candidateDates) {
            const key = `${base}:${candidate}`;
            if (map.has(key)) {
                existingKey = key;
                break;
            }
        }

        if (existingKey) {
            const existing = map.get(existingKey);
            if (existing && SOURCE_PRIORITY[item.source] > SOURCE_PRIORITY[existing.source]) {
                map.set(existingKey, item);
            }
        } else {
            map.set(`${base}:${dateKey}`, item);
        }
    });

    return Array.from(map.values());
}

async function fetchRelationshipTransactions(): Promise<RelationshipTransaction[]> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const cacheKey = `relationship_ledger_${user.id}`;
    const cached = getCached<RelationshipTransaction[]>(cacheKey);
    if (cached) return cached;

    return withInflight(cacheKey, async () => {
        const [eventsResult, ledgerResult, bankResult] = await Promise.all([
            supabase
                .from('events')
                .select('id, category, type, name, relation, event_date, amount, is_received, memo')
                .eq('user_id', user.id),
            supabase
                .from('ledger')
                .select('id, category, sub_category, category_group, merchant_name, amount, transaction_date, memo')
                .eq('user_id', user.id),
            supabase
                .from('bank_transactions')
                .select('id, transaction_type, sender_name, receiver_name, category, amount, transaction_date, memo')
                .eq('user_id', user.id)
        ]);

        if (eventsResult.error || ledgerResult.error || bankResult.error) {
            console.error('Error fetching relationship ledger data:', eventsResult.error, ledgerResult.error, bankResult.error);
            throw new Error('마음 보관함 데이터를 불러오지 못했습니다.');
        }

        const eventItems = (eventsResult.data || []).flatMap((item: any) => {
            const explicit = item.category === 'ceremony' || CEREMONY_TYPES.has(item.type);
            const keywordText = buildKeywordText([item.name, item.memo, item.type]);
            const keywordMatch = isValidAmount(item.amount) && hasKeyword(keywordText);

            if (!explicit && !keywordMatch) return [];

            return [{
                id: item.id,
                source: 'events' as const,
                personName: item.name || '미지정',
                relation: item.relation || '미지정',
                amount: item.amount || 0,
                isReceived: !!item.is_received,
                date: toDateOnly(item.event_date),
                type: item.type,
                raw: item
            }];
        });

        const ledgerItems = (ledgerResult.data || []).flatMap((item: any) => {
            const category = item.category || '';
            const subCategory = item.sub_category || '';
            const categoryGroup = item.category_group || '';
            const isExplicit = category === '인맥' || RELATION_SUBCATEGORIES.has(subCategory);
            const isExcluded = EXCLUDED_LEDGER_CATEGORIES.has(category) || EXCLUDED_LEDGER_GROUPS.has(categoryGroup);
            const keywordText = buildKeywordText([item.merchant_name, item.memo, category, subCategory]);
            const keywordMatch = !isExcluded && isValidAmount(item.amount) && hasKeyword(keywordText);

            if ((!isExplicit && !keywordMatch) || isExcluded) return [];

            return [{
                id: item.id,
                source: 'ledger' as const,
                personName: item.merchant_name || '미지정',
                relation: subCategory || category || '미지정',
                amount: item.amount || 0,
                isReceived: false,
                date: toDateOnly(item.transaction_date),
                type: subCategory || category,
                raw: item
            }];
        });

        const bankItems = (bankResult.data || []).flatMap((item: any) => {
            const category = item.category || '';
            const isExplicit = category === '인맥';
            const keywordText = buildKeywordText([item.sender_name, item.receiver_name, item.memo, category]);
            const keywordMatch = isValidAmount(item.amount) && hasKeyword(keywordText);

            if (!isExplicit && !keywordMatch) return [];

            const isReceived = item.transaction_type === 'deposit';
            const nameCandidate = isReceived ? item.sender_name : item.receiver_name;

            return [{
                id: item.id,
                source: 'bank_transactions' as const,
                personName: nameCandidate || '미지정',
                relation: category || '미지정',
                amount: item.amount || 0,
                isReceived,
                date: toDateOnly(item.transaction_date),
                type: item.transaction_type,
                raw: item
            }];
        });

        const combined = [...eventItems, ...ledgerItems, ...bankItems];
        const deduped = dedupeTransactions(combined);
        setCache(cacheKey, deduped);
        return deduped;
    }).catch((e: any) => {
        showError(e.message ?? '마음 보관함 조회 실패');
        return [];
    });
}

export async function getRelationshipLedgerSummary(): Promise<RelationshipSummary[]> {
    const items = await fetchRelationshipTransactions();
    const map = new Map<string, RelationshipSummary>();

    items.forEach((item) => {
        const normalized = normalizeName(item.personName);
        const key = normalized || '미지정';
        const current = map.get(key) || {
            personName: item.personName || '미지정',
            relation: item.relation || '미지정',
            totalGiven: 0,
            totalReceived: 0,
            transactionCount: 0,
            lastTransactionDate: item.date || ''
        };

        if (item.isReceived) {
            current.totalReceived += item.amount || 0;
        } else {
            current.totalGiven += item.amount || 0;
        }

        current.transactionCount += 1;

        if (item.date && (!current.lastTransactionDate || item.date > current.lastTransactionDate)) {
            current.lastTransactionDate = item.date;
        }

        if (current.relation === '미지정' && item.relation) {
            current.relation = item.relation;
        }

        map.set(key, current);
    });

    return Array.from(map.values());
}

export async function getRelationshipTransactions(personName: string): Promise<RelationshipTransaction[]> {
    const normalizedTarget = normalizeName(personName);
    const items = await fetchRelationshipTransactions();

    return items.filter((item) => {
        const normalizedItem = normalizeName(item.personName);
        if (!normalizedTarget) return item.personName === personName;
        return normalizedItem === normalizedTarget;
    }).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
}
