import { EventRecord } from '../services/supabase';

// Priority 3: Compound Keywords (High Specificity)
const SPECIFIC_KEYWORD_MAP: Array<{ pattern: RegExp; emoji: string }> = [
    { pattern: /동물병원|강아지|고양이|반려/, emoji: '🐾' },
    { pattern: /미용실|헤어|파마|염색|커트|바버샵/, emoji: '💇‍♀️' },
    { pattern: /치과|스케일링|사랑니|교정/, emoji: '🦷' },
    { pattern: /스타벅스|투썸|커피|카페|티타임/, emoji: '☕' },
    { pattern: /삼겹살|갈비|고기집|한우|스테이크/, emoji: '🥩' },
    { pattern: /초밥|스시|오마카세|일식/, emoji: '🍣' },
    { pattern: /치킨|통닭/, emoji: '🍗' },
    { pattern: /피자/, emoji: '🍕' },
    { pattern: /마라탕|짜장|짬뽕|중국집/, emoji: '🍜' },
    { pattern: /햄버거|맥도날드|버거킹/, emoji: '🍔' },
    { pattern: /공항|비행기|출국|입국|여권|환전|면세점/, emoji: '✈️' },
    { pattern: /호텔|리조트|펜션|숙소|체크인/, emoji: '🏖️' },
    { pattern: /캠핑|글램핑|텐트/, emoji: '⛺' },
    { pattern: /주유|세차|정비|주차|대리운전/, emoji: '🚗' },
    { pattern: /기차|KTX|SRT|고속버스|터미널/, emoji: '🚄' },
    { pattern: /영화|CGV|롯데시네마|메가박스/, emoji: '🍿' },
    { pattern: /롯데월드|에버랜드|놀이공원/, emoji: '🎡' },
    { pattern: /노래방|PC방|게임/, emoji: '🎮' },
    { pattern: /축구|풋살/, emoji: '⚽' },
    { pattern: /야구|베이스볼/, emoji: '⚾' },
    { pattern: /골프|라운딩|스크린/, emoji: '⛳' },
    { pattern: /테니스|배드민턴/, emoji: '🎾' },
    { pattern: /수영/, emoji: '🏊‍♂️' },
    { pattern: /교회|예배|성당|미사|절|법회/, emoji: '⛪' },
];

// Priority 4: General Keywords (Broader Categories)
const GENERAL_KEYWORD_MAP: Array<{ pattern: RegExp; emoji: string }> = [
    // Health
    { pattern: /병원|진료|검진|내과|외과|이비인후과|정형외과|안과|수술|시술/, emoji: '🏥' },
    { pattern: /약국|처방/, emoji: '💊' },
    { pattern: /한의원|침|보약/, emoji: '🍵' },
    { pattern: /헬스|운동|요가|필라테스|PT|클라이밍|러닝/, emoji: '🏋️‍♀️' },

    // Food & Social
    { pattern: /술|맥주|소주|와인|회식|뒷풀이|포차|호프|Bar/, emoji: '🍺' },
    { pattern: /점심|저녁|식사|밥|모임|약속|브런치|동창회/, emoji: '🍽️' },

    // Work & Study
    { pattern: /회의|미팅|업무|야근|출장|면접|인터뷰/, emoji: '💼' },
    { pattern: /공부|스터디|도서관|독서실|학원|강의|수업|과외|시험/, emoji: '📚' },
    { pattern: /학교|등교|하교|졸업|입학|개강|종강/, emoji: '🏫' },

    // Beauty & Fashion
    { pattern: /네일|속눈썹|피부과|메이크업|마사지/, emoji: '💅' }, // 피부과 context dependent, usually beauty if not '진료'
    { pattern: /쇼핑|백화점|아울렛|마트|장보기|올리브영/, emoji: '🛍️' },
    { pattern: /세탁|빨래|드라이|수선/, emoji: '🧺' },

    // Home & Family
    { pattern: /청소|이사|가구|인테리어/, emoji: '🏠' },
    { pattern: /어린이집|유치원|키즈카페|육아/, emoji: '👶' },
    { pattern: /택배|배송|퀵/, emoji: '📦' },

    // Finance & Admin
    { pattern: /은행|ATM|창구/, emoji: '🏦' },
    { pattern: /월급|급여|보너스|정산|입금/, emoji: '💰' },
    { pattern: /세금|공과금|관리비|납부/, emoji: '🧾' },
    { pattern: /주민센터|구청|동사무소|등본|서류/, emoji: '🏛️' },

    // Culture
    { pattern: /공연|뮤지컬|전시|관람|콘서트|티켓/, emoji: '🎫' },
    { pattern: /파티|축제|페스티벌/, emoji: '🎉' },
];

function getHolidayEmoji(dateStr: string): string | null {
    if (!dateStr) return null;
    const date = new Date(dateStr);
    const month = date.getMonth() + 1;
    const day = date.getDate();

    if (month === 12 && day === 25) return '🎄'; // Christmas
    if (month === 1 && day === 1) return '🌅';   // New Year
    // Lunar New Year / Chuseok require lunar calendar logic, skipping for now complexity
    if (month === 10 && day === 31) return '🎃'; // Halloween
    if (month === 5 && day === 8) return '💐';   // Parents Day
    if (month === 5 && day === 5) return '🎈';   // Childrens Day

    return null;
}

export function getEventEmoji(event: Partial<EventRecord>): string {
    // 1. Exact Type Match (Types that have innate emojis)
    if (event.type === 'wedding') return '💒';
    if (event.type === 'funeral') return '🖤';
    if (event.type === 'birthday') return '🎂';

    // 2. Holiday Override
    if (event.date) {
        const holiday = getHolidayEmoji(event.date);
        if (holiday) return holiday;
    }

    const text = (event.name || '').toLowerCase();

    // 3. Specific Keyword Match (Priority 3)
    for (const { pattern, emoji } of SPECIFIC_KEYWORD_MAP) {
        if (pattern.test(text)) return emoji;
    }

    // 4. General Keyword Match (Priority 4)
    for (const { pattern, emoji } of GENERAL_KEYWORD_MAP) {
        if (pattern.test(text)) return emoji;
    }

    // 5. Category Fallback (Priority 5)
    if (event.category === 'todo') return '✅';
    if (event.category === 'ceremony') return '🎉'; // Generic celebration but usually caught by type
    if (event.category === 'expense') return '💸';
    if (event.isReceived) return '💰'; // Income check

    return '📅'; // Default
}
