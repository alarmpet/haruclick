export const OCR_TEST_SAMPLES = [
    // ===================================
    // Type A: Finance_Card (Installments)
    // ===================================
    {
        "type": "STORE_PAYMENT",
        "subtype": "CARD_APPROVAL",
        "merchant_name": "소니코리아",
        "amount": 1200000,
        "date_or_datetime": "2024-01-16T16:10:00+09:00",
        "category": "쇼핑",
        "confidence": 0.95,
        "evidence": ["06개월", "1,200,000원", "소니코리아"],
        "source": "SCREENSHOT",
        "warnings": [],
        "raw_text": "[현대카드]-승인 김*한 1,200,000원 06개월 01/16 16:10 소니코리아"
    },

    // ===================================
    // Type B: Finance_Overseas (USD)
    // ===================================
    {
        "type": "STORE_PAYMENT",
        "subtype": "CARD_APPROVAL",
        "merchant_name": "NETFLIX.COM",
        "amount": 15.99,
        "currency": "USD",
        "date_or_datetime": "2024-01-16T15:50:00+09:00",
        "category": "구독",
        "confidence": 0.96,
        "evidence": ["USD 15.99", "NETFLIX", "해외승인"],
        "source": "SCREENSHOT",
        "warnings": [],
        "raw_text": "신한카드(00) 해외승인 김*한님 01/16 15:50 USD 15.99 NETFLIX.COM"
    },

    // ===================================
    // Type C: Finance_Cancel (Negative)
    // ===================================
    {
        "type": "STORE_PAYMENT",
        "subtype": "CARD_CANCEL", // or CARD_APPROVAL with negative amount
        "merchant_name": "NETFLIX",
        "amount": -15.99,
        "currency": "USD",
        "date_or_datetime": "2024-01-16T18:00:00+09:00",
        "category": "구독",
        "confidence": 0.98,
        "evidence": ["취소", "-15.99", "NETFLIX"],
        "source": "SCREENSHOT",
        "warnings": [],
        "raw_text": "롯데카드 김*한님 USD -15.99 해외승인취소 01/16 18:00 NETFLIX"
    },

    // ===================================
    // Type D: Social_Obituary (Funeral)
    // ===================================
    {
        "type": "INVITATION",
        "subtype": "FUNERAL",
        "event_type": "장례식",
        "eventType": "funeral",
        "date_or_datetime": "2024-07-11T08:00:00+09:00",
        "place_name": "창원파티마병원 장례식장",
        "host_names": ["조보훈"],
        "recommended_amount": 100000,
        "confidence": 0.95,
        "evidence": ["빈소: 창원파티마병원 장례식장", "발인: 07월 11일"],
        "source": "SCREENSHOT",
        "warnings": [],
        "raw_text": "[부고] 故조보훈님께서 별세하셨기에... 빈소: 창원파티마병원 장례식장 101호실...",
        "account": "보훈은행 3585-1566-3585" // Custom field for reference in few-shot
    },

    // ===================================
    // Type E: Social_Wedding (Weddings)
    // ===================================
    {
        "type": "INVITATION",
        "subtype": "WEDDING",
        "event_type": "결혼식",
        "eventType": "wedding",
        "date_or_datetime": "2024-12-25T13:00:00+09:00",
        "place_name": "더채플앳청담",
        "host_names": ["홍길동"], // Derived from account holder if evident
        "recommended_amount": 50000,
        "confidence": 0.92,
        "evidence": ["오후 1시", "더채플앳청담", "신랑측 계좌"],
        "source": "SCREENSHOT",
        "warnings": [],
        "raw_text": "[청첩장] 서로의 다름을 채워가며... 일시: 12월 25일 토요일 오후 1시 장소: 더채플앳청담...",
        "account": "우리은행 1002-123-456789"
    },

    // ===================================
    // Type F: Payment_VirtualAccount (Shopping)
    // ===================================
    {
        "type": "BANK_TRANSFER",
        "subtype": "WITHDRAW",
        "direction": "out",
        "amount": 54000,
        "counterparty": "(주)무신사",
        "date_or_datetime": "2024-01-17T23:59:00+09:00",   // Payment Deadline
        "category": "쇼핑",
        "isUtility": true, // Virtual account -> utility-like behavior? Or just Store Payment via Transfer?
        // User prompt said "Payment_VirtualAccount". 
        // In app logic, this maps to BANK_TRANSFER with isUtility=true often.
        "confidence": 0.90,
        "evidence": ["입금요청: 54,000원", "입금기한: 2024/01/17"],
        "source": "SCREENSHOT",
        "warnings": [],
        "raw_text": "[무신사] 주문번호... 입금요청: 54,000원 입금계좌: 신한은행... (주)무신사 입금기한..."
    },

    // ===================================
    // Type G: Tax_Utility (Public Bills)
    // ===================================
    {
        "type": "BILL", // Or BANK_TRANSFER with isUtility=true. 
        // App logic maps BILL to todo. 
        // User example output: "Category": "Tax_Utility" (conceptual).
        // Let's use BILL type for strict matching or BANK_TRANSFER(utility).
        // Based on OpenAIService.ts logic: "BILL" maps to 'todo'.
        // "BANK_TRANSFER"+"isUtility" maps to 'ledger'.
        // Example G is 'Bill' effectively but handled as Tax.
        "subtype": "TAX",
        "bill_name": "1월 등록면허세",
        "title": "1월 등록면허세",
        "amount": 40500,
        "due_date": "2024-01-31",
        "virtual_account": "우리은행 1234-567-890123",
        "confidence": 0.94,
        "evidence": ["납부기한: 01월 31일", "납부금액: 40,500원", "(납기 후 금액: 41,710원) 무시"],
        "source": "PHOTO",
        "warnings": [],
        "raw_text": "[강북구청] 1월 등록면허세... 납부기한: 01월 31일까지 납부금액: 40,500원..."
    },
    // ===================================
    // Type H: Delivery (Parcel)
    // ===================================
    {
        "type": "APPOINTMENT",
        "subtype": "DELIVERY",
        "title": "택배 도착 예정",
        "date_or_datetime": "2024-01-20T14:00:00+09:00",
        "place_name": "자택",
        "memo": "[코드엠샵] 주문번호 20240118-001 (배송중)",
        "confidence": 0.88,
        "evidence": ["배송중", "주문번호", "코드엠샵"],
        "source": "SCREENSHOT",
        "warnings": [],
        "raw_text": "[코드엠샵] 주문번호 20240118-001 배송중입니다. 상품명: 겨울 코트"
    },

    // ===================================
    // Type I: Fintech_Payment (Toss/Naver)
    // ===================================
    {
        "type": "STORE_PAYMENT",
        "subtype": "CARD_APPROVAL",
        "merchant_name": "토스결제",
        "amount": 25000,
        "date_or_datetime": "2024-02-15T12:30:00+09:00",
        "category": "쇼핑",
        "payment_method": "E_PAY", // Fintech
        "confidence": 0.92,
        "evidence": ["토스", "결제", "25,000원"],
        "source": "SCREENSHOT",
        "warnings": [],
        "raw_text": "[Toss] 25,000원 결제완료. 가맹점: 무신사스토어 일시: 02/15 12:30"
    },

    // ===================================
    // Type J: Medical_Appointment (Vs Funeral)
    // ===================================
    {
        "type": "APPOINTMENT",
        "subtype": "HOSPITAL",
        "title": "서울대병원 진료",
        "date_or_datetime": "2024-03-10T09:30:00+09:00",
        "place_name": "서울대병원 내과",
        "memo": "예약 시간 10분 전 도착 요망",
        "confidence": 0.95,
        "evidence": ["진료 예약", "서울대병원", "3월 10일"],
        "source": "SCREENSHOT",
        "warnings": [],
        "raw_text": "[Web발신] 서울대병원 내과 진료 예약안내. 일시: 3월 10일(월) 09:30. 본관 2층으로 오십시오."
    }
] as const;
