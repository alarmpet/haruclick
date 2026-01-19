import { ScannedData, ScanType } from './OpenAIService';

interface ConfidenceBreakdown {
    ocr: number;
    struct: number;
    type: number;
    consistency: number;
}

export interface FinalConfidenceResult {
    score: number;
    breakdown: ConfidenceBreakdown;
}

// ?렞 Mandatory Fields Definition
const MANDATORY_FIELDS: Record<ScanType, string[]> = {
    GIFTICON: ['productName', 'expiryDate'], // Removed brandName as mandatory for practical reasons
    INVITATION: ['eventDate', 'eventLocation'],
    OBITUARY: ['deceased', 'funeralLocation', 'eventDate'],
    STORE_PAYMENT: ['amount', 'merchant', 'date'],
    BANK_TRANSFER: ['amount', 'transactionType'], // targetName usually exists but amount/type are critical
    RECEIPT: ['amount', 'merchant', 'date'],
    TRANSFER: ['amount'],
    BILL: ['amount', 'dueDate'],
    SOCIAL: ['amount'],
    APPOINTMENT: ['title', 'location', 'date'],
    UNKNOWN: []
};

/**
 * Calculates the Final System Confidence based on 4 axes.
 * Formula: 0.30*OCR + 0.35*Struct + 0.20*Type + 0.15*Consistency
 */
export function calculateFinalConfidence(
    aiResult: ScannedData,
    ocrQualityScore: number, // 0 to 100 (from ML Kit / Stage 1)
    stage: 'text' | 'vision'
): FinalConfidenceResult {

    // 1. C_ocr (30%)
    let c_ocr = 0;
    if (stage === 'vision') {
        // Vision implies OCR was hard (Stage 4), but AI Vision is generally very good at reading.
        // Base 0.85 + Bonus 0.10 for Vision power.
        c_ocr = 0.95;
    } else {
        // Text Stage: Normalize ML Kit Score (0-100) -> 0.0-1.0
        // Cap at 0.95 to leave room for doubt.
        c_ocr = Math.min(Math.max(ocrQualityScore / 100, 0), 0.95);
    }

    // 2. C_struct (35%)
    let c_struct = 1.0;
    const required = MANDATORY_FIELDS[aiResult.type] || [];
    if (required.length > 0) {
        let presentCount = 0;
        // @ts-ignore - Dynamic access to fields
        required.forEach(field => { if (aiResult[field]) presentCount++; });

        c_struct = presentCount / required.length;
    } else if (aiResult.type === 'UNKNOWN') {
        c_struct = 0.5; // Unknown structure is inherently weak
    }

    // Penalties for Structure
    if (aiResult.warnings && aiResult.warnings.length > 0) {
        c_struct -= 0.20; // Specific warnings like 'missing_amount'
    }
    // Deep Check for Nulls in Critical Fields (even if not in MANDATORY list but structurally important)
    if (aiResult.type === 'STORE_PAYMENT' && (aiResult as any).amount === 0) c_struct -= 0.15;

    c_struct = Math.max(0, c_struct);


    // 3. C_type (20%)
    // AI usually gives high confidence, but we adjust based on subtype or specific type stability.
    let c_type = aiResult.confidence || 0.8; // Start with AI's raw confidence

    // Bonus/Penalty
    if (aiResult.subtype) c_type += 0.05;
    if (aiResult.type === 'UNKNOWN') c_type = Math.min(c_type, 0.4); // Unknown type cap

    c_type = Math.min(1.0, Math.max(0, c_type));


    // 4. C_consistency (15%)
    let c_consist = 1.0;

    // Date Format Check (ISO YYYY-MM-DD)
    const dateField = (aiResult as any).date || (aiResult as any).eventDate || (aiResult as any).expiryDate || (aiResult as any).dueDate;
    if (dateField && !/^\d{4}-\d{2}-\d{2}$/.test(dateField)) {
        c_consist -= 0.15;
    }

    // Amount Sanity Check (>0)
    const amountField = (aiResult as any).amount || (aiResult as any).estimatedPrice;
    if (typeof amountField === 'number' && amountField <= 0) {
        c_consist -= 0.15;
    }

    c_consist = Math.min(1.0, Math.max(0.4, c_consist)); // Floor at 0.4


    // 5. Final Calculation
    let finalScore =
        (0.35 * c_ocr) +
        (0.25 * c_struct) +
        (0.20 * c_type) +
        (0.20 * c_consist);

    // 6. Hard Clamps (Safety Nets)
    const missingAnyRequired = required.some(field => !(aiResult as any)[field]);
    if (missingAnyRequired) {
        finalScore = Math.min(finalScore, 0.79); // Never trust missing fields fully
    }

    if (aiResult.type === 'UNKNOWN') {
        finalScore = Math.min(finalScore, 0.49); // Unknown is always failed
    }

    if (stage === 'vision' && !missingAnyRequired && c_struct >= 0.9) {
        finalScore = Math.max(finalScore, 0.75); // Vision + Perfect Struct = Trustworthy
    }

    // Normalize to 2 decimal places
    finalScore = Number(finalScore.toFixed(2));

    return {
        score: finalScore,
        breakdown: {
            ocr: Number(c_ocr.toFixed(2)),
            struct: Number(c_struct.toFixed(2)),
            type: Number(c_type.toFixed(2)),
            consistency: Number(c_consist.toFixed(2))
        }
    };
}

