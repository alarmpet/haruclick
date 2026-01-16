/**
 * RecommendationEngine.ts
 * 2026년 상반기 최신 데이터 기반 축의금/부조금 추천 엔진
 * 
 * 데이터 출처: 한국소비자원, 웨딩업계 리포트, 카카오페이 통계
 * 최종 업데이트: 2026년 1월 (예식장 50곳+ 보유)
 */

// ============================================================
// 1. 호텔별 식대 (2026년 상반기 기준, 1인당) - 35개+
// ============================================================
export const HOTEL_MEAL_COSTS: Record<string, { min: number; max: number; avg: number }> = {
    // === 특급 호텔 (15~25만원) ===
    '신라호텔': { min: 160000, max: 210000, avg: 185000 },
    '롯데호텔': { min: 155000, max: 215000, avg: 180000 },
    '롯데호텔월드': { min: 120000, max: 180000, avg: 150000 },
    '롯데호텔잠실': { min: 120000, max: 180000, avg: 150000 },
    '워커힐': { min: 150000, max: 200000, avg: 175000 },
    '그랜드워커힐': { min: 150000, max: 200000, avg: 175000 },
    '비스타워커힐': { min: 130000, max: 170000, avg: 150000 },
    '조선팰리스': { min: 150000, max: 200000, avg: 175000 },
    '그랜드하얏트': { min: 170000, max: 200000, avg: 170000 },
    '파크하얏트': { min: 180000, max: 250000, avg: 215000 },
    '포시즌스': { min: 200000, max: 280000, avg: 240000 },
    '시그니엘': { min: 180000, max: 250000, avg: 210000 },
    '반얀트리': { min: 180000, max: 230000, avg: 200000 },
    '그랜드인터컨티넨탈': { min: 150000, max: 200000, avg: 175000 },
    '그랜드조선': { min: 140000, max: 180000, avg: 160000 },

    // === 프리미엄 호텔 (10~18만원) ===
    '인터컨티넨탈': { min: 130000, max: 180000, avg: 155000 },
    '콘래드': { min: 150000, max: 200000, avg: 175000 },
    '웨스틴조선': { min: 140000, max: 180000, avg: 160000 },
    '메리어트': { min: 130000, max: 170000, avg: 150000 },
    'JW메리어트': { min: 150000, max: 200000, avg: 175000 },
    '힐튼': { min: 120000, max: 170000, avg: 145000 },
    '밀레니엄힐튼': { min: 120000, max: 160000, avg: 140000 },
    '더플라자': { min: 140000, max: 190000, avg: 165000 },
    '임피리얼팰리스': { min: 130000, max: 170000, avg: 150000 },

    // === 비즈니스 호텔 (8~15만원) ===
    '노보텔': { min: 99000, max: 140000, avg: 120000 },
    '노보텔앰배서더': { min: 99000, max: 140000, avg: 120000 },
    '르메르디앙': { min: 100000, max: 150000, avg: 125000 },
    '쉐라톤': { min: 100000, max: 150000, avg: 125000 },
    '쉐라톤그랜드': { min: 100000, max: 150000, avg: 125000 },
    '보코': { min: 89000, max: 120000, avg: 100000 },
    '보코서울강남': { min: 89000, max: 110000, avg: 99000 },
    '앰배서더': { min: 100000, max: 140000, avg: 120000 },
    '서울가든호텔': { min: 88000, max: 110000, avg: 99000 },
    '라마다': { min: 80000, max: 120000, avg: 100000 },
    '베스트웨스턴': { min: 70000, max: 100000, avg: 85000 },
    '이비스': { min: 70000, max: 100000, avg: 85000 },
};

// ============================================================
// 2. 컨벤션/웨딩홀 식대 (2026년 기준) - 50개+
// ============================================================
export const CONVENTION_MEAL_COSTS: Record<string, { min: number; max: number; avg: number }> = {
    // === 강남권 프리미엄 (9~13만원) ===
    '더채플앳청담': { min: 100000, max: 130000, avg: 115000 },
    '아펠가모': { min: 90000, max: 120000, avg: 105000 },
    '라비돌웨딩': { min: 85000, max: 110000, avg: 95000 },
    '엘타워': { min: 100000, max: 120000, avg: 110000 },
    '더화이트베일': { min: 100000, max: 120000, avg: 110000 },
    '라비두스': { min: 80000, max: 100000, avg: 90000 },
    '루치페로': { min: 70000, max: 90000, avg: 80000 },
    'S컨벤션': { min: 90000, max: 100000, avg: 95000 },
    '강남L타워': { min: 90000, max: 110000, avg: 100000 },
    '더리버사이드호텔': { min: 85000, max: 110000, avg: 95000 },

    // === 잠실/송파 (8~11만원) ===
    '더컨벤션잠실': { min: 85000, max: 110000, avg: 95000 },
    '롯데호텔월드잠실': { min: 120000, max: 180000, avg: 150000 },
    '잠실파크컨벤션': { min: 75000, max: 95000, avg: 85000 },
    '라비에벨잠실': { min: 80000, max: 100000, avg: 90000 },

    // === 여의도 (6~8만원) ===
    '여의도웨딩컨벤션': { min: 59000, max: 82000, avg: 72000 },
    '더파티움여의도': { min: 52000, max: 72000, avg: 62000 },
    '콘래드여의도': { min: 120000, max: 160000, avg: 140000 },
    '페어몬트여의도': { min: 130000, max: 170000, avg: 150000 },

    // === 서울 기타 (6~9만원) ===
    // 혜화/종로
    'HW컨벤션': { min: 70000, max: 90000, avg: 80000 },
    '성균관컨벤션': { min: 50000, max: 70000, avg: 60000 },
    '세종ICC': { min: 70000, max: 90000, avg: 80000 },
    '그랑서울': { min: 75000, max: 95000, avg: 85000 },

    // 건대/광진/성동
    '스타시티아트홀': { min: 60000, max: 80000, avg: 70000 },
    '건대입구컨벤션': { min: 60000, max: 80000, avg: 70000 },
    '더줌웨딩성수': { min: 65000, max: 85000, avg: 75000 },

    // 명동/중구
    '명동더스퀘어': { min: 70000, max: 90000, avg: 80000 },
    '명동라루체': { min: 65000, max: 85000, avg: 75000 },

    // 상암/마포/홍대
    '상암MBC아트홀': { min: 65000, max: 85000, avg: 75000 },
    '마포아트홀': { min: 60000, max: 80000, avg: 70000 },
    '상수동웨딩홀': { min: 55000, max: 75000, avg: 65000 },
    '서교동컨벤션': { min: 60000, max: 80000, avg: 70000 },

    // 광화문/종로
    '광화문아트홀': { min: 70000, max: 90000, avg: 80000 },
    '포시즌스광화문': { min: 150000, max: 200000, avg: 175000 },

    // 양천/영등포/구로
    '그랜드오스티움': { min: 55000, max: 75000, avg: 65000 },
    '영등포타임스퀘어': { min: 70000, max: 90000, avg: 80000 },
    '구로디지털컨벤션': { min: 50000, max: 70000, avg: 60000 },

    // 용산/이태원
    '용산아이파크몰': { min: 65000, max: 85000, avg: 75000 },
    '그랜드하얏트용산': { min: 130000, max: 170000, avg: 150000 },

    // 성북/노원/도봉
    '노원그랜드컨벤션': { min: 50000, max: 70000, avg: 60000 },
    '도봉컨벤션': { min: 45000, max: 65000, avg: 55000 },
    '미아사거리컨벤션': { min: 50000, max: 70000, avg: 60000 },

    // === 경기 분당/판교 (5.5~7만원) ===
    '분당앤스퀘어': { min: 60000, max: 70000, avg: 65000 },
    '판교더채널': { min: 65000, max: 80000, avg: 72000 },
    '분당롤링힐스호텔': { min: 70000, max: 90000, avg: 80000 },
    'DS컨벤션분당': { min: 55000, max: 70000, avg: 62000 },

    // === 경기 일산/고양 (5~6.5만원) ===
    '일산킨텍스': { min: 55000, max: 70000, avg: 62000 },
    '일산라비에벨': { min: 60000, max: 75000, avg: 67000 },
    '고양스타필드': { min: 55000, max: 70000, avg: 62000 },
    'MVL호텔킨텍스': { min: 65000, max: 85000, avg: 75000 },

    // === 경기 수원/용인 (5~6.5만원) ===
    '수원노보텔': { min: 70000, max: 90000, avg: 80000 },
    '수원라마다프라자': { min: 60000, max: 80000, avg: 70000 },
    '용인베어즈': { min: 55000, max: 70000, avg: 62000 },

    // === 경기 안산/안양 (5~6만원) ===
    '빌라드지디': { min: 55000, max: 65000, avg: 60000 },
    '안양아르떼': { min: 55000, max: 70000, avg: 62000 },

    // === 인천 (5~12만원) ===
    'CN컨벤션주안': { min: 50000, max: 70000, avg: 60000 },
    '쉐라톤그랜드인천': { min: 100000, max: 150000, avg: 125000 },
    '파라다이스시티': { min: 100000, max: 140000, avg: 120000 },
    '송도컨벤시아': { min: 60000, max: 80000, avg: 70000 },
    '인천그랜드볼룸': { min: 55000, max: 75000, avg: 65000 },
    '하버파크호텔인천': { min: 70000, max: 90000, avg: 80000 },
    '인천라마다': { min: 55000, max: 75000, avg: 65000 },

    // === 부산 (4~13만원) ===
    '부산웨스틴조선': { min: 100000, max: 140000, avg: 120000 },
    '부산파크하얏트': { min: 110000, max: 150000, avg: 130000 },
    '부산롯데호텔': { min: 90000, max: 130000, avg: 110000 },
    '해운대그랜드': { min: 80000, max: 110000, avg: 95000 },
    '부산라온웨딩홀': { min: 40000, max: 42000, avg: 41000 },
    '부산더펄웨딩홀': { min: 42000, max: 45000, avg: 43000 },
    '부산W스퀘어': { min: 42000, max: 45000, avg: 43000 },
    '이리스웨딩부산': { min: 42000, max: 45000, avg: 43000 },
    '부산헤리움웨딩홀': { min: 45000, max: 55000, avg: 50000 },
    '부산농심호텔': { min: 70000, max: 90000, avg: 80000 },
    '부산신라스테이': { min: 55000, max: 75000, avg: 65000 },
    '해운대센텀호텔': { min: 65000, max: 85000, avg: 75000 },

    // === 대구 (4~10만원) ===
    '대구인터불고': { min: 70000, max: 100000, avg: 85000 },
    '대구웨딩비엔나': { min: 42000, max: 48000, avg: 45000 },
    '대구MH컨벤션': { min: 45000, max: 55000, avg: 50000 },
    '대구엠스타하우스': { min: 45000, max: 55000, avg: 50000 },
    '대구퀸벨호텔': { min: 55000, max: 70000, avg: 62000 },
    '대구칼라디움': { min: 50000, max: 65000, avg: 57000 },
    '대구노비아갈라': { min: 48000, max: 58000, avg: 53000 },
    '대구파라다이스': { min: 50000, max: 65000, avg: 57000 },
    '대구라테라스': { min: 48000, max: 60000, avg: 54000 },
    '대구AW호텔': { min: 55000, max: 70000, avg: 62000 },
    '대구뉴욕뉴욕': { min: 48000, max: 58000, avg: 53000 },
    '대구스타디움': { min: 50000, max: 65000, avg: 57000 },
    '아리아나호텔대구': { min: 55000, max: 70000, avg: 62000 },
    '라온제나호텔대구': { min: 50000, max: 65000, avg: 57000 },
    '만촌인터불고': { min: 65000, max: 85000, avg: 75000 },
    '대구엘파소하우스': { min: 45000, max: 55000, avg: 50000 },
    '대구메르디앙': { min: 50000, max: 65000, avg: 57000 },
    '대구중앙컨벤션': { min: 45000, max: 55000, avg: 50000 },
    '경산로터스101': { min: 45000, max: 55000, avg: 50000 },

    // === 대전 (4~6.5만원) ===
    '대전ICC호텔': { min: 47000, max: 55000, avg: 50000 },
    '대전BMK컨벤션': { min: 40000, max: 55000, avg: 48000 },
    '라도무스아트센터': { min: 56000, max: 63000, avg: 59000 },
    '대전S가든': { min: 40000, max: 80000, avg: 55000 },
    '빌라드알티오라대전': { min: 45000, max: 52000, avg: 48000 },
    '대전라포르테': { min: 60000, max: 68000, avg: 63000 },
    '루이비스컨벤션대전': { min: 47000, max: 59000, avg: 53000 },
    '대전아름다운킹덤': { min: 41000, max: 48000, avg: 44000 },
    '대전호텔선샤인': { min: 40000, max: 48000, avg: 44000 },

    // === 광주 (6~7만원) ===
    '광주드메르웨딩홀': { min: 65000, max: 72000, avg: 69000 },
    '광주글로리아웨딩홀': { min: 60000, max: 79000, avg: 70000 },
    '위더스광주': { min: 58000, max: 65000, avg: 61000 },
    '광주웨딩시대': { min: 62000, max: 70000, avg: 66000 },
    '광주홀리데이인': { min: 65000, max: 75000, avg: 70000 },
    '광주라마다호텔': { min: 55000, max: 70000, avg: 62000 },
    '광주무등파크호텔': { min: 50000, max: 65000, avg: 57000 },

    // === 제주 (5~12만원) ===
    '제주신라호텔': { min: 100000, max: 140000, avg: 120000 },
    '제주롯데호텔': { min: 90000, max: 130000, avg: 110000 },
    '제주그랜드하얏트': { min: 100000, max: 140000, avg: 120000 },
    '제주메종글래드': { min: 70000, max: 90000, avg: 80000 },
    '제주노보텔': { min: 60000, max: 80000, avg: 70000 },
    '제주라마다': { min: 50000, max: 70000, avg: 60000 },

    // === 기타 지방 (4~7만원) ===
    '울산롯데호텔': { min: 70000, max: 95000, avg: 82000 },
    '울산현대호텔': { min: 60000, max: 80000, avg: 70000 },
    '창원컨벤션': { min: 45000, max: 60000, avg: 52000 },
    '진주동방호텔': { min: 45000, max: 60000, avg: 52000 },
    '전주라마다': { min: 50000, max: 65000, avg: 57000 },
    '목포신안비치호텔': { min: 50000, max: 65000, avg: 57000 },
    '청주그랜드플라자': { min: 50000, max: 65000, avg: 57000 },
    '춘천세종호텔': { min: 45000, max: 60000, avg: 52000 },
    '강릉씨마크호텔': { min: 70000, max: 90000, avg: 80000 },
};

// ============================================================
// 3. 지역별 평균 식대 (2025~2026년 기준) - 확장
// ============================================================
export const REGIONAL_MEAL_COSTS: Record<string, number> = {
    '서울 강남': 88000,
    '서울 잠실': 85000,
    '서울 여의도': 72000,
    '서울 기타': 72000,
    '경기 분당': 65000,
    '경기 판교': 70000,
    '경기 일산': 62000,
    '경기도': 62000,
    '인천': 60000,
    '인천 송도': 70000,
    '광주': 62000,
    '대전': 55000,
    '대구': 50000,
    '부산 해운대': 75000,
    '부산': 50000,
    '울산': 48000,
    '경상도': 45000,
    '전라도': 48000,
    '충청도': 50000,
    '강원도': 50000,
    '제주도': 55000,
    '전국 평균': 60000,
};

// ============================================================
// 4. 관계별 축의금 기준 (2025~2026년 통계)
// ============================================================
interface RelationAmount {
    attend: number;      // 참석 시
    notAttend: number;   // 불참 시 (봉투만)
    min: number;         // 최소
    max: number;         // 최대
}

export const WEDDING_AMOUNTS: Record<string, RelationAmount> = {
    '직계가족': { attend: 500000, notAttend: 500000, min: 300000, max: 1000000 },
    '형제자매': { attend: 300000, notAttend: 300000, min: 200000, max: 500000 },
    '가족': { attend: 200000, notAttend: 150000, min: 100000, max: 300000 },
    '절친': { attend: 150000, notAttend: 100000, min: 100000, max: 200000 },
    '친한 친구': { attend: 100000, notAttend: 70000, min: 70000, max: 150000 },
    '대학 동기': { attend: 100000, notAttend: 70000, min: 70000, max: 150000 },
    '직장 동료': { attend: 100000, notAttend: 70000, min: 70000, max: 150000 },
    '지인': { attend: 50000, notAttend: 50000, min: 30000, max: 70000 },
    '거래처': { attend: 100000, notAttend: 100000, min: 70000, max: 150000 },
};

export const FUNERAL_AMOUNTS: Record<string, number> = {
    '직계가족': 500000,
    '형제자매': 300000,
    '가족': 200000,
    '친척': 100000,
    '절친': 100000,
    '친한 친구': 50000,
    '대학 동기': 50000,
    '직장 동료': 50000,
    '지인': 50000,
    '거래처': 50000,
};

export const BIRTHDAY_AMOUNTS: Record<string, number> = {
    '직계가족': 300000,
    '형제자매': 200000,
    '가족': 100000,
    '친척': 50000,
    '친한 친구': 50000,
    '지인': 30000,
};

// ============================================================
// 5. 추천 엔진 클래스
// ============================================================
export interface RecommendationResult {
    recommendedAmount: number;
    minAmount: number;
    maxAmount: number;
    venueMealCost: number | null;
    venueType: 'hotel' | 'convention' | 'regional' | 'unknown';
    venueName: string | null;
    reason: string;
}

export class RecommendationEngine {
    /**
     * 장소명에서 식대 정보 추출
     */
    static detectVenueMealCost(location: string): {
        cost: number | null;
        type: 'hotel' | 'convention' | 'regional' | 'unknown';
        name: string | null;
    } {
        if (!location) return { cost: null, type: 'unknown', name: null };

        const normalized = location.replace(/\s/g, '').toLowerCase();

        // 호텔 검색
        for (const [hotelName, data] of Object.entries(HOTEL_MEAL_COSTS)) {
            const searchName = hotelName.replace(/\s/g, '').toLowerCase();
            if (normalized.includes(searchName)) {
                return { cost: data.avg, type: 'hotel', name: hotelName };
            }
        }

        // 컨벤션 검색
        for (const [venueName, data] of Object.entries(CONVENTION_MEAL_COSTS)) {
            const searchName = venueName.replace(/\s/g, '').toLowerCase();
            if (normalized.includes(searchName)) {
                return { cost: data.avg, type: 'convention', name: venueName };
            }
        }

        // 키워드 기반 추정
        if (normalized.includes('호텔')) {
            return { cost: 150000, type: 'hotel', name: '일반 호텔' };
        }
        if (normalized.includes('컨벤션') || normalized.includes('웨딩홀')) {
            return { cost: 80000, type: 'convention', name: '일반 웨딩홀' };
        }

        // 지역 기반 추정
        if (normalized.includes('강남') || normalized.includes('청담') || normalized.includes('압구정')) {
            return { cost: REGIONAL_MEAL_COSTS['서울 강남'], type: 'regional', name: '강남권' };
        }
        if (normalized.includes('서울')) {
            return { cost: REGIONAL_MEAL_COSTS['서울 기타'], type: 'regional', name: '서울' };
        }
        if (normalized.includes('경기') || normalized.includes('분당') || normalized.includes('판교')) {
            return { cost: REGIONAL_MEAL_COSTS['경기도'], type: 'regional', name: '경기도' };
        }
        if (normalized.includes('부산')) {
            return { cost: REGIONAL_MEAL_COSTS['부산'], type: 'regional', name: '부산' };
        }

        // 기본값: 전국 평균
        return { cost: REGIONAL_MEAL_COSTS['전국 평균'], type: 'regional', name: null };
    }

    /**
     * 결혼식 축의금 추천
     */
    static recommendWeddingAmount(
        relation: string,
        isAttending: boolean,
        location?: string
    ): RecommendationResult {
        // 1. 관계별 기본 금액
        const relationData = WEDDING_AMOUNTS[relation] || WEDDING_AMOUNTS['지인'];
        const baseAmount = isAttending ? relationData.attend : relationData.notAttend;

        // 2. 장소 식대 정보
        const venueInfo = this.detectVenueMealCost(location || '');

        // 3. 식대 기반 조정 (참석 시에만)
        let finalAmount = baseAmount;
        let reason = '';

        if (isAttending && venueInfo.cost) {
            // 식대가 10만원 이상인 고급 장소면 최소 식대 이상 권장
            if (venueInfo.cost >= 100000 && baseAmount < venueInfo.cost) {
                finalAmount = Math.max(baseAmount, venueInfo.cost);
                reason = `${venueInfo.name || '해당 장소'} 식대(약 ${(venueInfo.cost / 10000).toFixed(0)}만원) 고려`;
            } else {
                reason = `${relation} 관계 기준 (${isAttending ? '참석' : '불참'})`;
            }
        } else {
            reason = `${relation} 관계 기준 (${isAttending ? '참석' : '불참'})`;
        }

        // 4. 만원 단위 반올림
        finalAmount = Math.round(finalAmount / 10000) * 10000;

        // 5. 홀수 금액 권장 (4만원 피하기)
        if (finalAmount === 40000) finalAmount = 50000;

        return {
            recommendedAmount: finalAmount,
            minAmount: relationData.min,
            maxAmount: relationData.max,
            venueMealCost: venueInfo.cost,
            venueType: venueInfo.type,
            venueName: venueInfo.name,
            reason,
        };
    }

    /**
     * 장례식 부조금 추천
     */
    static recommendFuneralAmount(relation: string): RecommendationResult {
        const amount = FUNERAL_AMOUNTS[relation] || FUNERAL_AMOUNTS['지인'];

        return {
            recommendedAmount: amount,
            minAmount: Math.max(30000, amount - 20000),
            maxAmount: amount + 50000,
            venueMealCost: null,
            venueType: 'unknown',
            venueName: null,
            reason: `${relation} 관계 기준 부조금`,
        };
    }

    /**
     * 돌잔치 축하금 추천
     */
    static recommendBirthdayAmount(relation: string): RecommendationResult {
        const amount = BIRTHDAY_AMOUNTS[relation] || BIRTHDAY_AMOUNTS['지인'];

        return {
            recommendedAmount: amount,
            minAmount: Math.max(30000, amount - 20000),
            maxAmount: amount + 50000,
            venueMealCost: null,
            venueType: 'unknown',
            venueName: null,
            reason: `${relation} 관계 기준 축하금`,
        };
    }

    /**
     * 통합 추천 (이벤트 타입에 따라 분기)
     */
    static recommend(
        eventType: string,
        relation: string,
        isAttending: boolean = true,
        location?: string
    ): RecommendationResult {
        const normalizedType = eventType?.toLowerCase() || '';

        if (normalizedType.includes('wedding') || normalizedType.includes('결혼')) {
            return this.recommendWeddingAmount(relation, isAttending, location);
        }
        if (normalizedType.includes('funeral') || normalizedType.includes('장례') || normalizedType.includes('부고')) {
            return this.recommendFuneralAmount(relation);
        }
        if (normalizedType.includes('birthday') || normalizedType.includes('돌') || normalizedType.includes('생일')) {
            return this.recommendBirthdayAmount(relation);
        }

        // 기본값: 결혼식 기준
        return this.recommendWeddingAmount(relation, isAttending, location);
    }
}
