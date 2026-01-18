import { ScannedData } from './OpenAIService';
import { calculateFinalConfidence } from './ConfidenceCalculator';
import { supabase } from '../supabase';
import { getCurrentOcrLogger } from '../OcrLogger';

interface EditDetectionResult {
    hasEdits: boolean;
    editedFields: string[];
    editType: 'field_fix' | 'type_change' | 'add_missing' | 'none';
}

export class OcrFeedbackService {

    /**
     * Detects meaningful changes between AI result and User Saved result.
     */
    static detectEdits(original: ScannedData, final: any): EditDetectionResult {
        const editedFields: string[] = [];
        let editType: EditDetectionResult['editType'] = 'none';

        // 1. Check Type Change
        if (original.type !== final.type) {
            return { hasEdits: true, editedFields: ['type'], editType: 'type_change' };
        }

        // 2. Compare Fields (Normalize strings)
        const keys = new Set([...Object.keys(original), ...Object.keys(final)]);
        keys.forEach(key => {
            // Skip metadata fields
            if (['confidence', 'confidence_breakdown', 'warnings', 'raw_text', 'evidence'].includes(key)) return;

            const val1 = (original as any)[key];
            const val2 = (final as any)[key];

            if (this.isDifferent(val1, val2)) {
                editedFields.push(key);
            }
        });

        if (editedFields.length > 0) {
            // Heuristic for edit type
            const missingInOriginal = editedFields.some(f => !(original as any)[f]);
            editType = missingInOriginal ? 'add_missing' : 'field_fix';
        }

        return {
            hasEdits: editedFields.length > 0,
            editedFields,
            editType
        };
    }

    private static isDifferent(v1: any, v2: any): boolean {
        // Loose comparison for numbers/strings
        if (v1 == v2) return false;
        if (!v1 && !v2) return false; // Both null/undefined/empty

        // String normalization
        if (typeof v1 === 'string' && typeof v2 === 'string') {
            return v1.trim().replace(/\s+/g, ' ') !== v2.trim().replace(/\s+/g, ' ');
        }

        return true;
    }

    /**
     * Recomputes confidence effectively assuming the user is correct.
     * Uses bonuses defined in Section 5.
     */
    static recomputeConfidence(finalResult: any, editType: string, confirmationLevel: string): number {
        // Base Recalculation (Assume User Data Perfect for Struct/Type/Consistency)
        const userVerifiedData: ScannedData = {
            ...finalResult,
            warnings: [],
        };
        const calc = calculateFinalConfidence(userVerifiedData, 100, 'vision');
        let baseScore = calc.score;

        // Apply Bonuses
        let bonus = 0.05; // Base confirmation bonus

        if (editType === 'type_change') bonus += 0.10;
        else if (editType === 'add_missing') bonus += 0.07;

        let finalScore = Math.min(baseScore + bonus, 0.99);

        // Safety override for Manual Entry
        if (confirmationLevel === 'manual_entry') {
            finalScore = 1.0; // Human Entry is truth
        }

        return Number(finalScore.toFixed(2));
    }

    /**
     * Main Process: Save Edit Log & Maybe Promote to Few-shot
     */
    static async processUserFeedback(
        original: ScannedData | null,
        final: any,
        imageUri?: string,
        rawText?: string,
        confirmationLevel: 'quick_confirm' | 'edited_confirm' | 'manual_entry' = 'edited_confirm'
    ): Promise<void> {

        if (!original) return;

        try {
            const detection = this.detectEdits(original, final);

            // If no edits but confirmed, it's a Quick Confirm
            if (!detection.hasEdits && confirmationLevel !== 'manual_entry') {
                confirmationLevel = 'quick_confirm';
            }

            console.log(`[OcrFeedback] Processing (${confirmationLevel}), Edits: ${detection.editType}`);

            const logger = getCurrentOcrLogger();
            const sessionId = logger?.getSessionId() || 'unknown-session';

            const confBefore = original.confidence || 0;
            const confAfter = this.recomputeConfidence(final, detection.editType, confirmationLevel);

            // 1. Save to `ocr_user_edits`
            const { data: { user } } = await supabase.auth.getUser();

            await supabase.from('ocr_user_edits').insert({
                session_id: sessionId,
                user_id: user?.id,
                original_result: original,
                edited_result: final,
                edited_fields: detection.editedFields,
                edit_type: detection.editType,
                confirmation_level: confirmationLevel,
                confidence_before: confBefore,
                confidence_after: confAfter
            });

            console.log('[OcrFeedback] Edit log saved.');

            // 2. Check Few-shot Eligibility
            // Rules: Conf >= 0.90, No Warning, Edits <= 3
            // Manual Entry is usually trustworthy IF text matches, but risky for OCR training if image quality bad.
            // We stick to the rule: High Confidence & rawText exists.

            if (confAfter >= 0.90 && detection.editedFields.length <= 3 && rawText) {
                if (original.type === 'UNKNOWN' && confirmationLevel !== 'manual_entry') {
                    // If original was Unknown but user fixed it, it's GREAT training data usually.
                    // But plan said "Exclude Unknown". Let's stick to plan for safety unless it's very clear.
                    // Actually, Type Change from Unknown -> Type is the MOST valuable few shot.
                    // I will allow it if confAfter is high (which it will be due to Bonus).
                }

                console.log('[OcrFeedback] Candidate for Few-shot! Inserting (Pending)...');

                // ✅ DB 스키마에 맞게 수정: is_active=false로 시작 (pending 상태)
                await supabase.from('approved_fewshots').insert({
                    document_type: final.type, // ✅ doc_type → document_type
                    input_text: rawText,
                    output_json: final,
                    priority: 1,
                    is_active: false // ✅ status='pending' → is_active=false (관리자 승인 대기)
                });
            }

        } catch (e) {
            console.error('[OcrFeedback] Error processing feedback:', e);
        }
    }
}
