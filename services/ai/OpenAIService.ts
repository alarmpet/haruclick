import Constants from 'expo-constants';
import { supabase } from '../supabase';
import { getCurrentOcrLogger } from '../OcrLogger';

export type ScanType = 'GIFTICON' | 'INVITATION' | 'TRANSFER' | 'RECEIPT' | 'BILL' | 'SOCIAL' | 'UNKNOWN' | 'STORE_PAYMENT' | 'BANK_TRANSFER';

export interface BaseAnalysisResult {
    type: ScanType;
    senderName?: string;
}

export interface GifticonResult extends BaseAnalysisResult {
    type: 'GIFTICON';
    productName: string;
    brandName: string;
    estimatedPrice: number;
    expiryDate?: string;
    barcodeNumber?: string;
}

export interface InvitationResult extends BaseAnalysisResult {
    type: 'INVITATION';
    eventDate: string; // YYYY-MM-DD
    eventLocation: string;
    eventType: 'wedding' | 'funeral' | 'birthday' | 'other';
    mainName?: string;
    accountNumber?: string;
    recommendedAmount?: number;
    recommendationReason?: string;
    relation?: string;
}

// ✅ [NEW] Bank Transaction (인맥 송금/이체)
export interface BankTransactionResult extends BaseAnalysisResult {
    type: 'BANK_TRANSFER';
    amount: number;
    transactionType: 'deposit' | 'withdrawal'; // 입금/출금
    targetName: string; // 보낸사람(입금 시) or 받은사람(출금 시)
    date: string; // YYYY-MM-DD HH:mm
    balanceAfter?: number;
    isUtility: boolean; // 공과금 여부 (true면 ledger로 저장)
    category?: string; // 대분류 (예: 주거/통신/광열)
    subCategory?: string; // 소분류 (예: 관리비)
    memo?: string; // AI가 추론한 메모
}

// ✅ [NEW] Store Payment (상점 결제)
export interface StorePaymentResult extends BaseAnalysisResult {
    type: 'STORE_PAYMENT';
    merchant: string; // 상호명 (정규화됨)
    amount: number;
    date: string;
    category: string; // 식비, 교통, 쇼핑 등
    subCategory?: string; // 상세 분류 (예: 식료품, OTT/구독)
    memo?: string;
}

export interface TransferResult extends BaseAnalysisResult {
    type: 'TRANSFER';
    amount: number;
    isReceived: boolean;
    memo?: string;
}

export interface ReceiptResult extends BaseAnalysisResult {
    type: 'RECEIPT';
    amount: number;
    merchant: string;
    category: string;
    date: string;
    subCategory?: string;
}

export interface BillResult extends BaseAnalysisResult {
    type: 'BILL';
    title: string;
    amount: number;
    dueDate: string;
    virtualAccount?: string;
}

export interface SocialResult extends BaseAnalysisResult {
    type: 'SOCIAL';
    amount: number;
    location: string;
    members: string[];
    date: string;
}

export interface UnknownResult extends BaseAnalysisResult {
    type: 'UNKNOWN';
}

export type ScannedData = GifticonResult | InvitationResult | BankTransactionResult | StorePaymentResult | ReceiptResult | BillResult | SocialResult | UnknownResult | TransferResult;

const OPENAI_API_KEY = process.env.EXPO_PUBLIC_OPENAI_API_KEY ?? Constants.expoConfig?.extra?.EXPO_PUBLIC_OPENAI_API_KEY;

export async function analyzeImageText(text: string): Promise<ScannedData[]> {
    const logger = getCurrentOcrLogger();
    if (!OPENAI_API_KEY) {
        logger?.logStage({
            stage: 'openai_text',
            stageOrder: 2,
            success: false,
            fallbackReason: 'missing_api_key',
            errorMessage: 'OpenAI API key missing',
            metadata: { inputLength: text.length }
        });
        throw new Error("OpenAI API Key is missing. Please check .env configuration.");
    }

    // 🔹 Regex-based date extraction fallback
    const findUniqueDates = (text: string): string[] => {
        const dateRegex = /(\d{4})[./-](\d{1,2})[./-](\d{1,2})|(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일/g;
        const matches = [...text.matchAll(dateRegex)];
        const uniqueDates = Array.from(new Set(matches.map(m => {
            if (m[4]) return `${m[4]}-${String(m[5]).padStart(2, '0')}-${String(m[6]).padStart(2, '0')}`;
            return `${m[1]}-${String(m[2]).padStart(2, '0')}-${String(m[3]).padStart(2, '0')}`;
        })));
        return uniqueDates;
    };

    try {
        console.log('[OpenAI] analyzeImageText started. Length:', text.length);
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout

        const response = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${OPENAI_API_KEY}`
            },
            signal: controller.signal,
            body: JSON.stringify({
                model: "gpt-4o-mini",
                response_format: { type: "json_object" },
                messages: [
                    {
                        role: "system",
                        content: `You are a financial AI expert. POST-PROCESS OCR text into structured JSON.
                        
                        ⚠️ IMPORTANT: The input text may contain MULTIPLE transactions. Extract ALL transactions as an array.
                        
                        📅 CRITICAL DATE RULES:
                        1. ONLY extract dates that are EXPLICITLY written in the text.
                        2. ⚠️ CONTEXT DATES: If a date appears at the top/beginning of a message block (e.g., "[Web발신] (01/10)" or "(그저께)"), APPLY this date to all subsequent transactions in that block if they lack their own date.
                        3. If NO date/time is found in the text or context, set "date": null.
                        4. Look for date patterns like: "01/10 16:11", "2026-01-14", "1월 10일", "01/10", "14:30" etc.
                        5. If only month/day is found (e.g., "01/10"), use current year ${new Date().getFullYear()}.
                        ⚠️ SPECIAL RULES FOR GIFTICONS (Coupons & Grids):
                        - MULTIPLE ITEMS: If input contains a LIST or GRID of items (e.g. KakaoTalk Gift Box), extract EACH item as a separate transaction.
                        - D-DAY LOGIC: If a date is NOT shown but "D-Number" is visible (e.g., "D-76", "D-Day"), CALCULATE expiry_date:
                          -> Formula: Expiry = Today(${new Date().toISOString().split('T')[0]}) + Number of days.
                          -> Example: If Today is 2025-01-01 and text says "D-30", expiry_date is "2025-01-31".
                        - SENDER: Look for "from. NAME" or "보낸사람: NAME".
                        - DATE CONFUSION: A date like "2024.12.28" shown under 'from. Name' is usually the ISSUE/RECEIVED date. If "D-XX" exists, prefer calculating Expiry from D-Day over using the received date as expiry.
                        - LOOK FOR "유효기간", "기한", "until", "~" followed by a date.
                        - If a date is found next to these keywords, it is the 'expiry_date'.
                        
                        Strictly follow these CLASSIFICATION RULES based on Korean Statistics (KOSTAT):

                        1. Identify "Transaction Type":
                           - Income (수입): Salary, Bonus, Interest, Allowance.
                           - Expense (지출): Purchase of goods/services, tax, interest paid.
                           - Transfer (이체): Move between my accounts, Savings, Card payment (Pre-payment).

                        2. Map "Category" & "Sub-Category" (for Expense):
                           [식비 (Food)]
                           - 식료품: Mart, Convenience store (CU, GS25, 7-Eleven), Kurly, Reference: "Groceries"
                           - 외식/배달: Restaurant, Cafe (Starbucks), Pub, Delivery (Baemin, Yogiyo), Bakery.
                           
                           [주거/통신/광열 (Housing/Utilities)]
                           - 주거/관리비: Rent, Maintenance fee, Gas, Electric (KEPCO), Water.
                           - 통신비: SKT/KT/LGU+, Internet, Budget phone.

                           [교통/차량 (Transport)]
                           - 대중교통: KTX, Subway, Taxi, Bus.
                           - 자차/유지: Gas station, Toll, Repair, Car tax.

                           [문화/여가 (Culture)]
                           - OTT/구독: Netflix, YouTube, TVING, Mellon (Keywords: "정기결제").
                           - 여행: Accommodation (Yanolja, Airbnb), Flight, Duty-free.
                           - 문화생활: Movie, Performance, Gym/Golf.

                           [쇼핑/생활 (Shopping)]
                           - 온라인: Coupang, NaverPay, 11st, Gmarket.
                             (Note: Coupang Eats -> Food, Coupang Play -> Culture)
                           - 오프라인: Daiso, OliveYoung, Dept Store, Clothes, Hair salon.

                           [의료/건강 (Health)]
                           - Hospital, Pharmacy, Vitamins/Supplements.

                           [교육 (Education)]
                           - Academy (Hagwon), Tuition, Books.

                           [비소비지출/금융 (Finance)]
                           - Interest (Loan), Tax, Insurance, Pension.
                           - Other: Family event (Wedding/Funeral), Donation.

                        3. Determine Document Type (JSON "type"):
                           - STORE_PAYMENT: Card approval, Receipt, Payment notification.
                           - BANK_TRANSFER: Withdrawal/Deposit notification with balance.
                           - INVITATION: Wedding/Funeral/Birthday card.
                           - GIFTICON: Coupon/Voucher with barcode.

                        ⚠️ KOREAN WEDDING INVITATION NAME PARSING:
                        Pattern: "[아버지]·[어머니] 의 장남 [신랑이름]", "[아버지]·[어머니] 의 장녀 [신부이름]"
                        - The ACTUAL COUPLE are names AFTER "장남/장녀/차남/차녀" markers
                        - Parents' names come BEFORE "의 장남/장녀"
                        - Example: "송영섭·정인겸 의 장남 송재근" → host = "송재근" (NOT 송영섭)
                        - For weddings: combine as "신랑이름 ♥ 신부이름"

                        ⚠️ RETURN JSON FORMAT (ALWAYS an array, even for single transaction):
                        {
                            "transactions": [
                                {
                                    "type": "STORE_PAYMENT" | "BANK_TRANSFER" | "INVITATION" | "GIFTICON" | "UNKNOWN",
                                    "data": {
                                        // For STORE_PAYMENT
                                        "merchant": string,
                                        "amount": number,
                                        "date": "YYYY-MM-DD HH:mm" | null,  // ⚠️ If specific date is missing, infer from context (e.g., top of message, 'Today', 'Yesterday')
                                        "category": string,
                                        "sub_category": string,
                                        "memo": string,

                                        // For BANK_TRANSFER
                                        "transaction_type": "deposit" | "withdrawal",
                                        "target_name": string,
                                        "amount": number,
                                        "date": "YYYY-MM-DD HH:mm" | null,  // ⚠️ If specific date is missing, infer from context
                                        "balance_after": number | null,
                                        "is_utility": boolean,
                                        "category": string,
                                        "sub_category": string,
                                        "memo": string,

                                        // For INVITATION
                                        "event_type": "wedding",
                                        "date": "YYYY-MM-DD HH:mm" | null,
                                        "location": "Venue Name",
                                        "host": "Ex: Kim Chul-soo",
                                        "memo": "Ex: Invitation text summary"
                                    },
                                    // For GIFTICON
                                    "product_name": string,
                                    "brand_name": string,  // e.g. Starbucks, BaskinRobbins
                                    "expiry_date": "YYYY-MM-DD" | null,
                                    "barcode_number": string | null, // 12-16 digits usually
                                    "estimated_price": number | null, // Valid market price if not shown
                                    "sender_name": string | null // "Sent by XXX"
                                }
                                },
                                // ... more transactions if found
                            ]
                        }
                        `
                    },
                    {
                        role: "user",
                        content: `Analyze this text and extract ALL transactions:\n\n${text}`
                    }
                ]
            })
        });

        clearTimeout(timeoutId);
        console.log('[OpenAI] analyzeImageText response received. status:', response.status);

        const data = await response.json();
        console.log('[OpenAI] JSON parsed successfully');

        // 📊 Log API Usage (fire and forget, don't block)
        if (data.usage) {
            console.log('[OpenAI] Logging API usage (async, non-blocking)...');
            // Fire and forget - don't await
            (async () => {
                try {
                    const { prompt_tokens, completion_tokens, total_tokens } = data.usage;
                    const { data: { session } } = await supabase.auth.getSession();
                    await supabase.from('api_usage_logs').insert({
                        user_id: session?.user?.id,
                        provider: 'openai',
                        endpoint: 'chat/completions',
                        model: data.model || 'gpt-4o-mini',
                        tokens_input: prompt_tokens,
                        tokens_output: completion_tokens,
                        tokens_total: total_tokens,
                        status: 'success'
                    });
                } catch (logError) {
                    console.error('[OpenAI] Failed to log API usage:', logError);
                }
            })();
        }

        const content = data.choices[0].message.content;
        console.log("AI Response:", content);

        let result = JSON.parse(content);

        // 배열 형식 처리
        const transactions = result.transactions || [result];
        const scannedDataArray: ScannedData[] = [];

        // Helper to find expiry fallback
        const regexDates = findUniqueDates(text);
        // If multiple dates found, usually the furthest one is expiry, but let's just take the first one found with "까지" context if possible, or just the last one (often expiry is at bottom).
        const fallbackExpiry = regexDates.length > 0 ? regexDates[regexDates.length - 1] : undefined;

        for (const item of transactions) {
            const txType = item.type;
            const txData = item.data || item;

            if (txType === 'STORE_PAYMENT') {
                scannedDataArray.push({
                    type: 'STORE_PAYMENT',
                    merchant: txData.merchant,
                    amount: txData.amount,
                    date: txData.date,
                    category: txData.category,
                    subCategory: txData.sub_category,
                    memo: txData.memo
                });
            } else if (txType === 'BANK_TRANSFER') {
                scannedDataArray.push({
                    type: 'BANK_TRANSFER',
                    transactionType: txData.transaction_type,
                    targetName: txData.target_name,
                    amount: txData.amount,
                    date: txData.date,
                    balanceAfter: txData.balance_after,
                    isUtility: txData.is_utility,
                    category: txData.category,
                    subCategory: txData.sub_category,
                    memo: txData.memo
                } as BankTransactionResult);
            } else if (txType === 'INVITATION') {
                scannedDataArray.push({
                    type: 'INVITATION',
                    eventType: txData.event_type || 'other',
                    eventDate: txData.date,
                    eventLocation: txData.location,
                    mainName: txData.host,
                    senderName: txData.host,
                    recommendationReason: txData.memo
                } as InvitationResult);
            } else if (txType === 'GIFTICON') {
                scannedDataArray.push({
                    type: 'GIFTICON',
                    productName: txData.product_name || txData.merchant || 'Unknown Product',
                    brandName: txData.brand_name || txData.merchant || 'Unknown Brand',
                    expiryDate: txData.expiry_date || txData.date || fallbackExpiry, // Use fallback if both are null
                    barcodeNumber: txData.barcode_number,
                    estimatedPrice: txData.estimated_price || txData.amount || 0,
                    senderName: txData.sender_name || txData.sender
                } as GifticonResult);
            } else {
                scannedDataArray.push({ type: 'UNKNOWN' });
            }
        }

        const hasValid = scannedDataArray.some((item) => item.type !== 'UNKNOWN');
        const resultType = hasValid
            ? scannedDataArray.find((item) => item.type !== 'UNKNOWN')?.type
            : 'UNKNOWN';

        logger?.logStage({
            stage: 'openai_text',
            stageOrder: 2,
            success: hasValid,
            resultType: resultType,
            fallbackReason: hasValid ? undefined : 'no_valid_results',
            metadata: { inputLength: text.length, transactionCount: scannedDataArray.length }
        });

        return scannedDataArray.length > 0 ? scannedDataArray : [{ type: 'UNKNOWN' }];

    } catch (e) {
        console.error(e);
        const message = e instanceof Error ? e.message : String(e);
        logger?.logStage({
            stage: 'openai_text',
            stageOrder: 2,
            success: false,
            fallbackReason: message.includes('abort') ? 'timeout' : 'exception',
            errorMessage: message,
            metadata: { inputLength: text.length }
        });
        return [{ type: 'UNKNOWN' }];
    }
}
// Keep analyzeImageVisual as is or update similarly if needed

// ========================================
// 🚀 Image Hash Cache for OpenAI Vision
// ========================================
interface ImageCacheEntry {
    result: ScannedData;
    timestamp: number;
}

const IMAGE_CACHE_TTL_MS = 300000; // 5 minutes
const imageCache: Map<string, ImageCacheEntry> = new Map();

function simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < Math.min(str.length, 1000); i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return hash.toString(16);
}

function getImageCached(hash: string): ScannedData | null {
    const entry = imageCache.get(hash);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > IMAGE_CACHE_TTL_MS) {
        imageCache.delete(hash);
        return null;
    }
    console.log('[OpenAI Cache HIT] Returning cached result for image hash:', hash);
    return entry.result;
}

function setImageCache(hash: string, result: ScannedData): void {
    imageCache.set(hash, { result, timestamp: Date.now() });
}

export async function analyzeImageVisual(base64Image: string): Promise<ScannedData> {
    const logger = getCurrentOcrLogger();
    if (!OPENAI_API_KEY) {
        logger?.logStage({
            stage: 'openai_vision',
            stageOrder: 4,
            success: false,
            fallbackReason: 'missing_api_key',
            errorMessage: 'OpenAI API key missing'
        });
        throw new Error("OpenAI API Key is missing.");
    }

    // Check cache first
    const imageHash = simpleHash(base64Image);
    const cached = getImageCached(imageHash);
    if (cached) {
        logger?.logStage({
            stage: 'openai_vision',
            stageOrder: 4,
            success: cached.type !== 'UNKNOWN',
            resultType: cached.type,
            fallbackReason: cached.type === 'UNKNOWN' ? 'unknown_result' : 'cache_hit',
            metadata: { cache: true }
        });
        return cached;
    }

    try {
        const response = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${OPENAI_API_KEY}`
            },
            body: JSON.stringify({
                model: "gpt-4o-mini",
                max_tokens: 1000,
                messages: [
                    {
                        role: "system",
                        content: `You are a financial AI expert. Analyze Korean document images.
                        
CLASSIFY TYPES:
- GIFTICON: Product coupon with barcode
- INVITATION: Wedding/Funeral/Birthday card
- TRANSFER: Bank transfer screenshot (treat as BANK_TRANSFER)
- RECEIPT: Receipt or Payment SMS -> treat as STORE_PAYMENT or RECEIPT
- BILL: Utility bill
- SOCIAL: Group spending

⚠️ KOREAN WEDDING INVITATION NAME PARSING RULES:
Korean wedding invitations follow this pattern:
"[아버지이름]·[어머니이름] 의 장남 [신랑이름]"
"[아버지이름]·[어머니이름] 의 장녀 [신부이름]"

The ACTUAL COUPLE (main_name/host) are the names AFTER "장남", "장녀", "차남", "차녀", etc.
Parents' names come BEFORE "의 장남/장녀".

Example: "송영섭·정인겸 의 장남 송재근" → main_name should be "송재근" (NOT 송영섭 or 정인겸)
Example: "이용삼·조미현 의 장녀 이희수" → main_name should be "이희수" (NOT parents)

For wedding invitations:
- "groom_name": name after 장남/차남 (son markers)
- "bride_name": name after 장녀/차녀 (daughter markers)  
- "main_name": combine as "신랑이름 ♥ 신부이름" format

CATEGORIZATION RULES (Strict):
1. [Food] Groceries (Mart), Dining Out (Restaurant, Cafe)
2. [Housing] Rent, Utilities (Gas, Electric)
3. [Transport] Public, Car (Gas, Toll)
4. [Culture] OTT (Netflix), Travel, Cinema
5. [Shopping] Online (Coupang), Offline (Daiso, Clothes)
6. [Health] Hospital, Pharm
7. [Education] Academy
8. [Finance] Tax, Interest, Insurance, Family Event

Return JSON:
{
  "type": "GIFTICON|INVITATION|TRANSFER|RECEIPT|BILL|SOCIAL|UNKNOWN",
  "data": {
    // COMMON: date (YYYY-MM-DD HH:mm), amount (number)
    
    // RECEIPT or STORE_PAYMENT:
    "merchant": string,
    "category": string, // e.g. "식비"
    "sub_category": string, // e.g. "외식/배달"
    
    // TRANSFER:
    "sender_name": string,
    "is_received": boolean,
    "category": string, 
    "sub_category": string,
    
    // INVITATION (Wedding):
    "event_type": "wedding" | "funeral" | "birthday",
    "main_name": "신랑이름 ♥ 신부이름",  // The COUPLE, not parents!
    "groom_name": string,  // Name after 장남/차남
    "bride_name": string,  // Name after 장녀/차녀
    "event_location": string,
    "event_date": "YYYY-MM-DD HH:mm"
  }
}`
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
        if (!response.ok) throw new Error(data.error?.message || "Vision API Error");

        // 📊 Log API Usage
        if (data.usage) {
            const { prompt_tokens, completion_tokens, total_tokens } = data.usage;
            const { data: { session } } = await supabase.auth.getSession();

            supabase.from('api_usage_logs').insert({
                user_id: session?.user?.id,
                provider: 'openai-vision',
                endpoint: 'chat/completions',
                model: data.model || 'gpt-4o-mini',
                tokens_input: prompt_tokens,
                tokens_output: completion_tokens,
                tokens_total: total_tokens,
                status: 'success'
            }).then(({ error }) => {
                if (error) console.error('Failed to log API usage:', error);
            });
        }

        const content = data.choices[0].message.content;
        console.log("Vision AI Response:", content);

        const jsonMatch = content.match(/\{[\s\S]*\}/);
        const result = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(content);

        // Transform to internal types
        if (result.type === 'GIFTICON') {
            const d = result.data || result;
            const gifticonResult: GifticonResult = {
                type: 'GIFTICON',
                senderName: d.sender_nickname || "Unknown",
                productName: d.product_name || "상품명",
                brandName: d.brand_name || "",
                estimatedPrice: d.estimated_price || 0,
                expiryDate: d.expiry_date
            };
            setImageCache(imageHash, gifticonResult);
            logger?.logStage({
                stage: 'openai_vision',
                stageOrder: 4,
                success: true,
                resultType: gifticonResult.type
            });
            return gifticonResult;
        }

        if (result.type === 'INVITATION') {
            const d = result.data || result;
            const invitationResult: InvitationResult = {
                type: 'INVITATION',
                senderName: d.sender_name,
                eventDate: d.event_date,
                eventLocation: d.event_location,
                eventType: d.event_type,
                accountNumber: d.account_number,
                mainName: d.main_name,
                recommendedAmount: d.recommended_amount,
                recommendationReason: d.recommendation_reason
            };
            setImageCache(imageHash, invitationResult);
            logger?.logStage({
                stage: 'openai_vision',
                stageOrder: 4,
                success: true,
                resultType: invitationResult.type
            });
            return invitationResult;
        }

        if (result.type === 'TRANSFER') {
            const d = result.data || result;
            const transferResult = {
                type: 'TRANSFER',
                senderName: d.sender_name,
                amount: d.amount,
                isReceived: d.is_received,
                memo: d.category ? `${d.category} > ${d.sub_category}` : undefined
            } as TransferResult;
            logger?.logStage({
                stage: 'openai_vision',
                stageOrder: 4,
                success: true,
                resultType: transferResult.type
            });
            return transferResult;
        }

        if (result.type === 'RECEIPT') {
            const d = result.data || result;
            const receiptResult = {
                type: 'RECEIPT',
                merchant: d.merchant,
                amount: d.amount,
                category: d.category,
                subCategory: d.sub_category,
                date: d.date
            } as ReceiptResult;
            logger?.logStage({
                stage: 'openai_vision',
                stageOrder: 4,
                success: true,
                resultType: receiptResult.type
            });
            return receiptResult;
        }

        const unknownResult: UnknownResult = { type: 'UNKNOWN' };
        setImageCache(imageHash, unknownResult);
        logger?.logStage({
            stage: 'openai_vision',
            stageOrder: 4,
            success: false,
            resultType: unknownResult.type,
            fallbackReason: 'unknown_result'
        });
        return unknownResult;

    } catch (e) {
        console.error("Vision Analysis Failed:", e);
        const message = e instanceof Error ? e.message : String(e);
        logger?.logStage({
            stage: 'openai_vision',
            stageOrder: 4,
            success: false,
            fallbackReason: message.includes('abort') ? 'timeout' : 'exception',
            errorMessage: message
        });
        throw e;
    }
}

export async function testConnection(): Promise<boolean> {
    try {
        if (!OPENAI_API_KEY) return false;

        const response = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${OPENAI_API_KEY}`
            },
            body: JSON.stringify({
                model: "gpt-4o-mini",
                messages: [{ role: "user", content: "Hello" }],
                max_tokens: 5
            })
        });

        return response.ok;
    } catch (e) {
        console.error(e);
        return false;
    }
}
