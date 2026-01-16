import { Platform, InteractionManager } from 'react-native';
import TextRecognition, { TextRecognitionScript } from '@react-native-ml-kit/text-recognition';
import { getOcrCache, setOcrCache } from './ocrCache';
import { isPreprocessEnabled } from './ocrSettings';
import { showError } from './errorHandler';
import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system';
import { extractTextWithGoogleVision } from './GoogleVisionService';
import { createOcrLogger } from './OcrLogger';
import { getImageHash } from './imageHash';

const MIN_TEXT_LEN = 20;
const MIN_DIGIT_COUNT = 6;

async function preprocessImage(uri: string, targetWidth: number): Promise<string> {
    try {
        const manipResult = await ImageManipulator.manipulateAsync(
            uri,
            [{ resize: { width: targetWidth } }],
            { compress: 0.9, format: ImageManipulator.SaveFormat.JPEG }
        );
        return manipResult.uri;
    } catch (e) {
        console.warn('Image preprocessing failed, using original:', e);
        return uri;
    }
}

async function buildPreprocessVariants(uri: string): Promise<string[]> {
    if (!isPreprocessEnabled()) {
        return [uri];
    }

    const widths = [1280, 2048];
    const variants: string[] = [];
    for (const width of widths) {
        const processed = await preprocessImage(uri, width);
        if (!variants.includes(processed)) {
            variants.push(processed);
        }
    }
    if (!variants.includes(uri)) {
        variants.push(uri);
    }
    return variants;
}

async function getImageSizeKb(uri: string): Promise<number | undefined> {
    try {
        const info = await FileSystem.getInfoAsync(uri, { size: true });
        if (info.exists && typeof info.size === 'number') {
            return Math.round(info.size / 1024);
        }
    } catch (error) {
        console.warn('[OCR] Failed to read image size:', error);
    }
    return undefined;
}

export function filterByConfidence(result: any, threshold: number): string {
    if (!result) return '';
    const blocks = Array.isArray(result.blocks) ? result.blocks : [];
    if (blocks.length === 0) {
        return result.text || '';
    }

    const filtered = blocks.filter((block: any) => {
        if (typeof block?.confidence === 'number') {
            return block.confidence >= threshold;
        }
        return true;
    });
    const text = filtered.map((block: any) => block.text).filter(Boolean).join('\n').trim();
    return text || result.text || '';
}

export function correctOcrTypos(text: string): string {
    if (!text) return text;
    const parts = text.split(/(\s+)/);
    return parts.map((token) => {
        if (!/\d/.test(token)) return token;
        return token
            .replace(/[O]/g, '0')
            .replace(/[o]/g, '0')
            .replace(/[Il]/g, '1')
            .replace(/S/g, '5')
            .replace(/B/g, '8');
    }).join('');
}

export function preprocessRelativeDates(text: string): string {
    if (!text) return text;

    const now = new Date();
    const format = (d: Date) => d.toISOString().split('T')[0];
    const addDays = (d: Date, days: number) => {
        const copy = new Date(d);
        copy.setDate(copy.getDate() + days);
        return copy;
    };

    const replacements: Record<string, string> = {
        '\uC624\uB298': format(now),
        '\uAE08\uC77C': format(now),
        '\uC5B4\uC81C': format(addDays(now, -1)),
        '\uC804\uC77C': format(addDays(now, -1)),
        '\uADF8\uC81C': format(addDays(now, -2)),
        '\uB0B4\uC77C': format(addDays(now, 1)),
        '\uBAA8\uB808': format(addDays(now, 2)),
    };

    let result = text;
    for (const [key, value] of Object.entries(replacements)) {
        result = result.replace(new RegExp(key, 'g'), value);
    }
    result = result.replace(/\uBC29\uAE08( \uC804)?/g, format(now));
    return result;
}

function isUsefulText(text: string): boolean {
    const trimmed = text.trim();
    if (trimmed.length >= MIN_TEXT_LEN) return true;
    const digitCount = (trimmed.match(/\d/g) || []).length;
    return trimmed.length >= 10 && digitCount >= MIN_DIGIT_COUNT;
}

function scoreOcrText(text: string): number {
    const trimmed = text.trim();
    const length = trimmed.length;
    const digitCount = (trimmed.match(/\d/g) || []).length;
    const dateHits = (trimmed.match(/\d{4}[./-]\d{1,2}[./-]\d{1,2}|\d{1,2}\/\d{1,2}/g) || []).length;
    const moneyHits = (trimmed.match(/\uC6D0|\u20A9|KRW|\d{1,3}(,\d{3})+/g) || []).length;
    return length + (digitCount * 2) + (dateHits * 10) + (moneyHits * 5);
}

/**
 * Updated extractTextFromImage with OCR caching and optional preprocessing.
 */
export async function extractTextFromImage(uri: string): Promise<string> {
    try {
        const logger = createOcrLogger();
        const imageSizeKb = await getImageSizeKb(uri);
        await logger.startSession(imageSizeKb);

        if (Platform.OS !== 'web') {
            await new Promise<void>((resolve) => {
                InteractionManager.runAfterInteractions(() => resolve());
            });
        }

        // Check cache first
        const hash = await getImageHash(uri);
        const cached = await getOcrCache(hash);
        if (cached) {
            console.log('[OCR] Cache HIT for image');
            logger.logStage({
                stage: 'ml_kit',
                stageOrder: 1,
                success: true,
                textLength: String(cached).length,
                fallbackReason: 'cache_hit',
                metadata: { cache: true }
            });
            return cached as string;
        }

        // Web mock
        if (Platform.OS === 'web') {
            console.log('[OCR] Web environment: Using mock data');
            const mockText = '\n2024-12-25\nFrom. Sample Sender\nSample Gifticon\n';
            logger.logStage({
                stage: 'ml_kit',
                stageOrder: 1,
                success: true,
                textLength: mockText.length,
                fallbackReason: 'web_mock'
            });
            return mockText;
        }

        let bestText = '';
        let bestScore = 0;
        const attempts: Array<{ uri: string; text: string; score: number; error?: string }> = [];

        const variants = await buildPreprocessVariants(uri);
        for (const candidateUri of variants) {
            try {
                console.log('[OCR] Attempting ML Kit OCR...');
                const result = await TextRecognition.recognize(candidateUri, TextRecognitionScript.KOREAN);
                let extractedText = filterByConfidence(result, 0.4);
                if (extractedText.length < 10 && result.text && result.text.length > extractedText.length) {
                    extractedText = result.text;
                }
                const score = scoreOcrText(extractedText);
                attempts.push({ uri: candidateUri, text: extractedText, score });
                if (score > bestScore) {
                    bestScore = score;
                    bestText = extractedText;
                }
            } catch (mlKitError: any) {
                attempts.push({
                    uri: candidateUri,
                    text: '',
                    score: 0,
                    error: mlKitError?.message ?? 'ml_kit_error'
                });
            }
        }

        const usable = isUsefulText(bestText);
        logger.logStage({
            stage: 'ml_kit',
            stageOrder: 1,
            success: usable,
            textLength: bestText.length,
            fallbackReason: usable ? undefined : (bestText.trim().length ? 'short_text' : 'no_text'),
            metadata: { attempts: attempts.map((attempt) => ({ len: attempt.text.length, score: attempt.score })) }
        });

        if (usable) {
            const cleaned = correctOcrTypos(bestText);
            await setOcrCache(hash, cleaned);
            return cleaned;
        }

        // Google Vision fallback
        try {
            console.log('[OCR] Attempting Google Vision fallback...');
            const visionText = await extractTextWithGoogleVision(uri);
            if (visionText.length > 0) {
                console.log('[OCR] Google Vision succeeded, text length:', visionText.length);
                logger.logGoogleVision(true, visionText.length);
                const cleaned = correctOcrTypos(visionText);
                await setOcrCache(hash, cleaned);
                return cleaned;
            }
            logger.logGoogleVision(false, 0, 'empty_result');
        } catch (visionError: any) {
            const message = visionError?.message ?? 'vision_error';
            logger.logGoogleVision(false, 0, message);
        }

        console.log('[OCR] All OCR methods failed');
        return correctOcrTypos(bestText);
    } catch (e: any) {
        showError(e.message ?? 'OCR error');
        return '';
    }
}
