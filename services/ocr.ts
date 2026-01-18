import { Platform, InteractionManager, Image } from 'react-native';
import TextRecognition, { TextRecognitionScript, TextRecognitionResult } from '@react-native-ml-kit/text-recognition';
import { getOcrCache, setOcrCache } from './ocrCache';
import { isPreprocessEnabled } from './ocrSettings';
import { showError } from './errorHandler';
import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';
import { extractTextWithGoogleVision } from './GoogleVisionService';
import { createOcrLogger, getCurrentOcrLogger } from './OcrLogger';
import { getImageHash } from './imageHash';
import { ImageType } from './ImageClassifier';

const MIN_TEXT_LEN = 15;

// ==========================================
// 1. Adaptive Preprocessing
// ==========================================
async function preprocessImage(uri: string, targetWidth: number): Promise<string> {
    try {
        const manipResult = await ImageManipulator.manipulateAsync(
            uri,
            [{ resize: { width: targetWidth } }],
            { compress: 0.9, format: ImageManipulator.SaveFormat.JPEG }
        );
        return manipResult.uri;
    } catch (e) {
        console.warn('[OCR] Preprocessing failed, using original:', e);
        return uri;
    }
}

async function buildAdaptiveVariants(uri: string): Promise<string[]> {
    if (!isPreprocessEnabled()) return [uri];

    return new Promise<{ width: number, height: number }>((resolve) => {
        Image.getSize(uri, (w, h) => resolve({ width: w, height: h }), () => resolve({ width: 0, height: 0 }));
    }).then(async ({ width }) => {
        const variants: string[] = [uri]; // Always try original first

        // ✅ 사양서 기준: 항상 3개 Variant 앙상블 (원본 + 1280px + 2048px)
        if (width > 0) {
            // 원본과 크기가 많이 다를 경우만 추가 (불필요한 중복 방지)
            if (Math.abs(width - 1280) > 200) {
                console.log('[OCR] Adding 1280px variant');
                variants.push(await preprocessImage(uri, 1280));
            }
            if (Math.abs(width - 2048) > 200) {
                console.log('[OCR] Adding 2048px variant');
                variants.push(await preprocessImage(uri, 2048));
            }
        }

        return variants;
    });
}


// ==========================================
// 2. Advanced Scoring Algorithm
// ==========================================
export function scoreOcrText(text: string): number {
    const trimmed = text.trim();
    if (!trimmed) return 0;

    let score = 0;
    const length = trimmed.length;

    score += Math.min(length, 300) * 0.1;
    const digitCount = (trimmed.match(/\d/g) || []).length;
    score += (digitCount * 2);

    const dateHits = (trimmed.match(/(\d{4}[./-]\d{1,2}[./-]\d{1,2})|(\d{1,2}\/\d{1,2})|(\d{1,2}월\s*\d{1,2}일)/g) || []).length;
    score += (dateHits * 10);

    const moneyHits = (trimmed.match(/(\d{1,3}(,\d{3})+)|(\d+\s*원)|(KRW)/gi) || []).length;
    score += (moneyHits * 8);

    if (/(승인|결제|입금|출금|잔액|유효기간|주문|합계|예약|일정|장소|문의|초대|결혼|부고)/.test(trimmed)) {
        score += 20;
    }

    const specialChars = (trimmed.match(/[^a-zA-Z0-9가-힣\s]/g) || []).length;
    if (length > 0) {
        const noiseRatio = specialChars / length;
        if (noiseRatio > 0.4) score -= 30; // Garbled text
    }

    return score;
}

// ==========================================
// 3. Conditional Typo Correction
// ==========================================
export function correctOcrTypos(text: string): string {
    if (!text) return text;
    const parts = text.split(/(\s+|(?=[,.])|(?<=[,.]))/);

    return parts.map((token) => {
        const hasDigit = /\d/.test(token);
        const hasSuspicious = /[SOIBZl]/.test(token);

        if (hasDigit && hasSuspicious) {
            return token
                .replace(/[O]/g, '0')
                .replace(/[o]/g, '0')
                .replace(/[Il]/g, '1')
                .replace(/S/g, '5')
                .replace(/B/g, '8')
                .replace(/Z/g, '2');
        }

        if (/^[SOIBZ]\d+/.test(token)) {
            return token
                .replace(/^S/, '5')
                .replace(/^O/, '0')
                .replace(/^I/, '1')
                .replace(/^l/, '1')
                .replace(/^B/, '8');
        }

        return token;
    }).join('');
}

// ==========================================
// 4. Relative Date Parsing
// ==========================================
export function preprocessRelativeDates(text: string): string {
    if (!text) return text;
    const now = new Date();
    const iso = (d: Date) => {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const dt = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${dt}`;
    };
    const addDays = (days: number) => {
        const d = new Date();
        d.setDate(d.getDate() + days);
        return iso(d);
    };
    const nextDayOfWeek = (dayIndex: number) => {
        const d = new Date();
        d.setDate(d.getDate() + ((dayIndex + 7 - d.getDay()) % 7) || 7);
        return iso(d);
    };
    let result = text;
    result = result.replace(/그저께|그제/g, addDays(-2));
    result = result.replace(/어제|작일/g, addDays(-1));
    result = result.replace(/오늘/g, iso(now));
    result = result.replace(/내일/g, addDays(1));
    result = result.replace(/모레|낼모레/g, addDays(2));
    result = result.replace(/글피|사흘뒤|사흘\s*후/g, addDays(3));
    result = result.replace(/다음주/g, addDays(7));
    result = result.replace(/이번주\s*금요일/g, nextDayOfWeek(5));
    return result;
}

// ==========================================
// Main Pipeline
// ==========================================

async function getImageSizeKb(uri: string): Promise<number | undefined> {
    try {
        const info = await FileSystem.getInfoAsync(uri);
        if (info.exists && typeof info.size === 'number') return Math.round(info.size / 1024);
    } catch (e) { /* ignore */ }
    return undefined;
}

export function filterByConfidence(result: any, threshold: number): string {
    if (!result?.blocks) return result?.text || '';
    const filtered = result.blocks.filter((block: any) => {
        const txt = block.text || '';
        const isVital = /\d/.test(txt) || /[원$]/.test(txt);
        if (typeof block.confidence === 'number' && block.confidence < threshold) {
            return isVital;
        }
        return true;
    });
    return filtered.map((b: any) => b.text).join('\n').trim();
}

/**
 * UPDATED: Returns Object { text, score } instead of just string
 */
export async function extractTextFromImage(uri: string, classification: ImageType = ImageType.UNKNOWN): Promise<{ text: string; score: number }> {
    try {
        let logger = getCurrentOcrLogger();
        if (!logger) logger = createOcrLogger();

        const imageSizeKb = await getImageSizeKb(uri);
        const imageHash = await getImageHash(uri);

        if (logger) await logger.startSession(imageHash, imageSizeKb);

        if (Platform.OS !== 'web') {
            await new Promise<void>(resolve => InteractionManager.runAfterInteractions(() => resolve()));
        }

        const cached = await getOcrCache(imageHash);
        if (cached) {
            console.log('[OCR] Local Cache HIT');
            logger?.logStage({
                stage: 'ml_kit',
                stageOrder: 1,
                success: true,
                fallbackReason: 'local_cache_hit',
                textLength: String(cached).length
            });
            // Approximate score for cached item (assume good quality if cached)
            return { text: cached as string, score: 80 };
        }

        const variants = await buildAdaptiveVariants(uri);
        console.log(`[OCR] Variants generated: ${variants.length}`);

        let bestText = "";
        let bestScore = -1;

        for (const [index, variantUri] of variants.entries()) {
            try {
                const res = await TextRecognition.recognize(variantUri, TextRecognitionScript.KOREAN);

                const rawText = filterByConfidence(res, 0.4);
                const processedText = preprocessRelativeDates(correctOcrTypos(rawText));
                const score = scoreOcrText(processedText);

                console.log(`[OCR] Variant ${index} Score: ${score}`);

                if (score > bestScore) {
                    bestScore = score;
                    bestText = processedText;
                }

                if (bestScore > 80) break;

            } catch (err) {
                console.warn(`[OCR] Variant ${index} failed:`, err);
            }
        }

        if (bestScore < 20) {
            console.log('[OCR] Quality too low (<20), attempting Google Vision...');
            try {
                const visionText = await extractTextWithGoogleVision(uri);
                const visionScore = scoreOcrText(visionText);
                if (visionScore > bestScore) {
                    bestText = correctOcrTypos(visionText);
                    bestScore = visionScore;
                    logger?.logGoogleVision(true, bestText.length);
                }
            } catch (e) {
                console.warn('[OCR] Vision fallback failed');
            }
        }

        // ✅ 사양서 기준 임계값 조정 (10 → 15) - 저품질 텍스트 필터링 강화
        const usable = bestScore >= 15;

        logger?.logStage({
            stage: 'ml_kit',
            stageOrder: 1,
            success: usable,
            textLength: bestText.length,
            confidence: bestScore / 100,
            metadata: { score: bestScore, variants: variants.length }
        });

        if (usable) {
            await setOcrCache(imageHash, bestText);
        }

        return { text: bestText, score: bestScore };

    } catch (e: any) {
        showError(e.message ?? 'OCR Failed');
        return { text: '', score: 0 };
    }
}
