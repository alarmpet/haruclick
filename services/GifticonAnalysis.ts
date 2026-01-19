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
     * ✅ 다중 거래 지원을 위해 ScannedData[] 반환
     */
    async analyzeWithAI(text: string, imageUri?: string, ocrScore: number = 50): Promise<ScannedData[]> {
        const logger = getCurrentOcrLogger();
        console.log(`[Orchestrator] Starting Analysis... (OCR Score: ${ocrScore})`);

        // 1. Stage 2: Text Analysis (Timeout 15s)
        let textResults: ScannedData[] = [];
        try {
            const rawResults = await timeoutPromise<ScannedData[]>(25000, analyzeImageText(text));
            textResults = rawResults || [];

            // ✅ OpenAI 신뢰도 유지 (이중 계산 제거) - breakdown만 추가
            for (const result of textResults) {
                const calc = calculateFinalConfidence(result, ocrScore, 'text');
                // result.confidence는 OpenAI 값 유지
                result.confidence_breakdown = calc.breakdown;
            }

            const firstResult = textResults[0];
            logger?.logOpenAiText(true, firstResult?.type, firstResult?.type === 'UNKNOWN' ? 'unknown_type' : undefined);

        } catch (e: any) {
            console.warn('[Orchestrator] Stage 2 Failed:', e?.message || e);
            const errorType = e instanceof OcrError ? e.type : OcrErrorType.UNKNOWN_ERROR;

            // PARTIAL SUCCESS Check:
            if (e.message?.includes('JSON') || errorType === OcrErrorType.PARSING_ERROR) {
                console.log('[Orchestrator] JSON Parse Error -> Attempting Partial Fallback');
                logger?.logOpenAiText(false, undefined, 'json_parse_error');
                // Use textRegex fallback
                textResults = [this.analyzeFromText(text)];
            } else {
                logger?.logOpenAiText(false, undefined, errorType === OcrErrorType.TIMEOUT ? 'timeout' : 'stage2_exception');
                // Stage 2 실패 시 빈 배열로 유지 (Stage 4로 폴백)
            }
        }

        // 2. Evaluate if Stage 4 (Vision) is needed
        // ✅ 첫 번째 결과로 폴백 필요 여부 판단
        const firstTextResult = textResults[0] || null;
        const needsFallback = this.shouldTriggerStage4(firstTextResult, text);

        if (needsFallback && imageUri) {
            console.log('[Orchestrator] Triggering Stage 4 (Vision Fallback)...');
            try {
                // Read Image as Base64
                const base64 = await FileSystem.readAsStringAsync(imageUri, { encoding: FileSystem.EncodingType.Base64 });

                // 3. Stage 4: Vision Analysis (Timeout 20s) - ✅ 다중 결과 반환
                const visionResults = await timeoutPromise<ScannedData[]>(30000, analyzeImageVisual(base64));

                // ✅ OpenAI 신뢰도 유지 (이중 계산 제거) - breakdown만 추가
                for (const result of visionResults) {
                    const calc = calculateFinalConfidence(result, 0, 'vision');
                    // result.confidence는 OpenAI 값 유지
                    result.confidence_breakdown = calc.breakdown;
                }

                logger?.logOpenAiVision(true, visionResults[0]?.type);
                console.log(`[Orchestrator] Vision returned ${visionResults.length} transaction(s)`);
                return visionResults;

            } catch (visionError: any) {
                console.error('[Orchestrator] Stage 4 Failed:', visionError?.message || visionError);
                const vErrorType = visionError instanceof OcrError ? visionError.type : OcrErrorType.UNKNOWN_ERROR;

                logger?.logOpenAiVision(false, undefined, vErrorType === OcrErrorType.TIMEOUT ? 'timeout' : 'vision_exception');

                // If Vision fails, we fall back to:
                // 1. Text Results (if existed)
                // 2. Partial Draft (if Text failed totally)
                // ✅ Vision 타임아웃 시 Text 결과로 폴백 (예외 던지지 않음)
                if (vErrorType === OcrErrorType.TIMEOUT && textResults.length > 0) {
                    console.log('[Orchestrator] Vision timeout, falling back to Text results');
                    return textResults;
                }
            }
        } else {
            if (needsFallback) console.log('[Orchestrator] Stage 4 skipped (No Image URI or Not Worth It)');
        }

        // 4. Return Best Result - ✅ 항상 배열 반환
        if (textResults.length > 0) return textResults;

        // Final Fallback: if everything failed but we have text, return partial
        return [this.analyzeFromText(text)];
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
        // ✅ 날짜 패턴 확장: MM/DD, MM월DD일 형식도 포함
        const hasDate = /202\d|199\d|\d{1,2}\/\d{1,2}|\d{1,2}월\s*\d{1,2}일/.test(rawText);
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
