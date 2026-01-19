export type EventCategory = 'ceremony' | 'todo' | 'schedule' | 'expense';

export interface EventRecord {
    id: string;
    category: EventCategory;
    type: 'wedding' | 'funeral' | 'birthday' | 'other' | 'todo' | 'schedule' | 'gift' | 'transfer' | 'receipt';
    name: string;
    relation?: string;
    date: string;
    amount?: number;
    isReceived?: boolean;
    memo?: string;
    isPaid?: boolean;
    isCompleted?: boolean; // 할일 완료 여부
    startTime?: string; // 시작 시간
    endTime?: string; // 종료 시간
    location?: string; // 장소
    source: 'events' | 'ledger' | 'bank_transactions' | 'external'; // 데이터 출처 (삭제 시 사용)
    color?: string; // 캘린더 색상 (외부 일정 등)
}

export interface GifticonRecord {
    productName: string;
    senderName?: string;
    expiryDate: string;
    imageUrl?: string;
    status: 'available' | 'used';
    estimatedPrice: number;
    barcode_number?: string;
}

export interface GifticonItem {
    id: string;
    productName: string;
    senderName?: string;
    expiryDate: string;
    imageUrl?: string;
    status: 'available' | 'used';
    estimatedPrice: number;
    barcodeNumber?: string;
}
