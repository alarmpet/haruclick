import { supabase } from '../services/supabase';

/**
 * OCR Cache Service
 * Stores OCR results keyed by image hash to avoid duplicate processing.
 */

export async function getOcrCache(hash: string): Promise<any | null> {
    try {
        const { data, error } = await supabase
            .from('ocr_text_cache')
            .select('result')
            .eq('image_hash', hash)
            .single();
        if (error && error.code !== 'PGRST116') { // row not found
            console.warn('[OCR Text Cache] fetch error:', error);
        }
        return data?.result ?? null;
    } catch (e) {
        console.error('[OCR Text Cache] get error', e);
        return null;
    }
}

export async function setOcrCache(hash: string, result: any): Promise<void> {
    try {
        const { error } = await supabase
            .from('ocr_text_cache')
            .upsert({ image_hash: hash, result }, { onConflict: 'image_hash' });
        if (error) {
            console.warn('[OCR Cache] upsert error:', error);
        }
    } catch (e) {
        console.error('[OCR Cache] set error', e);
    }
}
