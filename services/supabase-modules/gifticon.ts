import { supabase } from './client';
import { GifticonRecord, GifticonItem } from './types';

interface GifticonRow {
    id: string;
    product_name: string;
    sender_name: string | null;
    expiry_date: string;
    image_url: string | null;
    status: 'available' | 'used';
    estimated_price: number;
    barcode_number?: string | null;
}

/**
 * 기프티콘만 저장 (gifticons 테이블)
 * ✅ 수정: events 테이블 중복 저장 제거
 * - 통합 저장이 필요하면 saveUnifiedEvent(GIFTICON) 사용
 * - 이 함수는 gifticons 테이블에만 저장
 */
export async function saveGifticon(record: GifticonRecord): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('로그인이 필요합니다.');

    const { error } = await supabase
        .from('gifticons')
        .insert({
            user_id: user.id,
            product_name: record.productName,
            sender_name: record.senderName,
            expiry_date: record.expiryDate,
            image_url: record.imageUrl,
            status: record.status,
            estimated_price: record.estimatedPrice || 0,
            barcode_number: record.barcode_number
        });

    if (error) {
        console.error('Error saving gifticon:', error);
        throw error;
    }

    // ⚠️ 중복 저장 방지: events 테이블 저장은 saveUnifiedEvent에서만 처리
    // 인맥 장부 연동이 필요하면 saveUnifiedEvent(GIFTICON, data, uri) 호출 권장
}

export async function getGifticons(status?: GifticonItem['status']): Promise<GifticonItem[]> {
    let query = supabase
        .from('gifticons')
        .select('*')
        .order('expiry_date', { ascending: true });

    if (status) {
        query = query.eq('status', status);
    }

    const { data, error } = await query;

    if (error) {
        console.error('Error fetching gifticons:', error);
        return [];
    }

    const rows = (data || []) as GifticonRow[];
    return rows.map((row) => ({
        id: row.id,
        productName: row.product_name,
        senderName: row.sender_name || undefined,
        expiryDate: row.expiry_date,
        imageUrl: row.image_url || undefined,
        status: row.status,
        estimatedPrice: row.estimated_price,
        barcodeNumber: row.barcode_number || undefined,
    }));
}
