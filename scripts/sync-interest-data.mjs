/**
 * sync-interest-data.mjs
 * 로컬 환경(한국 IP)에서 공공 API를 호출하여 Supabase에 관심사 이벤트 데이터를 직접 삽입하는 스크립트.
 *
 * 실행 방법:
 *   node scripts/sync-interest-data.mjs
 *
 * 필수: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY를 아래 상수에 직접 입력하세요.
 */

import { createClient } from '@supabase/supabase-js';

// ============================================================
// ▼▼▼ 아래 3가지만 입력하면 됩니다 ▼▼▼
// ============================================================
const SUPABASE_URL = 'https://brsouceosomykgloouiu.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const API_KEY = '0d5c0817338279ae29455c6494e581285ae5e02454e7c40494ca2f61d69c76e8';
// ============================================================

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// --- DB에서 카테고리 → 캘린더 ID 매핑 가져오기 ---
async function getCategoryCalendarMap() {
    const { data, error } = await supabase
        .from('interest_categories')
        .select('name, target_calendar_id')
        .not('target_calendar_id', 'is', null);

    if (error) throw new Error(`카테고리 조회 실패: ${error.message}`);
    return data;
}

// --- 날짜 포맷 변환 YYYYMMDD → YYYY-MM-DD ---
function fmtDate(str) {
    if (!str) return null;
    const s = str.toString();
    return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
}

// ============================================================
// 1. 공연/전시 수집 (한국문화정보원 문화포털)
// ============================================================
async function syncCultureEvents(cultureCalId, exhibCalId) {
    console.log('\n[공연/전시 수집 시작] ...');
    const fromStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const API_URL = `https://apis.data.go.kr/B553457/cultureinfo/realmInfo`;

    let allItems = [];
    let page = 1;
    while (page <= 5) {
        const url = `${API_URL}?ServiceKey=${API_KEY}&from=${fromStr}&cPage=${page}&rows=100`;
        const res = await fetch(url);
        const text = await res.text();

        // XML 파싱 (간단하게 정규식 사용)
        const items = [...text.matchAll(/<perforList>([\s\S]*?)<\/perforList>/g)];
        if (items.length === 0) break;

        for (const match of items) {
            const block = match[1];
            const get = (tag) => {
                const m = block.match(new RegExp(`<${tag}>([^<]*)<\/${tag}>`));
                return m ? m[1].trim() : '';
            };
            const realmName = get('realmName') || '문화행사';
            const isExhibit = realmName.includes('미술') || realmName.includes('전시');
            allItems.push({
                calendar_id: isExhibit ? exhibCalId : cultureCalId,
                name: get('title') || '무제',
                event_date: fmtDate(get('startDate')) || new Date().toISOString().split('T')[0],
                start_time: '09:00',
                end_time: '21:00',
                location: get('place') || '',
                memo: `장르: ${realmName}\n기간: ${fmtDate(get('startDate'))} ~ ${fmtDate(get('endDate'))}\n문의: ${get('phone') || 'N/A'}`,
                type: isExhibit ? 'exhibition' : 'performance',
                category: 'schedule',
                external_resource_id: `culture_portal_${get('seq')}`,
            });
        }
        if (items.length < 100) break;
        page++;
    }

    if (allItems.length === 0) {
        console.log('  → 수집된 공연/전시 데이터 없음 (API 응답 없음)');
        return;
    }

    const { error } = await supabase.from('events').upsert(
        allItems.filter(e => e.calendar_id),
        { onConflict: 'calendar_id,external_resource_id' }
    );
    if (error) console.error('  → DB 저장 실패:', error.message);
    else console.log(`  → ${allItems.length}건 공연/전시 저장 완료!`);
}

// ============================================================
// 2. 지역축제 수집 (한국관광공사 KorService2)
//    searchFestival1 실패 시 → areaBasedList1(contentTypeId=15)로 폴백
// ============================================================
async function syncFestivalEvents(festivalCalId) {
    console.log('\n[지역축제 수집 시작] ...');
    const fromStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const baseParams = `serviceKey=${API_KEY}&numOfRows=50&pageNo=1&MobileOS=ETC&MobileApp=HaruClick&_type=json`;

    // 방법 1: searchFestival1
    let data = null;
    let method = 'searchFestival1';
    let res = await fetch(
        `https://apis.data.go.kr/B551011/KorService2/searchFestival1?${baseParams}&arrange=A&eventStartDate=${fromStr}`
    );
    let json = await res.json().catch(() => null);
    if (json?.response?.body?.items?.item) {
        data = json.response.body.items.item;
    }

    // 방법 2: areaBasedList1 (contentTypeId=15 축제)
    if (!data) {
        method = 'areaBasedList1(contentTypeId=15)';
        res = await fetch(
            `https://apis.data.go.kr/B551011/KorService2/areaBasedList1?${baseParams}&contentTypeId=15`
        );
        json = await res.json().catch(() => null);
        data = json?.response?.body?.items?.item;
    }

    // 방법 3: KorService1 (Legacy)
    if (!data) {
        method = 'KorService1/searchFestival1';
        res = await fetch(
            `https://apis.data.go.kr/B551011/KorService1/searchFestival1?${baseParams}&arrange=A&eventStartDate=${fromStr}`
        );
        json = await res.json().catch(() => null);
        data = json?.response?.body?.items?.item;
    }

    if (!data || data.length === 0) {
        console.log(`  → 수집된 지역축제 데이터 없음 (${method} 실패). API 키 활성화 대기 중일 수 있습니다.`);
        return;
    }

    console.log(`  → ${method}으로 ${data.length}건 수집 성공!`);

    const items = (Array.isArray(data) ? data : [data]).map(f => ({
        calendar_id: festivalCalId,
        name: f.title || '무제',
        event_date: fmtDate(f.eventstartdate) || new Date().toISOString().split('T')[0],
        start_time: '10:00',
        end_time: '22:00',
        location: f.addr1 || '',
        memo: `축제 기간: ${fmtDate(f.eventstartdate)} ~ ${fmtDate(f.eventenddate)}\n장소: ${f.addr1}`,
        type: 'festival',
        category: 'schedule',
        external_resource_id: `tourapi_festival_${f.contentid}`,
    }));

    const { error } = await supabase.from('events').upsert(
        items.filter(e => e.calendar_id),
        { onConflict: 'calendar_id,external_resource_id' }
    );
    if (error) console.error('  → DB 저장 실패:', error.message);
    else console.log(`  → ${items.length}건 지역축제 저장 완료!`);
}

// ============================================================
// MAIN
// ============================================================
async function main() {
    console.log('=== 관심사 이벤트 데이터 수집 시작 ===');

    const categories = await getCategoryCalendarMap();
    console.log('카테고리-캘린더 매핑:', categories.map(c => `${c.name} → ${c.target_calendar_id}`).join(', '));

    const find = (name) => categories.find(c => c.name === name)?.target_calendar_id;

    const perfCalId = find('공연');
    const exhibCalId = find('전시');
    const festCalId = find('지역 축제');

    await syncCultureEvents(perfCalId, exhibCalId);
    await syncFestivalEvents(festCalId);

    console.log('\n=== 완료! ===');
}

main().catch(console.error);
