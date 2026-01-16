import { supabase } from './supabase';
import { ScannedData } from './ai/OpenAIService';

export interface OcrCorrectionRecord {
    itemIndex: number;
    originalData: ScannedData | null;
    correctedData: ScannedData;
    wasSelected: boolean;
}

export async function logOcrCorrections(params: {
    sessionId?: string | null;
    imageHash?: string;
    source?: string;
    corrections: OcrCorrectionRecord[];
}): Promise<void> {
    if (!params.corrections || params.corrections.length === 0) return;

    const { data: { user } } = await supabase.auth.getUser();
    const records = params.corrections.map((correction) => ({
        session_id: params.sessionId ?? null,
        user_id: user?.id ?? null,
        image_hash: params.imageHash ?? null,
        source: params.source ?? 'scan_result',
        item_index: correction.itemIndex,
        was_selected: correction.wasSelected,
        original_data: correction.originalData,
        corrected_data: correction.correctedData
    }));

    const { error } = await supabase.from('ocr_corrections').insert(records);
    if (error) {
        throw error;
    }
}
