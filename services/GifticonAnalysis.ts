import { analyzeImageText, analyzeImageVisual, ScannedData } from './ai/OpenAIService';
import { calculateFinalConfidence } from './ai/ConfidenceCalculator';
import * as FileSystem from 'expo-file-system/legacy';
import { getCurrentOcrLogger } from './OcrLogger';
import { OcrError, OcrErrorType } from './OcrErrors';

// Helper for Timeouts
const timeoutPromise = <T>(ms: number, promise: Promise<T>, errorType: OcrErrorType = OcrErrorType.TIMEOUT): Promise<T> => {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            reject(new OcrError(errorType, "Time Limit Exceeded"));
        }, ms);
        promise
            .then(res => {
                clearTimeout(timer);
                resolve(res);
            })
            .catch(err => {
                clearTimeout(timer);
                reject(err);
            });
    });
};

export class GifticonAnalysisService {

    /**
     * Regex-based fallback parser (Partial Success Logic)
     * Used when JSON parsing fails or as a last resort.
     */
    analyzeFromText(text: string): ScannedData {
        const dateRegex = /(\d{4})[\.\-](\d{2})[\.\-](\d{2})/g;
        const allMatches = [...text.matchAll(dateRegex)];
        let expiryDate = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

        if (allMatches.length > 0) {
            const sortedDates = allMatches.map(m => `${m[1]}-${m[2]}-${m[3]}`).sort();
            expiryDate = sortedDates[sortedDates.length - 1];
        }

        let estimatedPrice = 0;
        // Simple heuristic for price
        const priceMatch = text.match(/([0-9,]+)\s?원/);
        if (priceMatch) {
            estimatedPrice = parseInt(priceMatch[1].replace(/,/g, '')) || 0;
        }

        return {
            type: 'UNKNOWN',
            raw_text: text,
            productName: "내용 확인 필요",
            senderName: "알 수 없음",
            expiryDate: expiryDate,
            estimatedPrice: estimatedPrice,
            amount: estimatedPrice, // Generic fallback
            date: expiryDate,
            relationship: '',
            attendance: '',
            confidence: 0.1, // Very low confidence
            confidence_breakdown: { ocr: 0.5, struct: 0, type: 0, consistency: 0 },
            warnings: ['Partially recovered from text'],
            evidence: [`Date: ${expiryDate}`]
        } as ScannedData;
    }

    /**
     * Intelligent Analysis Orchestrator
     * Flow: Stage 2 (Text, Timeout 15s) -> Validate -> Stage 4 (Vision, Timeout 20s) -> Fallback
     */
    async analyzeWithAI(text: string, imageUri?: string, ocrScore: number = 50): Promise<ScannedData> {
        const logger = getCurrentOcrLogger();
        console.log(`[Orchestrator] Starting Analysis... (OCR Score: ${ocrScore})`);

        // 1. Stage 2: Text Analysis (Timeout 15s)
        let textResult: ScannedData | null = null;
        try {
            const rawResults = await timeoutPromise<ScannedData[]>(15000, analyzeImageText(text));
            textResult = rawResults[0] || null;

            // ⚡ Calculate Confidence for Stage 2
            if (textResult) {
                const calc = calculateFinalConfidence(textResult, ocrScore, 'text');
                textResult.confidence = calc.score;
                textResult.confidence_breakdown = calc.breakdown;
            }

            logger?.logOpenAiText(true, textResult.type, textResult.type === 'UNKNOWN' ? 'unknown_type' : undefined);

        } catch (e: any) {
            console.warn('[Orchestrator] Stage 2 Failed:', e);
            const errorType = e instanceof OcrError ? e.type : OcrErrorType.UNKNOWN_ERROR;

            // PARTIAL SUCCESS Check:
            if (e.message?.includes('JSON') || errorType === OcrErrorType.PARSING_ERROR) {
                console.log('[Orchestrator] JSON Parse Error -> Attempting Partial Fallback');
                logger?.logOpenAiText(false, undefined, 'json_parse_error');
                // Don't kill process, treat as NULL result to trigger fallback logic or return partial
                // Use textRegex fallback immediately if we want to return "something"
                textResult = this.analyzeFromText(text);
            } else {
                logger?.logOpenAiText(false, undefined, errorType === OcrErrorType.TIMEOUT ? 'timeout' : 'stage2_exception');
                // If timeout/network, we might want to fail hard? 
                // Plan says: "Fail hard for timeout" but also "Partial Draft".
                // Let's rely on "Worth It" check. If Stage 2 timeouts, result is null.
            }
        }

        // 2. Evaluate if Stage 4 (Vision) is needed
        // Note: If textResult is partial (UNKNOWN) from fallback above, shouldTriggerStage4 will assess it.
        const needsFallback = this.shouldTriggerStage4(textResult, text);

        if (needsFallback && imageUri) {
            console.log('[Orchestrator] Triggering Stage 4 (Vision Fallback)...');
            try {
                // Read Image as Base64
                const base64 = await FileSystem.readAsStringAsync(imageUri, { encoding: FileSystem.EncodingType.Base64 });

                // 3. Stage 4: Vision Analysis (Timeout 20s)
                const visionResult = await timeoutPromise<ScannedData>(20000, analyzeImageVisual(base64));

                // ⚡ Calculate Confidence for Stage 4
                const calc = calculateFinalConfidence(visionResult, 0, 'vision');
                visionResult.confidence = calc.score;
                visionResult.confidence_breakdown = calc.breakdown;

                logger?.logOpenAiVision(true, visionResult.type);
                return visionResult;

            } catch (visionError: any) {
                console.error('[Orchestrator] Stage 4 Failed:', visionError);
                const vErrorType = visionError instanceof OcrError ? visionError.type : OcrErrorType.UNKNOWN_ERROR;

                logger?.logOpenAiVision(false, undefined, vErrorType === OcrErrorType.TIMEOUT ? 'timeout' : 'vision_exception');

                // If Vision fails, we fall back to:
                // 1. Text Result (if it existed)
                // 2. Partial Draft (if Text failed totally)
                if (vErrorType === OcrErrorType.TIMEOUT) {
                    throw new OcrError(OcrErrorType.TIMEOUT, "Vision Analysis Timed Out", 'openai_vision');
                }
            }
        } else {
            if (needsFallback) console.log('[Orchestrator] Stage 4 skipped (No Image URI or Not Worth It)');
        }

        // 4. Return Best Result
        if (textResult) return textResult;

        // Final Fallback: if everything failed but we have text, return partial
        return this.analyzeFromText(text);
    }

    /**
     * "Worth It" Logic for Stage 4
     */
    private shouldTriggerStage4(result: ScannedData | null, rawText: string): boolean {
        if (!result) return true;

        const isLowConf = result.confidence < 0.6;
        const isUnknown = result.type === 'UNKNOWN';
        const hasWarnings = result.warnings && result.warnings.length > 0;

        if (!isLowConf && !isUnknown && !hasWarnings) {
            return false;
        }

        const hasMoney = /[0-9,]+원|KRW|[0-9,]{4,}/.test(rawText);
        const hasDate = /202\d|199\d/.test(rawText);
        const hasKeywords = /결제|승인|주문|예약|초대/.test(rawText);

        if (hasMoney || hasDate || hasKeywords) {
            console.log('[Orchestrator] Worth It Scan: Detected Patterns despite failure.');
            return true;
        }

        if (rawText.length < 10) return false;

        return false;
    }

    // Legacy / Mock Support
    async analyzeGuestImage(imageUri: string): Promise<any> {
        return this.analyzeFromText("Legacy Mock Call");
    }
}
