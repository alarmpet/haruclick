import Constants from 'expo-constants';
import { supabase } from '../supabase';
import { getCurrentOcrLogger } from '../OcrLogger';
import { OCR_TEST_SAMPLES } from './TestSamples';

const PIPELINE_VERSION = "2.3.0-structured";

// Core Types (7) + Unknown
export type ScanType = 'GIFTICON' | 'INVITATION' | 'OBITUARY' | 'APPOINTMENT' | 'STORE_PAYMENT' | 'BANK_TRANSFER' | 'BILL' | 'SOCIAL' | 'RECEIPT' | 'TRANSFER' | 'UNKNOWN';

export interface BaseAnalysisResult {
    type: ScanType;
    subtype?: string;
    confidence: number;
    evidence: string[];
    warnings: string[];
    source?: 'SCREENSHOT' | 'PHOTO' | 'UNKNOWN';
    raw_text?: string;
    senderName?: string;
    date?: string;
    confidence_breakdown?: {
        ocr: number;
        struct: number;
        type: number;
        consistency: number;
    };
}

export interface GifticonResult extends BaseAnalysisResult { type: 'GIFTICON'; productName: string; brandName: string; estimatedPrice: number; expiryDate?: string; barcodeNumber?: string; redeemCode?: string; }
export interface InvitationResult extends BaseAnalysisResult { type: 'INVITATION'; eventDate: string; eventLocation: string; address?: string; eventType: 'wedding' | 'funeral' | 'birthday' | 'event'; mainName?: string; hostNames?: string[]; recommendedAmount?: number; recommendationReason?: string; relation?: string; accountNumber?: string; }
export interface ObituaryResult extends BaseAnalysisResult { type: 'OBITUARY'; deceased: string; relationship?: string; funeralLocation: string; eventDate: string; recommendedAmount?: number; }
export interface BankTransactionResult extends BaseAnalysisResult { type: 'BANK_TRANSFER'; amount: number; transactionType: 'deposit' | 'withdrawal'; targetName: string; balanceAfter?: number; bankName?: string; memo?: string; category?: string; subCategory?: string; isUtility?: boolean; }
export interface StorePaymentResult extends BaseAnalysisResult { type: 'STORE_PAYMENT'; merchant: string; amount: number; category?: string; subCategory?: string; date: string; paymentMethod?: string; approvalNumber?: string; memo?: string; }
export interface BillResult extends BaseAnalysisResult { type: 'BILL'; title: string; amount: number; dueDate?: string; virtualAccount?: string; }
export interface SocialResult extends BaseAnalysisResult { type: 'SOCIAL'; amount: number; location?: string; members: string[]; perPersonAmount?: number; }
export interface AppointmentResult extends BaseAnalysisResult { type: 'APPOINTMENT'; title: string; location: string; memo?: string; }
export interface UnknownResult extends BaseAnalysisResult { type: 'UNKNOWN'; }

export type ScannedData = GifticonResult | InvitationResult | ObituaryResult | BankTransactionResult | StorePaymentResult | BillResult | SocialResult | AppointmentResult | UnknownResult | ReceiptResult | TransferResult;
export interface ReceiptResult extends Omit<StorePaymentResult, 'type'> { type: 'RECEIPT'; } // Legacy alias
export interface TransferResult extends BaseAnalysisResult { type: 'TRANSFER'; amount: number; isReceived?: boolean; memo?: string; } // Legacy alias

const OPENAI_API_KEY = process.env.EXPO_PUBLIC_OPENAI_API_KEY ?? Constants.expoConfig?.extra?.EXPO_PUBLIC_OPENAI_API_KEY;

const APP_CATEGORIES: Record<string, string[]> = {
    '식비': ['식료품', '외식/배달', '카페/베이커리'],
    '주거/통신/광열': ['주거/관리비', '통신비', '전기/가스/수도'],
    '교통/차량': ['대중교통', '자차/유지', '주유', '택시'],
    '문화/여가': ['OTT/구독', '여행', '문화생활', '게임'],
    '쇼핑/생활': ['온라인', '오프라인', '생활용품'],
    '의료/건강': ['병원', '약국', '건강식품'],
    '교육': ['학원/과외', '서적', '온라인강의'],
    '비소비지출/금융': ['이자/세금', '보험', '경조사', '기부'],
    '인맥': ['경조사', '선물', '모임'],
    '기타': ['기타', '미분류'],
};

const CATEGORY_KEYS = Object.keys(APP_CATEGORIES);

const FEWSHOT_ALLOWED_KEYS = new Set<string>([
    'type',
    'subtype',
    'merchant_name',
    'amount',
    'date_or_datetime',
    'category',
    'confidence',
    'evidence',
    'source',
    'warnings',
    'direction',
    'counterparty',
    'bank_name',
    'balance',
    'event_type',
    'host_names',
    'address',
    'recommended_amount',
    'place_name',
    'title',
    'memo',
    'item_name',
    'brand',
    'expiry_date',
    'redeem_code',
    'bill_name',
    'due_date',
    'virtual_account',
    'total_amount',
    'per_person_amount',
    'members',
    'payment_method',
    'subCategory'
]);

function normalizeFewShotItems(example: any): any[] {
    if (!example) return [];
    let parsed = example;
    if (typeof example === 'string') {
        try {
            parsed = JSON.parse(example);
        } catch {
            return [];
        }
    }
    if (Array.isArray(parsed)) return parsed;
    if (parsed?.transactions && Array.isArray(parsed.transactions)) return parsed.transactions;
    if (typeof parsed === 'object') return [parsed];
    return [];
}

function sanitizeFewShotExamples(examples: any[]): any[] {
    const sanitized: any[] = [];
    for (const example of examples) {
        const items = normalizeFewShotItems(example);
        for (const item of items) {
            if (!item || typeof item !== 'object') continue;
            const filtered: Record<string, any> = {};
            for (const key of Object.keys(item)) {
                if (FEWSHOT_ALLOWED_KEYS.has(key)) {
                    filtered[key] = item[key];
                }
            }
            if (Object.keys(filtered).length > 0) {
                sanitized.push(filtered);
            }
        }
    }
    return sanitized;
}

const COMMON_TRANSACTION_PROPERTIES = {
    confidence: { type: "number", minimum: 0, maximum: 1 },
    evidence: { type: "array", items: { type: "string" } },
    warnings: { type: "array", items: { type: "string" } },
    source: { type: "string", enum: ["SCREENSHOT", "PHOTO", "UNKNOWN"] },
    subtype: { type: "string" },
    category: { type: "string" },
    subCategory: { type: "string" },
    date_or_datetime: { type: "string" },
    merchant_name: { type: "string" },
    payment_method: { type: "string" },
    amount: { type: "number" },
    direction: { type: "string", enum: ["in", "out"] },
    counterparty: { type: "string" },
    bank_name: { type: "string" },
    balance: { type: "number" },
    event_type: { type: "string" },
    host_names: { type: "array", items: { type: "string" } },
    address: { type: "string" },
    recommended_amount: { type: "number" },
    place_name: { type: "string" },
    title: { type: "string" },
    memo: { type: "string" },
    item_name: { type: "string" },
    brand: { type: "string" },
    expiry_date: { type: "string" },
    redeem_code: { type: "string" },
    bill_name: { type: "string" },
    due_date: { type: "string" },
    virtual_account: { type: "string" },
    total_amount: { type: "number" },
    per_person_amount: { type: "number" },
    members: { type: "array", items: { type: "string" } }
};

// OpenAI Structured Output - strict: false로 선택적 필드 허용
const OCR_RESPONSE_SCHEMA = {
    name: "ocr_transactions",
    strict: false,
    schema: {
        type: "object",
        properties: {
            transactions: {
                type: "array",
                items: {
                    type: "object",
                    properties: {
                        type: {
                            type: "string",
                            enum: ["GIFTICON", "INVITATION", "OBITUARY", "APPOINTMENT", "STORE_PAYMENT", "BANK_TRANSFER", "BILL", "SOCIAL", "UNKNOWN"]
                        },
                        confidence: { type: "number" },
                        evidence: { type: "array", items: { type: "string" } },
                        warnings: { type: "array", items: { type: "string" } },
                        source: { type: "string", enum: ["SCREENSHOT", "PHOTO", "UNKNOWN"] },
                        subtype: { type: "string" },
                        category: { type: "string" },
                        subCategory: { type: "string" },
                        date_or_datetime: { type: "string" },
                        merchant_name: { type: "string" },
                        payment_method: { type: "string" },
                        amount: { type: "number" },
                        direction: { type: "string", enum: ["in", "out"] },
                        counterparty: { type: "string" },
                        bank_name: { type: "string" },
                        balance: { type: "number" },
                        event_type: { type: "string" },
                        host_names: { type: "array", items: { type: "string" } },
                        address: { type: "string" },
                        recommended_amount: { type: "number" },
                        place_name: { type: "string" },
                        title: { type: "string" },
                        memo: { type: "string" },
                        item_name: { type: "string" },
                        brand: { type: "string" },
                        expiry_date: { type: "string" },
                        redeem_code: { type: "string" },
                        bill_name: { type: "string" },
                        due_date: { type: "string" },
                        virtual_account: { type: "string" },
                        total_amount: { type: "number" },
                        per_person_amount: { type: "number" },
                        members: { type: "array", items: { type: "string" } },
                        deceased_name: { type: "string" },
                        relationship: { type: "string" }
                    },
                    required: ["type", "confidence"]
                }
            }
        },
        required: ["transactions"]
    }
} as const;

const RESPONSE_FORMAT = { type: "json_schema", json_schema: OCR_RESPONSE_SCHEMA } as const;

type PromptMode = 'text' | 'vision';

const CATEGORY_GUIDE = `
CATEGORY HIERARCHY (Strictly follow this):
${JSON.stringify(APP_CATEGORIES, null, 2)}

CLASSIFICATION RULES:
1. Determine the 'category' (Key) based on the merchant or purpose.
2. Determine the 'subCategory' (Value) from the list belonging to that key.

MERCHANT MAPPING GUIDE (Priority):
- **OTT/구독 (문화/여가)**: Netflix(넷플릭스), Tving(티빙), Coupang Play(쿠팡플레이), Wavve(웨이브), Disney+(디즈니플러스), Watcha(왓챠), YouTube Premium(유튜브), Melon(멜론)
- **여행 (문화/여가)**: Yanolja(야놀자), Yeogi(여기어때), Airbnb(에어비앤비), Agoda(아고다), Trip.com(트립닷컴), Hotels.com(호텔스닷컴)
- **온라인 (쇼핑/생활)**: Coupang(쿠팡), 11st(11번가), Gmarket(G마켓/옥션), SSG, Naver Pay(네이버페이), Musinsa(무신사), CJ OnStyle, Kurly(마켓컬리), AliExpress
- **오프라인 (쇼핑/생활)**: Daiso(다이소), Olive Young(올리브영), Hi-Mart(하이마트)
- **카페/베이커리 (식비)**: Starbucks(스타벅스), Mega Coffee(메가커피), Twosome(투썸플레이스), Compose(컴포즈), Paik's(빽다방), Ediya(이디야), Paris Baguette(파리바게뜨), Tous Les Jours(뚜레쥬르), Baskin Robbins(배스킨라빈스), Gongcha(공차)
- **식료품 (식비)**: GS25, CU, Seven Eleven(세븐일레븐), Emart24(이마트24), Emart(이마트), Homeplus(홈플러스), Costco(코스트코), Hanaro Mart(농협하나로마트)
- **외식/배달 (식비)**: Baemin(배달의민족), Yogiyo(요기요), Coupang Eats(쿠팡이츠), BHC, BBQ, Kyochon(교촌), Goobne(굽네), Lotteria(롯데리아), Mom's Touch(맘스터치)
- **주유 (교통/차량)**: GS Caltex(GS칼텍스), SK Energy(SK에너지), S-OIL, HD Hyundai Oilbank, Station(주유소)
- **문화생활 (문화/여가)**: CGV, Lotte Cinema(롯데시네마), Megabox(메가박스), Golfzon(골프존파크)
- **자차/유지 (교통/차량)**: Auto Q(오토큐), T'station, Car Insurance(자동차보험)
- **통신비 (주거/통신/광열)**: SKT, KT, LGU+
`;

function buildSystemPrompt(options: {
    referenceDate: string;
    dayOfWeek: string;
    fewShotExamples: string;
    mode: PromptMode;
}): string {
    const inputHint = options.mode === 'text'
        ? 'Input is OCR text. Use only the provided text.'
        : 'Input is an image. Extract text from the image before analysis.';

    return `
You are a financial AI expert for Korean financial and event documents.
${inputHint}

OUTPUT
- Return ONLY valid JSON that matches the schema.
- Root object: {"transactions":[...]}.
- Each item MUST include "type" and "confidence" (0.0-1.0).
- Omit unknown fields; do not use null.
- If unsure, return type "UNKNOWN" with warnings like "insufficient_fields".

MANDATORY FIELDS
- STORE_PAYMENT: amount
- BANK_TRANSFER: amount + direction (in/out)
- INVITATION: date_or_datetime + place_name
- APPOINTMENT: date_or_datetime + place_name + title

EXTRACTION RULES
- Evidence: include short raw snippets (2-6 words) that justify type/amount/date.
- Amount conflict: prefer amounts near "승인금액", "합계", "총액"; else largest; else last.
- Bill amounts: if both "납기 내 금액" and "납기 후 금액" exist, use the within-due amount.
- Do not treat installment months like "03개월" as amounts/dates; if "취소" or a negative sign appears, make the amount negative.
- Clean merchant_name noise like "(주)" or "*" characters.
- If text includes "택배"/"배송", classify as APPOINTMENT and put tracking numbers in memo when present.
- If text includes "병원" with "빈소/발인/부고/장례", treat as INVITATION (funeral); if "예약/내원/진료/검진", treat as APPOINTMENT.
- If text includes "납입/납부/보험료" AND "가상계좌/입금가상계좌", treat as BANK_TRANSFER with direction="out" even if "입금" appears.
- Appointment keywords: 병원, 진료, 진료예약, 예약, 예약일자, 예약시간, 진료과, 검사, 검진, 외래, 접수, 내원.
  If both APPOINTMENT and INVITATION are possible, choose APPOINTMENT.
- Invitation name rule: patterns like "장남/장녀/차남/차녀/아들/딸 NAME" or "신랑/신부 NAME" -> host_names.
- Phone vs account: numbers starting with "010-" are phone numbers, not account numbers.
- Meeting Account (모임통장):
  * If text contains "거래한 모임원: NAME", extract NAME as 'counterparty'.
  * If "모임통장" appears, look for "보낸분: NAME" or "입금자: NAME" or "모임원: NAME" for 'counterparty'.
  * Treat "모임금고", "모임통장" as 'bank_name' if no other bank is specified.
- Multi-item: if multiple payment/transfer blocks appear, return one transaction per block in order.
- SMS KEYWORD RULES (STRICT):
  * "결제", "카드", "승인" -> STORE_PAYMENT (or BANK_TRANSFER direction="out"). NEVER classify as deposit.
  * "입금", "저금", "받음" -> BANK_TRANSFER direction="in".
  * "모임 카드" context -> STORE_PAYMENT (Expense). "모임통장" with "입금/저금" -> BANK_TRANSFER (Income).

DATE NORMALIZATION
- Combine split date/time into "YYYY-MM-DD HH:mm".
- If year is missing, assume the current year.

⚠️ TIMELINE RECONSTRUCTION RULE (CRITICAL):

The input text is pre-processed into BLOCKS (e.g., [BLOCK_1]).
Some blocks have resolved date labels:
- 'HEADER_RESOLVED_DATETIME': A relative header (e.g. "2 days ago") converted to absolute time.
- 'ANCHOR_ABSOLUTE_DATETIME': An explicit date found in the text.

✅ MANDATORY RULE:
If a block has 'HEADER_RESOLVED_DATETIME' or 'ANCHOR_ABSOLUTE_DATETIME',
you MUST use that value as the true date/time for that block.
Do NOT re-interpret relative dates using TODAY. Trust the labels.

Example:
Input:
[BLOCK_1]
HEADER_RESOLVED_DATETIME: 2026-01-08 15:32
TEXT: (그저께) 15:32 ...

Output:
Date for this block is **2026-01-08 15:32**.

If no label exists, follow the previous Contextual Anchor logic (check nearby blocks).

⚠️ MESSAGE GROUPING RULE:

If OCR text contains multiple messages or transactions,
you MUST segment them into logical message blocks.

Each block may have:
- its own explicit date (ANCHOR)
- its own relative time expressions

Relative dates MUST be resolved within the SAME block.
Never reuse an anchor date from a different block.

⚠️ DATE OUTPUT REQUIREMENT:

For every extracted transaction,
you MUST output the final resolved date as an absolute date
in ISO format (YYYY-MM-DD or YYYY-MM-DD HH:mm).

Do NOT output relative expressions.

CATEGORY GUIDE
CATEGORIES CONFIGURATION
- category: MUST be one of the top-level keys: ${CATEGORY_KEYS.join(', ')}
- subCategory: MUST be one of the values in the corresponding list.
${CATEGORY_GUIDE}

FEW-SHOT
${options.fewShotExamples}
`;
}

const fetchDynamicFewShots = async (): Promise<any[]> => {
    console.time('[OpenAI] fetchDynamicFewShots');
    try {
        // DB 호출이 3초 이상 걸리면 포기하고 빈 배열 반환 (분석 자체를 막지 않기 위함)
        const dbPromise = supabase
            .from('approved_fewshots')
            .select('output_json')
            .eq('is_active', true)
            .order('priority', { ascending: false })
            .limit(15)
            .then(res => res.data?.map(d => d.output_json) || []);

        const timeoutPromise = new Promise<any[]>((resolve) =>
            setTimeout(() => {
                console.warn('[OpenAI] DB Fetch Timeout (3s) -> Fallback to static');
                resolve([]);
            }, 3000)
        );

        return await Promise.race([dbPromise, timeoutPromise]);
    } catch (e) {
        console.warn('Failed to fetch dynamic few-shots:', e);
        return [];
    } finally {
        console.timeEnd('[OpenAI] fetchDynamicFewShots');
    }
};

const getFewShotPrompt = async (): Promise<string> => {
    // 1. Get Dynamic (High Priority) - 최대 15개
    const dynamic = await fetchDynamicFewShots();

    // 2. Get Static (Fill remaining slots up to 20 total)
    // Filter out types that we already have dynamically (optional optimization, but let's just mix)
    const needed = Math.max(0, 20 - dynamic.length);
    let staticSamples: any[] = [];

    if (needed > 0) {
        const shuffled = [...OCR_TEST_SAMPLES].sort(() => 0.5 - Math.random());
        staticSamples = shuffled.slice(0, Math.min(needed, 10)); // Static은 최대 10개
    }

    const combined = [...dynamic, ...staticSamples];
    const sanitized = sanitizeFewShotExamples(combined);
    return JSON.stringify(sanitized, null, 2);
};

// ========================================
// 💾 DB Cache Helpers (Same as before)
// ========================================
// (Keeping cache logic consistent)
async function getDbCache(imageHash: string): Promise<ScannedData | null> {
    try {
        const { data, error } = await supabase.from('ocr_cache').select('*').eq('image_hash', imageHash).eq('pipeline_version', PIPELINE_VERSION).gt('expires_at', new Date().toISOString()).single();
        if (error || !data) return null;
        await supabase.from('ocr_cache').update({ last_accessed_at: new Date() }).eq('image_hash', imageHash);
        return data.result as ScannedData;
    } catch (e) { return null; }
}
async function saveDbCache(imageHash: string, result: ScannedData, costUsd: number = 0, source: 'SCREENSHOT' | 'PHOTO' = 'PHOTO'): Promise<void> {
    try {
        let expireDays = 7;
        if (source === 'SCREENSHOT' && result.confidence > 0.9) expireDays = 30;
        if (result.type === 'UNKNOWN') expireDays = 1;
        const expiresAt = new Date(); expiresAt.setDate(expiresAt.getDate() + expireDays);
        await supabase.from('ocr_cache').upsert({ image_hash: imageHash, result, doc_type: result.type, confidence: result.confidence, source, pipeline_version: PIPELINE_VERSION, cost_total_usd: costUsd, expires_at: expiresAt.toISOString(), last_accessed_at: new Date().toISOString() });
    } catch (e) { console.warn('Cache save failed:', e); }
}
function simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < Math.min(str.length, 1000); i++) { hash = ((hash << 5) - hash) + str.charCodeAt(i); hash = hash & hash; }
    return hash.toString(16) + "-" + str.length;
}

function collectStrings(input: any, out: string[]) {
    if (!input) return;
    if (typeof input === 'string') {
        out.push(input);
        return;
    }
    if (Array.isArray(input)) {
        input.forEach((item) => collectStrings(item, out));
        return;
    }
    if (typeof input === 'object') {
        Object.values(input).forEach((value) => collectStrings(value, out));
    }
}

function isVirtualAccountPaymentText(text: string): boolean {
    const compact = (text || '').replace(/\s+/g, '');
    const hasPaymentIntent = /(납입|납부|보험료|보험금|청구|납입할)/.test(compact);
    const hasVirtualAccount = /(가상계좌|입금가상계좌|가상계좌번호)/.test(compact);
    return hasPaymentIntent && hasVirtualAccount;
}

function isInsuranceText(text: string): boolean {
    const compact = (text || '').replace(/\s+/g, '');
    return /(보험|보험료|손해보험|생명보험|화재보험)/.test(compact);
}

function normalizeDateTime(raw?: string): string | undefined {
    if (!raw) return raw;
    let text = raw.trim();
    text = text.replace(/^[^\d]+/, '');

    const match = text.match(/(\d{2,4}[./-]\d{1,2}[./-]\d{1,2})(?:[ Tt\-]*(\d{1,2}:\d{2}))?/);
    if (!match) return text;

    let datePart = match[1].replace(/[./]/g, '-');
    const timePart = match[2];
    if (/^\d{2}-/.test(datePart) && !/^\d{4}-/.test(datePart)) {
        datePart = `20${datePart}`;
    }

    if (timePart) {
        return `${datePart} ${timePart}`;
    }
    return datePart;
}

function normalizeInvitationEventType(raw?: string): InvitationResult['eventType'] {
    const value = (raw || '').toLowerCase();
    if (value.includes('wedding') || value.includes('결혼')) return 'wedding';
    if (value.includes('funeral') || value.includes('장례')) return 'funeral';
    if (value.includes('birthday') || value.includes('생일') || value.includes('돌잔치')) return 'birthday';
    return 'event';
}

function extractInvitationMainNames(text: string): string[] {
    if (!text) return [];
    const names: string[] = [];
    const patterns = [
        /(장남|장녀|차남|차녀|막내아들|막내딸|아들|딸)\s*([가-힣]{2,4})/g,
        /신랑\s*[:：]?\s*([가-힣]{2,4})/g,
        /신부\s*[:：]?\s*([가-힣]{2,4})/g
    ];
    for (const pattern of patterns) {
        let match: RegExpExecArray | null;
        while ((match = pattern.exec(text)) !== null) {
            const name = match[2] || match[1];
            if (name && !names.includes(name)) {
                names.push(name);
            }
        }
    }
    return names;
}

// ========================================
// Text Analysis (Structured Extraction)
// ========================================

export async function analyzeImageText(text: string): Promise<ScannedData[]> {
    const logger = getCurrentOcrLogger();
    if (!OPENAI_API_KEY) throw new Error("OpenAI API Key is missing.");

    try {
        const controller = new AbortController();
        // 텍스트 분석 타임아웃 50초로 증가 (OpenAI 모델 응답 시간 확보)
        const timeoutId = setTimeout(() => controller.abort(), 50000);

        const fewShotExamples = await getFewShotPrompt();

        // 오늘 날짜 주입 (Vision과 동일하게)
        const today = new Date();
        const referenceDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
        const dayOfWeek = ['일', '월', '화', '수', '목', '금', '토'][today.getDay()];
        const systemPrompt = buildSystemPrompt({ referenceDate, dayOfWeek, fewShotExamples, mode: 'text' });

        const response = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${OPENAI_API_KEY}` },
            signal: controller.signal,
            body: JSON.stringify({
                model: "gpt-4o-mini",
                response_format: RESPONSE_FORMAT,
                temperature: 0.1,
                max_tokens: 1200,
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: `Analyze this text and extract ALL transactions:\n\n${text}` }
                ]
            })
        });

        clearTimeout(timeoutId);
        const data = await response.json();

        // 디버깅: API 응답 상태 로깅
        console.log('[OpenAI Text] Response status:', response.status);
        if (!response.ok) {
            console.error('[OpenAI Text] API Error:', JSON.stringify(data, null, 2));
            throw new Error(`OpenAI API Error: ${data.error?.message || response.statusText}`);
        }

        const costUsd = (data.usage?.total_tokens || 0) * (0.15 / 1000000);
        const content = data.choices?.[0]?.message?.content;

        if (!content) {
            console.error('[OpenAI Text] Missing content. Full response:', JSON.stringify(data, null, 2));
            throw new Error(`OpenAI response missing content. Status: ${response.status}, Error: ${data.error?.message || 'Unknown'}`);
        }

        const result = JSON.parse(content);
        const transactionsRaw = Array.isArray(result.transactions) ? result.transactions : [result];
        const transactions = transactionsRaw.length > 0 ? transactionsRaw : [result];
        const virtualAccountPayment = isVirtualAccountPaymentText(text || '');
        const insurancePayment = isInsuranceText(text || '');
        const scannedDataArray: ScannedData[] = [];

        // STRICT VALIDATION LOOP
        for (const item of transactions) {
            let confidencePenalty = 0;
            const warnings: string[] = item.warnings || [];
            let direction = item.direction;
            if (item.type === 'BANK_TRANSFER' && (virtualAccountPayment || insurancePayment)) {
                if (direction !== 'out') {
                    direction = 'out';
                    warnings.push('direction_override_virtual_account_payment');
                }
            }

            // 1. Mandatory Field Check & Downgrade
            if (item.type === 'STORE_PAYMENT' && !item.amount) {
                console.log('[Validator] STORE_PAYMENT missing amount -> Penalize');
                confidencePenalty += 0.3;
                warnings.push('missing_amount');
            }
            if (item.type === 'BANK_TRANSFER' && !direction) {
                console.log('[Validator] BANK_TRANSFER missing direction -> Penalize');
                confidencePenalty += 0.2;
                warnings.push('missing_direction');
            }
            if (item.type === 'INVITATION' && (!item.date_or_datetime || !item.place_name)) {
                confidencePenalty += 0.2;
                warnings.push('missing_place_or_date');
            }

            // 2. Final Confidence Calculation
            let finalConfidence = (item.confidence || 0.8) - confidencePenalty;
            if (finalConfidence < 0) finalConfidence = 0.1;

            // 3. Fallback to UNKNOWN if confidence drops too low
            let finalType = item.type;
            if (finalConfidence < 0.4 && item.type !== 'UNKNOWN') {
                console.log(`[Validator] Confidence too low (${finalConfidence}) for ${item.type} -> Downgrading to UNKNOWN`);
                finalType = 'UNKNOWN';
            }

            const normalizedDate = normalizeDateTime(item.date_or_datetime || item.expiry_date || item.due_date);

            // Common Data Construction
            const commonData: BaseAnalysisResult = {
                type: finalType,
                subtype: item.subtype,
                confidence: Number(finalConfidence.toFixed(2)),
                evidence: item.evidence || [],
                warnings: warnings,
                source: item.source || 'PHOTO',
                date: normalizedDate
            };

            // Mapping based on type
            if (finalType === 'GIFTICON') {
                scannedDataArray.push({
                    ...commonData,
                    type: 'GIFTICON',
                    productName: item.item_name,
                    brandName: item.brand,
                    estimatedPrice: item.amount,
                    expiryDate: normalizeDateTime(item.expiry_date) || item.expiry_date,
                    redeemCode: item.redeem_code
                } as GifticonResult);
            } else if (finalType === 'INVITATION') {
                const hostNames = item.host_names && item.host_names.length
                    ? item.host_names
                    : extractInvitationMainNames(text);
                scannedDataArray.push({
                    ...commonData,
                    type: 'INVITATION',
                    eventType: normalizeInvitationEventType(item.event_type),
                    eventDate: normalizeDateTime(item.date_or_datetime) || item.date_or_datetime,
                    eventLocation: item.place_name,
                    address: item.address,
                    mainName: hostNames?.[0],
                    hostNames,
                    recommendedAmount: item.recommended_amount
                } as InvitationResult);
            } else if (finalType === 'OBITUARY') {
                scannedDataArray.push({
                    ...commonData,
                    type: 'OBITUARY',
                    deceased: item.deceased_name,
                    relationship: item.relationship,
                    funeralLocation: item.place_name,
                    eventDate: normalizeDateTime(item.date_or_datetime) || item.date_or_datetime,
                    recommendedAmount: item.recommended_amount
                } as ObituaryResult);
            } else if (finalType === 'STORE_PAYMENT') {
                scannedDataArray.push({
                    ...commonData,
                    type: 'STORE_PAYMENT',
                    merchant: item.merchant_name,
                    amount: item.amount,
                    date: normalizeDateTime(item.date_or_datetime) || item.date_or_datetime,
                    paymentMethod: item.payment_method,
                    category: item.category,
                    subCategory: item.subCategory
                } as StorePaymentResult);
            } else if (finalType === 'BANK_TRANSFER') {
                const virtualAccountPayment = /가상계좌|이체|납부|공과금/.test(text);
                const insurancePayment = /보험|insurance/i.test(text);
                scannedDataArray.push({
                    ...commonData,
                    type: 'BANK_TRANSFER',
                    transactionType: direction === 'in' ? 'deposit' : 'withdrawal',
                    amount: item.amount,
                    targetName: item.counterparty,
                    balanceAfter: item.balance,
                    bankName: item.bank_name,
                    category: item.category,
                    subCategory: item.subCategory,
                    ...(virtualAccountPayment || insurancePayment ? {
                        isUtility: true,
                        category: '비소비지출/금융',
                        subCategory: insurancePayment ? '보험' : undefined
                    } : {})
                } as BankTransactionResult);
            } else if (finalType === 'BILL') {
                scannedDataArray.push({
                    ...commonData,
                    type: 'BILL',
                    title: item.bill_name,
                    amount: item.amount,
                    dueDate: normalizeDateTime(item.due_date) || item.due_date,
                    virtualAccount: item.virtual_account
                } as BillResult);
            } else if (finalType === 'SOCIAL') {
                scannedDataArray.push({
                    ...commonData,
                    type: 'SOCIAL',
                    amount: item.total_amount,
                    perPersonAmount: item.per_person_amount,
                    location: item.place_name,
                    members: item.members || []
                } as SocialResult);
            } else if (finalType === 'APPOINTMENT') {
                scannedDataArray.push({
                    ...commonData,
                    type: 'APPOINTMENT',
                    title: item.title,
                    location: item.place_name,
                    memo: item.memo
                } as AppointmentResult);
            } else {
                scannedDataArray.push({
                    ...commonData,
                    type: 'UNKNOWN',
                    raw_text: text,
                    warnings: [...warnings, 'unknown_type']
                } as UnknownResult);
            }
        }

        const validItem = scannedDataArray.find(i => i.type !== 'UNKNOWN');
        logger?.logStage({
            stage: 'openai_text',
            stageOrder: 2,
            success: !!validItem,
            costEstimatedUsd: costUsd,
            docTypePredicted: validItem?.type,
            confidence: validItem?.confidence,
            metadata: { count: scannedDataArray.length }
        });

        return scannedDataArray.length ? scannedDataArray : [{ type: 'UNKNOWN', confidence: 0, evidence: [], warnings: ['parsing_failed'] } as UnknownResult];

    } catch (e: any) {
        // 상세 에러 로깅 추가
        console.error('[OpenAI Text] Stage 2 Exception:', e?.message || e);
        logger?.logStage({
            stage: 'openai_text',
            stageOrder: 2,
            success: false,
            fallbackReason: 'exception',
            metadata: { error: e?.message || String(e) }
        });
        throw e; // 예외를 다시 throw하여 GifticonAnalysisService에서 처리하도록 함
    }
}

// ========================================
// Vision Analysis (Persistent Cache)
// ========================================
// 반환 타입을 ScannedData[]로 유지해 다중 거래 지원
export async function analyzeImageVisual(base64Image: string): Promise<ScannedData[]> {
    const logger = getCurrentOcrLogger();
    if (!OPENAI_API_KEY) throw new Error("OpenAI API Key is missing.");
    const imageHash = simpleHash(base64Image);
    // 캐시 조회 - 다중 결과 지원
    const cached = await getDbCache(imageHash);
    if (cached) {
        // 캐시된 데이터가 배열인지 확인
        const cachedArray = Array.isArray(cached) ? cached : [cached];
        const processedCache: ScannedData[] = [];

        for (const cachedItem of cachedArray) {
            const cachedStrings: string[] = [];
            collectStrings(cachedItem, cachedStrings);
            const cachedText = cachedStrings.join(' ');
            const cachedVirtualAccountPayment = isVirtualAccountPaymentText(cachedText);
            const cachedInsurancePayment = isInsuranceText(cachedText);
            if (cachedItem.type === 'BANK_TRANSFER' && (cachedVirtualAccountPayment || cachedInsurancePayment)) {
                if (cachedItem.transactionType === 'deposit') {
                    cachedItem.transactionType = 'withdrawal';
                    cachedItem.warnings = [...(cachedItem.warnings || []), 'direction_override_virtual_account_payment_cache'];
                }
                (cachedItem as any).isUtility = true;
                (cachedItem as any).category = (cachedItem as any).category || '비소비지출/금융';
                if (cachedInsurancePayment) {
                    (cachedItem as any).subCategory = (cachedItem as any).subCategory || '보험';
                }
            }
            if ((cachedItem as any).date) {
                (cachedItem as any).date = normalizeDateTime((cachedItem as any).date) || (cachedItem as any).date;
            }
            processedCache.push(cachedItem);
        }

        logger?.logStage({ stage: 'openai_vision', stageOrder: 4, success: true, fallbackReason: 'db_cache_hit', imageHash: imageHash, docTypePredicted: processedCache[0]?.type, confidence: processedCache[0]?.confidence });
        return processedCache;
    }

    try {
        const fewShotExamples = await getFewShotPrompt();
        const today = new Date();
        const referenceDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
        const dayOfWeek = ['일', '월', '화', '수', '목', '금', '토'][today.getDay()];
        const systemPrompt = buildSystemPrompt({ referenceDate, dayOfWeek, fewShotExamples, mode: 'vision' });

        const response = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${OPENAI_API_KEY}` },
            body: JSON.stringify({
                model: "gpt-4o-mini",
                response_format: RESPONSE_FORMAT,
                temperature: 0.1,
                max_tokens: 1200,
                messages: [
                    {
                        role: "system",
                        content: systemPrompt
                    },
                    {
                        role: "user",
                        content: [
                            { type: "text", text: "Analyze this image." },
                            { type: "image_url", image_url: { url: `data:image/jpeg;base64,${base64Image}` } }
                        ]
                    }
                ]
            })
        });

        const data = await response.json();

        // 디버깅: API 응답 상태 로깅
        console.log('[OpenAI Vision] Response status:', response.status);
        if (!response.ok) {
            console.error('[OpenAI Vision] API Error:', JSON.stringify(data, null, 2));
            throw new Error(`OpenAI API Error: ${data.error?.message || response.statusText}`);
        }

        const costUsd = (data.usage?.total_tokens || 0) * (0.15 / 1000000);

        const content = data.choices?.[0]?.message?.content;
        if (!content) {
            console.error('[OpenAI Vision] Missing content. Full response:', JSON.stringify(data, null, 2));
            throw new Error(`OpenAI response missing content. Status: ${response.status}, Error: ${data.error?.message || 'Unknown'}`);
        }

        const parsed = JSON.parse(content);

        // Normalize to Array - process all results
        const results = Array.isArray(parsed.transactions) ? parsed.transactions : [parsed];
        console.log(`[OpenAI Vision] Detected ${results.length} transaction(s)`);

        // 모든 결과를 처리하여 배열로 반환
        const scannedDataArray: ScannedData[] = [];

        for (const result of results) {
            const collectedStrings: string[] = [];
            collectStrings(result, collectedStrings);
            const collectedText = collectedStrings.join(' ');
            const virtualAccountPayment = isVirtualAccountPaymentText(collectedText);
            const insurancePayment = isInsuranceText(collectedText);
            if (result.type === 'BANK_TRANSFER' && (virtualAccountPayment || insurancePayment)) {
                if (result.direction !== 'out') {
                    result.direction = 'out';
                    result.warnings = [...(result.warnings || []), 'direction_override_virtual_account_payment'];
                }
                result.isUtility = true;
                result.category = result.category || '비소비지출/금융';
                if (insurancePayment) {
                    result.subCategory = result.subCategory || '보험';
                }
            }

            // Strict Validation for Vision Result
            let warnings = result.warnings || [];
            let chaosPenalty = 0;
            if (result.type === 'STORE_PAYMENT' && !result.amount) { chaosPenalty += 0.3; warnings.push('missing_amount'); }
            if (result.type === 'INVITATION' && !result.date_or_datetime) { chaosPenalty += 0.2; warnings.push('missing_date'); }

            const finalConfidence = Math.max(0.1, (result.confidence || 0.8) - chaosPenalty);
            if (finalConfidence < 0.4) result.type = 'UNKNOWN'; // Vision Downgrade

            // Common Data
            const commonData: BaseAnalysisResult = {
                type: result.type,
                subtype: result.subtype,
                confidence: finalConfidence,
                evidence: result.evidence || [],
                warnings,
                source: 'PHOTO',
                date: normalizeDateTime(result.date_or_datetime || result.expiry_date || result.due_date)
            };

            // Simplified Mapping
            let finalResult: ScannedData;

            if (result.type === 'GIFTICON') finalResult = { ...commonData, type: 'GIFTICON', productName: result.item_name, brandName: result.brand, estimatedPrice: result.amount, expiryDate: normalizeDateTime(result.expiry_date) || result.expiry_date, redeemCode: result.redeem_code } as GifticonResult;
            else if (result.type === 'INVITATION') finalResult = { ...commonData, type: 'INVITATION', eventDate: normalizeDateTime(result.date_or_datetime) || result.date_or_datetime, eventLocation: result.place_name, eventType: normalizeInvitationEventType(result.event_type), mainName: result.host_names?.[0], hostNames: result.host_names, recommendedAmount: result.recommended_amount } as InvitationResult;
            else if (result.type === 'STORE_PAYMENT') finalResult = {
                ...commonData,
                type: 'STORE_PAYMENT',
                merchant: result.merchant_name,
                amount: result.amount,
                date: normalizeDateTime(result.date_or_datetime) || result.date_or_datetime,
                paymentMethod: result.payment_method,
                category: result.category,
                subCategory: result.subCategory
            } as StorePaymentResult;
            else if (result.type === 'BANK_TRANSFER') finalResult = {
                ...commonData,
                type: 'BANK_TRANSFER',
                transactionType: result.direction === 'in' ? 'deposit' : 'withdrawal',
                amount: result.amount,
                targetName: result.counterparty,
                balanceAfter: result.balance,
                bankName: result.bank_name,
                category: result.category,
                subCategory: result.subCategory,
                ...(virtualAccountPayment || insurancePayment ? {
                    isUtility: true,
                    category: '비소비지출/금융',
                    subCategory: insurancePayment ? '보험' : undefined
                } : {})
            } as BankTransactionResult;
            else if (result.type === 'BILL') finalResult = { ...commonData, type: 'BILL', title: result.bill_name, amount: result.amount, dueDate: normalizeDateTime(result.due_date) || result.due_date, virtualAccount: result.virtual_account } as BillResult;
            else if (result.type === 'SOCIAL') finalResult = { ...commonData, type: 'SOCIAL', amount: result.total_amount, perPersonAmount: result.per_person_amount, location: result.place_name, members: result.members || [] } as SocialResult;
            else if (result.type === 'APPOINTMENT') finalResult = { ...commonData, type: 'APPOINTMENT', title: result.title, location: result.place_name, memo: result.memo } as AppointmentResult;
            else finalResult = { ...commonData, type: 'UNKNOWN' } as UnknownResult;

            scannedDataArray.push(finalResult);
        }

        // 전체 배열을 캐시에 저장
        await saveDbCache(imageHash, scannedDataArray as any, costUsd, 'PHOTO');
        logger?.logStage({
            stage: 'openai_vision',
            stageOrder: 4,
            success: true,
            imageHash,
            docTypePredicted: scannedDataArray[0]?.type,
            confidence: scannedDataArray[0]?.confidence,
            costEstimatedUsd: costUsd,
            metadata: { count: scannedDataArray.length, types: scannedDataArray.map(s => s.type) }
        });
        return scannedDataArray;

    } catch (e) { throw e; }
}

export async function testConnection(): Promise<boolean> {
    try { if (!OPENAI_API_KEY) return false; const res = await fetch("https://api.openai.com/v1/chat/completions", { method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${OPENAI_API_KEY} ` }, body: JSON.stringify({ model: "gpt-4o-mini", messages: [{ role: "user", content: "Hello" }], max_tokens: 5 }) }); return res.ok; } catch { return false; }
}
