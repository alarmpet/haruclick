const NUM_MAP: { [key: string]: number } = {
    '일': 1, '이': 2, '삼': 3, '사': 4, '오': 5,
    '육': 6, '칠': 7, '팔': 8, '구': 9,
    '하나': 1, '둘': 2, '셋': 3, '넷': 4, '다섯': 5,
    '여섯': 6, '일곱': 7, '여덟': 8, '아홉': 9,
    '한': 1, '두': 2, '세': 3, '네': 4
};

const UNIT_MAP: { [key: string]: number } = {
    '십': 10, '백': 100, '천': 1000,
    '만': 10000, '억': 100000000
};

export class VoiceNormalizer {

    static normalize(text: string): string {
        let result = text;
        result = this.normalizeDateTimes(result);
        result = this.normalizeKoreanNumbers(result);
        return result;
    }

    static normalizeRelativeWeekdays(text: string, referenceDate: Date): string {
        if (!text) return text;

        const relMap: Record<string, number> = {
            '이번': 0,
            '다음': 1,
            '지난': -1,
            '저번': -1
        };

        const dayOffsets: Record<string, number> = {
            '월요일': 0,
            '화요일': 1,
            '수요일': 2,
            '목요일': 3,
            '금요일': 4,
            '토요일': 5,
            '일요일': 6
        };

        const toISODate = (d: Date) => {
            const y = d.getFullYear();
            const m = (d.getMonth() + 1).toString().padStart(2, '0');
            const day = d.getDate().toString().padStart(2, '0');
            return `${y}-${m}-${day}`;
        };

        const ref = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate());
        const dayOfWeek = ref.getDay(); // 0=Sun
        const diffToMonday = (dayOfWeek + 6) % 7;

        return text.replace(/(이번|다음|지난|저번)\s*주\s*(월요일|화요일|수요일|목요일|금요일|토요일|일요일)/g, (match, rel, dayWord) => {
            const weekOffset = relMap[rel] ?? 0;
            const monday = new Date(ref);
            monday.setDate(monday.getDate() - diffToMonday + weekOffset * 7);

            const offset = dayOffsets[dayWord];
            if (offset === undefined) return match;

            const target = new Date(monday);
            target.setDate(monday.getDate() + offset);

            return `${toISODate(target)} ${dayWord}`;
        });
    }

    // 3. Entity Check (Rule-based)
    // 3. Entity Check (Rule-based)
    static isEntityLike(normalizedText: string): boolean {
        // [Patch] Explicit Regex Restoration and Centralization (Refined P8)

        // Check for numbers (Digits or Korean units)
        // e.g. "3000", "삼천", "3만"
        const hasNumber = /\d|십|백|천|만|억/.test(normalizedText);

        // Check for date keywords (Stricter)
        // Valid patterns:
        // 1. "오늘", "내일", "모레", "작일", "재작일" (Strong keywords)
        // 2. "다음 주", "이번 달", "지난 주" (Relative + Unit)
        // 3. Number + Unit: "3일", "2주", "12월"
        // 4. Day of week: "월요일", "화욜" (handled by normalizeDateTimes -> "요일")

        const strongKeywords = /(오늘|내일|모레|작일|재작일|그저께|어제)/.test(normalizedText);
        const relativeDates = /(이번|다음|지난|저번)\s*(주|달|해)/.test(normalizedText);
        const numberDates = /[0-9일이삼사오육칠팔구십]+(주|월|일)/.test(normalizedText); // "3일", "삼일"
        const dayOfWeek = /(요일)/.test(normalizedText);

        const hasDate = strongKeywords || relativeDates || numberDates || dayOfWeek;

        return hasNumber || hasDate;
    }

    // High Confidence 판단 (UI 확인 단계를 줄이기 위한 보수적 기준)
    static isHighConfidence(normalizedText: string): boolean {
        const text = normalizedText || '';
        if (text.length < 6) return false;

        const strongKeywords = /(오늘|내일|모레|작일|재작일|그저께|어제)/.test(text);
        const relativeDates = /(이번|다음|지난|저번)\s*(주|달|해)/.test(text);
        const numberDates = /[0-9일이삼사오육칠팔구십]+(주|월|일)/.test(text);
        const dayOfWeek = /(요일)/.test(text);
        const timeExpr = /(\d{1,2}\s*시|\d{1,2}:\d{2})/.test(text);

        const hasDate = strongKeywords || relativeDates || numberDates || dayOfWeek || timeExpr;
        const hasNumber = /(\d|일|이|삼|사|오|육|칠|팔|구|십|백|천|만|억)/.test(text);
        const hasIntent = /(약속|예약|결제|이체|입금|송금|결혼식|장례|모임|회비|구매|환불|지출|수입)/.test(text);

        return hasDate && hasNumber && hasIntent;
    }

    // 1. Date/Time Normalization (Colloquial -> Standard)
    static normalizeDateTimes(text: string): string {
        const replacements: [RegExp, string][] = [
            [/낼/g, '내일'],
            [/다음주/g, '다음 주'],
            [/지난주/g, '지난 주'],
            [/저번주/g, '저번 주'],
            [/이번주/g, '이번 주'],
            [/오\s*후/g, '오후'],
            [/오\s*전/g, '오전'],
            [/내일저녁/g, '내일 저녁'],
            [/내일아침/g, '내일 아침'],
            [/내일오후/g, '내일 오후'],
            [/내일오전/g, '내일 오전'],
            [/오늘저녁/g, '오늘 저녁'],
            [/오늘아침/g, '오늘 아침'],
            [/오늘오후/g, '오늘 오후'],
            [/오늘오전/g, '오늘 오전'],
            [/모레/g, '모레'], // No change needed but for consistency
            [/담주/g, '다음 주'],
            [/담달/g, '다음 달'],
            [/작일/g, '어제'],
            [/재작일/g, '그저께'],
            [/([월화수목금토일])\s*욜/g, '$1요일'], // 월욜/월 욜 -> 월요일
            [/(이번|다음|지난|저번)\s*주\s*([월화수목금토일])요일?/g, '$1 주 $2요일'],
            [/([0-9일이삼사오육칠팔구십]+)\s*시\s*반/g, '$1:30'], // 7시 반 -> 7:30
        ];

        let processed = text;
        for (const [pattern, replacement] of replacements) {
            processed = processed.replace(pattern, replacement);
        }
        return processed;
    }

    // 2. Korean Number Parser ("삼만 오천원" -> "35000원")
    static normalizeKoreanNumbers(text: string): string {
        // Protect date/time keywords to avoid corruption during numeric normalization.
        let protectedText = text;
        const protectedTokens: string[] = [];
        const protect = (pattern: RegExp) => {
            protectedText = protectedText.replace(pattern, (match) => {
                const key = `__DATE_TOKEN_${protectedTokens.length}__`;
                protectedTokens.push(match);
                return key;
            });
        };
        protect(/(오늘|내일|모레|어제|그저께|작일|재작일)/g);
        protect(/(월요일|화요일|수요일|목요일|금요일|토요일|일요일)/g);
        protect(/(오전|오후|아침|저녁|밤|새벽|정오)/g);
        protect(/(오\s*후|오\s*전)/g);
        protect(/(이\s*랑)/g);
        protect(/(\d{1,2}\s*일)/g);
        protect(/(이번|다음|지난|저번)\s*주/g);
        protect(/(이번|다음|지난|저번)/g);

        // Find potential number sequences. 
        // Korean numbers can be: digits, Hangeul digits, Hangeul units, spaces, commas.
        // e.g. "3만 5천", "삼만오천", "10,000"

        // Regex to capture a chunk that MIGHT be a number.
        // Includes: digits 0-9, commas, spaces, Number chars, Unit chars
        const numChars = Object.keys(NUM_MAP).join('');
        const unitChars = Object.keys(UNIT_MAP).join('');
        const pattern = new RegExp(`([0-9,${numChars}${unitChars}\\s]+)([원개명번시분초])?`, 'g');

        let replaced = protectedText.replace(pattern, (match, numberPart, suffix, offset, fullText) => {
            // Trim spaces
            const leadingWhitespace = numberPart.match(/^\s+/)?.[0] ?? '';
            let raw = numberPart.trim();
            if (!raw) return match;

            // If it's just pure digits/commas, let it be (remove commas maybe?)
            if (/^[0-9, \.]+$/.test(raw)) {
                return leadingWhitespace + raw.replace(/,/g, '') + (suffix || '');
            }

            // Preserve day-of-month like "2일" (avoid "2일" -> "1" corruption)
            if (/^\d+\s*일$/.test(raw)) {
                return leadingWhitespace + raw + (suffix || '');
            }

            // Avoid converting ambiguous single-syllable numerals without unit/digits (e.g. "오", "이")
            const hasUnit = /[십백천만억]/.test(raw);
            const hasDigit = /\d/.test(raw);
            const allowedSuffix = ['시', '분', '초', '번', '개', '명', '원'];
            const hasAllowedSuffix = suffix && allowedSuffix.includes(suffix);
            const isSingleSyllable = raw.length === 1;
            const isAmbiguousSingle = isSingleSyllable && ['일', '이', '오'].includes(raw);
            if (!hasUnit && !hasDigit) {
                if (!hasAllowedSuffix) return match;
                if (isAmbiguousSingle) {
                    const beforeChar = offset > 0 ? fullText[offset - 1] : '';
                    if (beforeChar && /[가-힣]/.test(beforeChar)) {
                        return match;
                    }
                }
            }

            // Try to parse Korean
            const val = this.parseKoreanNumber(raw);
            if (val > 0) {
                return leadingWhitespace + val.toString() + (suffix || '');
            }

            // If parse failed (maybe it wasn't a number strictly, e.g. "이" referring to "Teeth"), return original
            // Heuristic: If strict parsing returns 0 or fails, checking if it was likely a number is hard without NLP.
            // For now, if > 0, we replace.
            return match;
        });

        // Restore protected date tokens
        protectedTokens.forEach((token, idx) => {
            replaced = replaced.replace(`__DATE_TOKEN_${idx}__`, token);
        });

        return replaced;
    }

    private static parseKoreanNumber(str: string): number {
        // Remove spaces and commas
        const clean = str.replace(/[\s,]/g, '');

        let total = 0;
        let currentNum = 0;     // Current digit buffer (e.g. 5 in 500)
        let subTotal = 0;       // For checks < 10000 (e.g. 3500 in 23500)

        for (let i = 0; i < clean.length; i++) {
            const char = clean[i];

            if (/\d/.test(char)) {
                // If arabic digit, we need to look ahead to see if it makes a number
                // Simple parser handles single digits or full numbers followed by unit
                // E.g. "3만" -> 3 is currentNum
                // Complex case: "3500" -> treat as number.

                // Extract full arabic number at this position
                let numStr = '';
                while (i < clean.length && /\d/.test(clean[i])) {
                    numStr += clean[i];
                    i++;
                }
                i--; // backtrack one loop
                currentNum = parseInt(numStr, 10);
                continue;
            }

            if (NUM_MAP[char]) {
                currentNum = NUM_MAP[char];
                continue;
            }

            if (UNIT_MAP[char]) {
                const unitVal = UNIT_MAP[char];

                if (char === '만' || char === '억') {
                    // Big Unit: Flash subTotal
                    if (currentNum > 0) {
                        subTotal += currentNum;
                        currentNum = 0;
                    }
                    if (subTotal === 0 && currentNum === 0) {
                        // case: "만 원" -> 10000
                        subTotal = 1;
                    }

                    total += subTotal * unitVal;
                    subTotal = 0;
                } else {
                    // Small Unit (십, 백, 천)
                    if (currentNum === 0) currentNum = 1; // "백원" -> 100
                    subTotal += currentNum * unitVal;
                    currentNum = 0;
                }
                continue;
            }

            // Unexpected char -> Abort parsing?
            // "삼겹살" -> "삼" is 3, "겹" unknown. 
            // This basic parser might be too aggressive.
            // We rely on the Regex in `normalizeKoreanNumbers` catching valid-looking blocks.
            return 0;
        }

        total += subTotal + currentNum;
        return total;
    }
}
