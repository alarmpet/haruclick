import { GENERATE_ANALYSIS_PROMPT, SYSTEM_PROMPT } from './PromptTemplates';
import { fetchUserStats } from '../supabase';
import { extractTextFromImage } from '../ocr';
import { getCurrentOcrLogger } from '../OcrLogger';
import { analyzeImageText, InvitationResult } from './OpenAIService';

export interface AnalysisResult {
    recommendedAmount: number;
    minAmount: number;
    maxAmount: number;
    estimatedMealCost: number;
    reasoning: string;
    closenessScore: number;
}

export interface CommunityReaction {
    totalVotes: number;
    distribution: {
        amount: number;
        percentage: number;
        label: string;
    }[];
    topComment: string;
}

/**
 * 실제 OCR 수행 (ML Kit 사용)
 * ✅ Mock 제거됨
 */
async function performOCR(imageUri: string): Promise<string> {
    try {
        const text = await extractTextFromImage(imageUri);
        return text || "";
    } catch (e) {
        console.error("OCR Error in AnalysisEngine:", e);
        return "";
    }
}

/**
 * AI 분석으로 경조사 정보 추출 후 금액 계산
 * ✅ Mock 제거됨
 */
async function analyzeWithAI(ocrText: string, relation: string): Promise<AnalysisResult> {
    try {
        const aiResults = await analyzeImageText(ocrText);
        const aiResult = aiResults && aiResults.length > 0 ? aiResults[0] : null;

        if (aiResult && aiResult.type === 'INVITATION') {
            const invite = aiResult as InvitationResult;
            const baseAmount = invite.recommendedAmount || 100000;

            // 관계에 따른 금액 조정
            let adjustedAmount = baseAmount;
            if (relation === '가족') adjustedAmount = Math.max(baseAmount, 200000);
            else if (relation === '친한 친구') adjustedAmount = Math.max(baseAmount, 150000);
            else if (relation === '직장 동료') adjustedAmount = baseAmount;
            else if (relation === '지인') adjustedAmount = Math.min(baseAmount, 50000);

            // 호텔 여부 체크 (장소 기반)
            const isHotel = (invite.eventLocation || '').includes('호텔');
            const mealCost = isHotel ? 120000 : 60000;

            return {
                recommendedAmount: adjustedAmount,
                minAmount: adjustedAmount - 50000,
                maxAmount: adjustedAmount + 50000,
                estimatedMealCost: mealCost,
                reasoning: invite.recommendationReason || `${relation} 관계 기준 추천 금액입니다.`,
                closenessScore: relation === '가족' ? 5 : relation === '친한 친구' ? 4 : 3
            };
        }

        // 기본값 반환 (INVITATION이 아닌 경우)
        return {
            recommendedAmount: 100000,
            minAmount: 50000,
            maxAmount: 150000,
            estimatedMealCost: 60000,
            reasoning: "일반적인 경조사 기준 금액입니다.",
            closenessScore: 3
        };

    } catch (e) {
        console.error("AI Analysis Error:", e);
        // 폴백: 관계 기반 기본 추천
        const baseByRelation: Record<string, number> = {
            '가족': 200000,
            '친한 친구': 150000,
            '직장 동료': 100000,
            '대학 동기': 100000,
            '지인': 50000,
            '거래처': 100000
        };
        const base = baseByRelation[relation] || 100000;

        return {
            recommendedAmount: base,
            minAmount: base - 50000,
            maxAmount: base + 50000,
            estimatedMealCost: 60000,
            reasoning: `${relation} 관계 기준 기본 추천 금액입니다. (AI 분석 실패)`,
            closenessScore: 3
        };
    }
}

export async function analyzeInvitation(imageUri: string, relation: string): Promise<AnalysisResult> {
    try {
    // 1. OCR로 텍스트 추출
    const ocrText = await performOCR(imageUri);

    // 2. AI 분석 및 금액 계산
    const result = await analyzeWithAI(ocrText, relation);

        return result;
    } finally {
        const logger = getCurrentOcrLogger();
        if (logger) {
            await logger.flush();
        }
    }
}

export async function getCommunityPrediction(eventType: string): Promise<CommunityReaction> {
    await new Promise(resolve => setTimeout(resolve, 2000)); // Suspense

    return {
        totalVotes: 342,
        distribution: [
            { amount: 100000, percentage: 65, label: '10만원' },
            { amount: 50000, percentage: 25, label: '5만원' },
            { amount: 150000, percentage: 10, label: '15만원+' },
        ],
        topComment: "요즘 물가 생각하면 기본 10만원이 국룰이죠. 호텔이면 더더욱!"
    };
}
