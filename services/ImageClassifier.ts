import { Image } from 'react-native';
import TextRecognition, { TextRecognitionScript } from '@react-native-ml-kit/text-recognition';
import * as ImageManipulator from 'expo-image-manipulator';

export enum ImageType {
    SCREENSHOT = 'SCREENSHOT',
    DOCUMENT_PHOTO = 'DOCUMENT_PHOTO',
    UNKNOWN = 'UNKNOWN',
}

interface ImageClassificationResult {
    type: ImageType;
    scores: {
        screenshot: number;
        photo: number;
    };
    details: string[];
}

/**
 * Classifies an image as a Screenshot or a Document Photo.
 * Uses heuristics: Aspect Ratio, Top/Bottom UI Text Patterns.
 */
export async function classifyImageType(uri: string): Promise<ImageClassificationResult> {
    console.log('[ImageClassifier] Starting classification for:', uri);
    const scores = { screenshot: 0, photo: 0 };
    const details: string[] = [];

    try {
        // 1. Aspect Ratio Check
        // Using Promise wrapper for Image.getSize to handle potential failures gracefully
        const sizePromise = new Promise<{ width: number; height: number }>((resolve, reject) => {
            Image.getSize(uri, (width, height) => resolve({ width, height }), reject);
        });

        const { width, height } = await sizePromise;
        const ratio = Math.min(width, height) / Math.max(width, height); // Always < 1.0 (Short / Long)

        // Common phone ratios: 9:16 (0.5625), 9:18 (0.5), 9:19.5 (0.46), 9:20 (0.45)
        // Screenshots are usually exact ratios. Photos vary.
        if (ratio >= 0.44 && ratio <= 0.61) {
            scores.screenshot += 1;
            details.push(`Ratio Match (${ratio.toFixed(3)})`);
        } else {
            // Photos often have arbitrary ratios or 3:4 (0.75) standard camera
            scores.photo += 1;
            details.push(`Ratio Mismatch (${ratio.toFixed(3)})`);
        }

        // 2. OCR Pattern Check (Top & Bottom)
        // We crop just the interested areas to save OCR time and focus on UI elements
        const topCrop = await ImageManipulator.manipulateAsync(
            uri,
            [{ crop: { originX: 0, originY: 0, width: width, height: height * 0.1 } }], // Top 10%
            { base64: false }
        );

        const bottomCrop = await ImageManipulator.manipulateAsync(
            uri,
            // Bottom 15%
            [{ crop: { originX: 0, originY: height * 0.85, width: width, height: height * 0.15 } }],
            { base64: false }
        );

        try {
            const topResult = await TextRecognition.recognize(topCrop.uri, TextRecognitionScript.KOREAN);
            const bottomResult = await TextRecognition.recognize(bottomCrop.uri, TextRecognitionScript.KOREAN);

            const topText = topResult.text.toLowerCase();
            const bottomText = bottomResult.text.toLowerCase();

            // Top Patterns: Time, Battery, Carrier, Wifi
            // e.g., "12:00", "LTE", "5G", "100%"
            // Very simple heuristics
            const topPatterns = [/^\d{1,2}:\d{2}$/m, /lte/, /5g/, /wifi/, /\d{1,3}%/];
            let topMatches = 0;
            if (topPatterns.some(p => p.test(topText))) topMatches++;
            if (topMatches > 0) {
                scores.screenshot += 2;
                details.push('Top Bar Detected');
            }

            // Bottom Patterns: "Input", "Home", "Back" clues (often symbols, hard to OCR, but text hints exist)
            // e.g., "입력하세요", "메시지", or Nav bar shapes mistaken for text like "III", "<"
            const bottomPatterns = [/입력/, /메시지/, /보내기/, /홈/, /뒤로/];
            if (bottomPatterns.some(p => p.test(bottomText))) {
                scores.screenshot += 2;
                details.push('Bottom Nav/Input Detected');
            }

        } catch (ocrError) {
            console.warn('[ImageClassifier] Partial OCR failed:', ocrError);
        }

        console.log('[ImageClassifier] Scores:', scores);

        // 3. Final Decision
        if (scores.screenshot >= 3 || (scores.screenshot >= 1 && scores.screenshot > scores.photo + 1)) {
            return { type: ImageType.SCREENSHOT, scores, details };
        } else if (scores.photo >= 2 || scores.photo > scores.screenshot) {
            return { type: ImageType.DOCUMENT_PHOTO, scores, details };
        }

        // Default / Safe Fallback
        return { type: ImageType.DOCUMENT_PHOTO, scores, details }; // Default to Photo to trigger safe processing

    } catch (e) {
        console.error('[ImageClassifier] Classification failed:', e);
        return { type: ImageType.DOCUMENT_PHOTO, scores, details: ['Error'] }; // Fallback
    }
}
