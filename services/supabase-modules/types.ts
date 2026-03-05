export type EventCategory = 'ceremony' | 'todo' | 'schedule' | 'expense' | 'interest';

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
    source: 'events' | 'ledger' | 'bank_transactions' | 'external' | 'interest'; // 데이터 출처 (삭제 시 사용)
    external_resource_id?: string; // 수집기(크롤러) 등에서 받아온 외부 고유 ID
    color?: string; // 캘린더 색상 (외부 일정 등)
    // Shared Calendar Fields
    calendar_id?: string;
    created_by?: string;
    calendarName?: string;
    calendarColor?: string;
}

