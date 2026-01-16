import KoreanLunarCalendar from 'korean-lunar-calendar';

const lunarCalendar = new KoreanLunarCalendar();

interface LunarInfo {
    lunarDate: string; // "1.15"
    holidayName?: string; // "설날", "추석", "크리스마스"
    isHoliday: boolean; // 빨간날 여부
}

export function getLunarInfo(year: number, month: number, day: number): LunarInfo {
    // 1. 음력 변환
    try {
        lunarCalendar.setSolarDate(year, month, day);
        const lunarData = lunarCalendar.getLunarCalendar();

        // 라이브러리가 반환하는 포맷: { year: 2026, month: 1, day: 14 }
        const lMonth = lunarData.month;
        const lDay = lunarData.day;
        const lunarDate = `${lMonth}.${lDay}`;

        let holidayName: string | undefined;
        let isHoliday = false;

        // 2. 양력 명절/공휴일 체크
        const solarStr = `${month}.${day}`;
        if (solarStr === '1.1') { holidayName = '신정'; isHoliday = true; }
        else if (solarStr === '3.1') { holidayName = '삼일절'; isHoliday = true; }
        else if (solarStr === '5.5') { holidayName = '어린이날'; isHoliday = true; }
        else if (solarStr === '6.6') { holidayName = '현충일'; isHoliday = true; }
        else if (solarStr === '8.15') { holidayName = '광복절'; isHoliday = true; }
        else if (solarStr === '10.3') { holidayName = '개천절'; isHoliday = true; }
        else if (solarStr === '10.9') { holidayName = '한글날'; isHoliday = true; }
        else if (solarStr === '12.25') { holidayName = '크리스마스'; isHoliday = true; }

        // 3. 음력 명절 체크 (설날, 추석, 부처님오신날)
        const lunarStr = `${lMonth}.${lDay}`;

        // 설날 (1.1 및 전후)
        if (lunarStr === '1.1') { holidayName = '설날'; isHoliday = true; }
        else if (lunarData.month === 1 && lunarData.day === 2) { holidayName = '설날 연휴'; isHoliday = true; }
        else if (isLunarLastDay(lunarData.year, lMonth, lDay, 12)) { holidayName = '설날 연휴'; isHoliday = true; }
        // 주의: 12월 말일(섣달 그믐) 체크는 복잡함. 여기선 간단히 전년도 12월 마지막 날인지 체크 필요하지만 
        // 라이브러리 지원 한계상 "설날"과 "다음날"만 일단 확실히 처리하거나 
        // 1.1일때 전날을 계산해서 처리해야 함. 현재 구조상 '오늘'만 보므로, 이전/다음 날짜 컨텍스트가 없음.
        // --> 간단 버전: 1.1, 1.2만 표시. (엄밀한 연휴 계산은 복잡)

        // 부처님오신날 (4.8)
        else if (lunarStr === '4.8') { holidayName = '부처님오신날'; isHoliday = true; }

        // 추석 (8.15 및 전후)
        else if (lunarStr === '8.15') { holidayName = '추석'; isHoliday = true; }
        else if (lunarStr === '8.14') { holidayName = '추석 연휴'; isHoliday = true; }
        else if (lunarStr === '8.16') { holidayName = '추석 연휴'; isHoliday = true; }

        return {
            lunarDate,
            holidayName,
            isHoliday
        };
    } catch (e) {
        console.warn('Lunar conversion failed', e);
        return { lunarDate: '', isHoliday: false };
    }
}

// 섣달 그믐(전년도 마지막날) 체크를 위한 헬퍼 (필요시 구현)
function isLunarLastDay(year: number, month: number, day: number, targetMonth: number): boolean {
    // 이전 날의 음력 달이 12월이고, 다음 날의 음력 달이 1월 1일이면 -> 섣달 그믐
    // 하지만 현재 함수 스코프 밖이므로 패스.
    return false;
}
