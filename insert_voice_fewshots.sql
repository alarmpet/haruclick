-- Voice Pipeline Few-shot Examples (Phase 2)
-- 5 Core Examples specific to Voice Input characteristics (High Ambiguity, Colloquialism)

-- 1. Incomplete Appointment (Missing Title)
-- Input: "내일 오후 3시 강남역"
INSERT INTO approved_fewshots (input_text, output_json, document_type, input_type, is_active, priority)
VALUES (
    '내일 오후 3시 강남역',
    '{
        "transactions": [{
            "type": "APPOINTMENT",
            "confidence": 0.9,
            "title": "일정",
            "place_name": "강남역",
            "date_or_datetime": "2024-01-20 15:00",
            "evidence": ["내일 오후 3시", "강남역"],
            "warnings": ["missing_title_inferred"]
        }]
    }',
    'APPOINTMENT',
    'VOICE',
    true,
    100
);

-- 2. Colloquial Amount (STT Error Correction)
-- Input: "친구 결혼식 축의금 산만원 보냈어" ("산만원" -> 30000)
INSERT INTO approved_fewshots (input_text, output_json, document_type, input_type, is_active, priority)
VALUES (
    '친구 결혼식 축의금 산만원 보냈어',
    '{
        "transactions": [{
            "type": "INVITATION",
            "confidence": 0.95,
            "event_type": "wedding",
            "recommended_amount": 30000,
            "relation": "친구",
            "evidence": ["친구", "결혼식", "축의금", "산만원"],
            "warnings": ["stt_correction_amount"]
        }]
    }',
    'INVITATION',
    'VOICE',
    true,
    100
);

-- 3. Ambiguous Store Payment (Colloquial)
-- Input: "어제 스타벅스에서 커피 2잔 만이천원 긁음"
INSERT INTO approved_fewshots (input_text, output_json, document_type, input_type, is_active, priority)
VALUES (
    '어제 스타벅스에서 커피 2잔 만이천원 긁음',
    '{
        "transactions": [{
            "type": "STORE_PAYMENT",
            "confidence": 0.98,
            "merchant_name": "Starbucks(스타벅스)",
            "amount": 12000,
            "category": "식비",
            "subCategory": "카페/베이커리",
            "date_or_datetime": "2024-01-18",
            "payment_method": "카드",
            "evidence": ["스타벅스", "만이천원", "긁음"],
            "memo": "커피 2잔"
        }]
    }',
    'STORE_PAYMENT',
    'VOICE',
    true,
    100
);

-- 4. Social Splitting (N-bbang)
-- Input: "오늘 점심 팀원들이랑 5명이서 5만원 나왔는데 엔빵하자"
INSERT INTO approved_fewshots (input_text, output_json, document_type, input_type, is_active, priority)
VALUES (
    '오늘 점심 팀원들이랑 5명이서 5만원 나왔는데 엔빵하자',
    '{
        "transactions": [{
            "type": "SOCIAL",
            "confidence": 0.9,
            "total_amount": 50000,
            "per_person_amount": 10000,
            "members": ["팀원들"],
            "evidence": ["5명이서", "5만원", "엔빵"],
            "memo": "오늘 점심"
        }]
    }',
    'SOCIAL',
    'VOICE',
    true,
    100
);

-- 5. Relative Date & Time 
-- Input: "이번 주 금요일 저녁 7시 회식 장소 강남"
INSERT INTO approved_fewshots (input_text, output_json, document_type, input_type, is_active, priority)
VALUES (
    '이번 주 금요일 저녁 7시 회식 장소 강남',
    '{
        "transactions": [{
            "type": "APPOINTMENT",
            "confidence": 0.95,
            "title": "회식",
            "place_name": "강남",
            "date_or_datetime": "2024-01-26 19:00",
            "evidence": ["이번 주 금요일", "저녁 7시", "회식", "강남"]
        }]
    }',
    'APPOINTMENT',
    'VOICE',
    true,
    100
);
