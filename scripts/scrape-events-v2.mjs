/**
 * scrape-events-v2.mjs
 * GPT 0회, 월 ₩0 완전 무료 이벤트 스크래핑 스크립트
 *
 * 파이프라인:
 *   1) 공공 API (문화정보원, 관광공사) → XML/JSON 파싱
 *   2) Playwright + Cheerio → CSS 셀렉터 직접 추출
 *   3) Supabase upsert (중복 방지)
 *
 * 실행: node scripts/scrape-events-v2.mjs
 */

import { createClient } from '@supabase/supabase-js';
import { chromium } from 'playwright';
import * as cheerio from 'cheerio';

// ============================================================
// 환경 변수 / 상수
// ============================================================
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://brsouceosomykgloouiu.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const CULTURE_API_KEY = process.env.CULTURE_API_KEY || '0d5c0817338279ae29455c6494e581285ae5e02454e7c40494ca2f61d69c76e8';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// KST 오늘 날짜
const TODAY = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().split('T')[0];
const TODAY_COMPACT = TODAY.replace(/-/g, '');

// ============================================================
// 유틸리티
// ============================================================
function fmtDate(str) {
    if (!str) return null;
    const s = str.toString().replace(/[.\-\/]/g, '');
    if (s.length >= 8) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
    return null;
}

function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

async function fetchWithRetry(url, maxRetries = 2) {
    for (let i = 0; i <= maxRetries; i++) {
        try {
            const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
            if (res.ok) return await res.text();
            if (res.status === 403 || res.status === 429) throw new Error(`Blocked (${res.status})`);
        } catch (e) {
            if (i === maxRetries) throw e;
            console.log(`    ⏳ 재시도 ${i + 1}/${maxRetries}...`);
            await sleep(2000 * (i + 1));
        }
    }
}

// ============================================================
// DB 헬퍼
// ============================================================
async function getCategoryCalendarMap() {
    const { data, error } = await supabase
        .from('interest_categories')
        .select('name, target_calendar_id')
        .not('target_calendar_id', 'is', null);
    if (error) throw new Error(`카테고리 조회 실패: ${error.message}`);
    return data;
}

async function upsertEvents(events, calendarId, sourceName) {
    if (!events.length || !calendarId) {
        console.log(`  ⚠️ ${sourceName}: 저장 건너뜀 (events=${events.length}, calendarId=${calendarId})`);
        return;
    }

    // 미래 이벤트만 필터
    const futureEvents = events.filter(e => e.event_date && e.event_date >= TODAY);
    if (futureEvents.length < events.length) {
        console.log(`  🗑️ 과거 필터: ${events.length - futureEvents.length}건 제거 → ${futureEvents.length}건`);
    }

    const rows = futureEvents.map(e => ({
        calendar_id: calendarId,
        name: e.name?.slice(0, 100) || '무제',
        event_date: e.event_date,
        start_time: e.start_time || '10:00',
        end_time: e.end_time || '22:00',
        location: e.location || '',
        memo: e.memo || '',
        type: e.type || 'interest',
        category: e.category || 'interest',
        external_resource_id: e.external_resource_id || `v2_${sourceName}_${hashCode(e.name + e.event_date)}`,
    }));

    const { error } = await supabase.from('events').upsert(rows, {
        onConflict: 'calendar_id,external_resource_id'
    });

    if (error) console.error(`  ❌ ${sourceName} DB 오류:`, error.message);
    else console.log(`  ✅ ${sourceName}: ${rows.length}건 저장 완료!`);
}

function hashCode(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash) + str.charCodeAt(i);
        hash |= 0;
    }
    return Math.abs(hash).toString(36);
}

// ============================================================
// SOURCE 1: 한국문화정보원 공공 API (공연/전시)
// ============================================================
async function syncCultureAPI(perfCalId, exhibCalId) {
    console.log('\n📡 [공공 API] 한국문화정보원 — 공연/전시');

    const API_URL = 'https://apis.data.go.kr/B553457/cultureinfo/realmInfo';
    let allItems = [];
    let page = 1;

    while (page <= 5) {
        const url = `${API_URL}?ServiceKey=${CULTURE_API_KEY}&from=${TODAY_COMPACT}&cPage=${page}&rows=100`;
        try {
            const text = await fetchWithRetry(url);
            const items = [...text.matchAll(/<perforList>([\s\S]*?)<\/perforList>/g)];
            if (items.length === 0) break;

            for (const match of items) {
                const block = match[1];
                const get = (tag) => {
                    const m = block.match(new RegExp(`<${tag}>([^<]*)</${tag}>`));
                    return m ? m[1].trim() : '';
                };
                const realmName = get('realmName') || '문화행사';
                const isExhibit = realmName.includes('미술') || realmName.includes('전시');
                allItems.push({
                    calendar_id: isExhibit ? exhibCalId : perfCalId,
                    name: get('title') || '무제',
                    event_date: fmtDate(get('startDate')) || TODAY,
                    start_time: '09:00',
                    end_time: '21:00',
                    location: get('place') || '',
                    memo: `장르: ${realmName}\n기간: ${fmtDate(get('startDate'))} ~ ${fmtDate(get('endDate'))}`,
                    type: isExhibit ? 'exhibition' : 'performance',
                    category: 'interest',
                    external_resource_id: `culture_portal_${get('seq')}`,
                });
            }
            if (items.length < 100) break;
            page++;
        } catch (e) {
            console.log(`  ⚠️ 문화정보원 API 실패: ${e.message}`);
            break;
        }
    }

    // 공연과 전시 분리 저장
    const perf = allItems.filter(e => e.calendar_id === perfCalId);
    const exhib = allItems.filter(e => e.calendar_id === exhibCalId);
    if (perf.length) await upsertEvents(perf, perfCalId, '문화정보원-공연');
    if (exhib.length) await upsertEvents(exhib, exhibCalId, '문화정보원-전시');

    return allItems.length;
}

// ============================================================
// SOURCE 2: 한국관광공사 API (지역축제)
// ============================================================
async function syncFestivalAPI(festCalId) {
    console.log('\n📡 [공공 API] 한국관광공사 — 지역축제');

    const baseParams = `serviceKey=${CULTURE_API_KEY}&numOfRows=50&pageNo=1&MobileOS=ETC&MobileApp=HaruClick&_type=json`;
    let data = null;

    // 방법 1: searchFestival1
    try {
        const res = await fetch(`https://apis.data.go.kr/B551011/KorService2/searchFestival1?${baseParams}&arrange=A&eventStartDate=${TODAY_COMPACT}`);
        const json = await res.json();
        data = json?.response?.body?.items?.item;
    } catch { }

    // 방법 2: areaBasedList1 (축제)
    if (!data) {
        try {
            const res = await fetch(`https://apis.data.go.kr/B551011/KorService2/areaBasedList1?${baseParams}&contentTypeId=15`);
            const json = await res.json();
            data = json?.response?.body?.items?.item;
        } catch { }
    }

    if (!data || data.length === 0) {
        console.log('  ⚠️ 지역축제 API 응답 없음');
        return 0;
    }

    const items = (Array.isArray(data) ? data : [data]).map(f => ({
        name: f.title || '무제',
        event_date: fmtDate(f.eventstartdate) || TODAY,
        start_time: '10:00',
        end_time: '22:00',
        location: f.addr1 || '',
        memo: `축제 기간: ${fmtDate(f.eventstartdate)} ~ ${fmtDate(f.eventenddate)}`,
        type: 'festival',
        category: 'interest',
        external_resource_id: `tourapi_festival_${f.contentid}`,
    }));

    await upsertEvents(items, festCalId, '관광공사-축제');
    return items.length;
}

// ============================================================
// SOURCE 3: 인터파크 (Playwright + Cheerio CSS 셀렉터)
// ============================================================
async function scrapeInterpark(browser, perfCalId, exhibCalId) {
    console.log('\n🌐 [스크래핑] 인터파크 — 뮤지컬/콘서트/전시');

    const targets = [
        { name: '뮤지컬', url: 'https://tickets.interpark.com/contents/genre/musical', calId: perfCalId, type: 'musical' },
        { name: '콘서트', url: 'https://tickets.interpark.com/contents/genre/concert', calId: perfCalId, type: 'concert' },
        { name: '전시', url: 'https://tickets.interpark.com/contents/genre/exhibition', calId: exhibCalId, type: 'exhibition' },
    ];

    let total = 0;

    for (const target of targets) {
        console.log(`  📄 ${target.name}: ${target.url}`);
        try {
            const page = await browser.newPage();
            await page.setExtraHTTPHeaders({
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept-Language': 'ko-KR,ko;q=0.9'
            });
            await page.goto(target.url, { waitUntil: 'networkidle', timeout: 30000 });
            await sleep(2000); // JS 렌더링 대기

            const html = await page.content();
            await page.close();

            const events = parseInterparkHtml(html, target.type);
            console.log(`  🔍 CSS 셀렉터 추출: ${events.length}건`);

            if (events.length > 0) {
                await upsertEvents(events, target.calId, `인터파크-${target.name}`);
                total += events.length;
            }
        } catch (e) {
            console.log(`  ⚠️ ${target.name} 스크래핑 실패: ${e.message}`);
        }

        await sleep(2000); // 요청 딜레이
    }

    return total;
}

function parseInterparkHtml(html, type) {
    const $ = cheerio.load(html);
    const events = [];
    const seen = new Set();

    // 인터파크 다양한 CSS 패턴 시도
    const selectors = [
        // 랭킹 목록
        { container: '.rankingList li, .ranking-list li', title: '.prdName, .prdTit, .name', date: '.prdDuration, .date, .period', venue: '.prdVenue, .venue, .place' },
        // 상품 목록
        { container: '.prdList li, .product-list li', title: '.prdName, .prdTit', date: '.prdDuration, .date', venue: '.prdVenue, .venue' },
        // 카드형 목록
        { container: '.cardList li, .card-list li, [class*="card"]', title: 'a[title], h3, h4, .title', date: '.date, .period, [class*="date"]', venue: '.venue, .place, [class*="venue"]' },
        // a 태그 title 속성
        { container: 'a[href*="/goods/"]', title: null, date: null, venue: null },
    ];

    for (const sel of selectors) {
        $(sel.container).each((_, el) => {
            let name, dateStr, location;

            if (sel.title === null) {
                // a 태그의 title 속성에서 추출
                name = $(el).attr('title')?.trim();
            } else {
                name = $(el).find(sel.title).first().text().trim();
                dateStr = $(el).find(sel.date).first().text().trim();
                location = $(el).find(sel.venue).first().text().trim();
            }

            if (!name || name.length < 2) return;
            // 중복 제거
            if (seen.has(name)) return;
            seen.add(name);

            // 날짜 파싱 시도 (다양한 패턴)
            let eventDate = null;
            if (dateStr) {
                // "2026.04.15 ~ 2026.05.30" → 시작일
                const dateMatch = dateStr.match(/(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/);
                if (dateMatch) {
                    eventDate = `${dateMatch[1]}-${dateMatch[2].padStart(2, '0')}-${dateMatch[3].padStart(2, '0')}`;
                }
            }

            // 날짜가 없으면 오늘로 설정 (최소 DB에 저장)
            events.push({
                name,
                event_date: eventDate || TODAY,
                location: location || '',
                type,
                category: 'interest',
                external_resource_id: `interpark_${type}_${hashCode(name)}`,
            });
        });

        if (events.length > 0) break; // 첫 번째 매칭 셀렉터로 충분
    }

    // 결과가 없으면 텍스트 기반 fallback
    if (events.length === 0) {
        console.log('  📝 CSS 셀렉터 매칭 실패, 텍스트 추출 시도...');
        // 전체 텍스트에서 제목 패턴 추출
        const text = $('body').text();
        const titlePattern = /([가-힣A-Za-z0-9\s:&\-!]+)\s+(\d{4}[.\-/]\d{1,2}[.\-/]\d{1,2})/g;
        let match;
        while ((match = titlePattern.exec(text)) !== null) {
            const name = match[1].trim();
            if (name.length >= 3 && name.length <= 50 && !seen.has(name)) {
                seen.add(name);
                events.push({
                    name,
                    event_date: fmtDate(match[2]) || TODAY,
                    location: '',
                    type,
                    category: 'interest',
                    external_resource_id: `interpark_${type}_${hashCode(name)}`,
                });
            }
        }
    }

    return events;
}

// ============================================================
// MAIN
// ============================================================
async function main() {
    console.log('=== 🚀 자체 스크래퍼 v2 시작 (GPT 0회, ₩0) ===');
    console.log(`📅 기준 날짜: ${TODAY}\n`);

    const categories = await getCategoryCalendarMap();
    console.log('📂 카테고리 매핑:', categories.map(c => `${c.name} → ${c.target_calendar_id?.slice(0, 8)}...`).join(', '));

    const find = (keyword) => categories.find(c => c.name.includes(keyword))?.target_calendar_id;

    const perfCalId = find('공연');
    const exhibCalId = find('전시');
    const festCalId = find('축제');
    const popupCalId = find('팝업');

    let totalSaved = 0;

    // ---- Stage 1: 공공 API (비용 $0) ----
    console.log('\n━━━ Stage 1: 공공 API ━━━');
    totalSaved += await syncCultureAPI(perfCalId, exhibCalId);
    totalSaved += await syncFestivalAPI(festCalId);

    // ---- Stage 2: Playwright 스크래핑 (비용 $0) ----
    console.log('\n━━━ Stage 2: Playwright 스크래핑 ━━━');
    let browser;
    try {
        browser = await chromium.launch({ headless: true });
        totalSaved += await scrapeInterpark(browser, perfCalId, exhibCalId);
    } catch (e) {
        console.error('❌ Playwright 실행 실패:', e.message);
    } finally {
        if (browser) await browser.close();
    }

    console.log(`\n=== 🎉 완료! 총 ${totalSaved}건 처리 (GPT 호출: 0회, 비용: ₩0) ===`);
}

main().catch(console.error);
