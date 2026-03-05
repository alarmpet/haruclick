/**
 * sync-movies.mjs
 * 영화 개봉 예정일 수집 스크립트 (KOBIS 공공 API, 비용 ₩0)
 *
 * 데이터 소스:
 *   1) KOBIS (영화진흥위원회) 공공 API — 개봉예정 영화 목록
 *   2) CGV Playwright 스크래핑 — KOBIS 실패 시 fallback
 *
 * 실행: node scripts/sync-movies.mjs
 */

import { createClient } from '@supabase/supabase-js';
import { chromium } from 'playwright';
import * as cheerio from 'cheerio';

// ============================================================
// 환경 변수 / 상수
// ============================================================
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://brsouceosomykgloouiu.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const KOBIS_API_KEY = process.env.KOBIS_API_KEY || '1d060eb81181a885861e6c7399df7995';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// KST 오늘 날짜
const TODAY = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().split('T')[0];
const TODAY_COMPACT = TODAY.replace(/-/g, '');

// 6개월 후 (개봉 예정은 더 넓게)
const SIX_MONTHS_LATER = new Date(Date.now() + 9 * 60 * 60 * 1000 + 180 * 24 * 60 * 60 * 1000)
    .toISOString().split('T')[0].replace(/-/g, '');

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

function hashCode(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash) + str.charCodeAt(i);
        hash |= 0;
    }
    return Math.abs(hash).toString(36);
}

// ============================================================
// DB 헬퍼
// ============================================================
async function getMovieCalendarId() {
    const { data, error } = await supabase
        .from('interest_categories')
        .select('name, target_calendar_id')
        .ilike('name', '%개봉%')
        .not('target_calendar_id', 'is', null)
        .single();

    if (error || !data) {
        // fallback: '영화' 카테고리로 찾기
        const { data: fallback } = await supabase
            .from('interest_categories')
            .select('name, target_calendar_id')
            .ilike('name', '%영화%')
            .not('target_calendar_id', 'is', null)
            .single();
        return fallback?.target_calendar_id || null;
    }
    return data.target_calendar_id;
}

async function upsertEvents(events, calendarId, sourceName) {
    if (!events.length || !calendarId) {
        console.log(`  ⚠️ ${sourceName}: 저장 건너뜀 (events=${events.length}, calendarId=${calendarId})`);
        return 0;
    }

    // 오늘 이후 이벤트만 저장
    const futureEvents = events.filter(e => e.event_date && e.event_date >= TODAY);
    console.log(`  📦 ${sourceName}: ${futureEvents.length}건 저장 대상 (전체 ${events.length}건)`);

    const rows = futureEvents.map(e => ({
        calendar_id: calendarId,
        name: e.name?.slice(0, 100) || '무제',
        event_date: e.event_date,
        start_time: e.start_time || '10:00',
        end_time: e.end_time || '23:59',
        location: e.location || '전국 극장',
        memo: e.memo || '',
        type: 'movie',
        category: 'schedule',
        external_resource_id: e.external_resource_id || `movie_${hashCode(e.name + e.event_date)}`,
    }));

    const { error } = await supabase.from('events').upsert(rows, {
        onConflict: 'calendar_id,external_resource_id'
    });

    if (error) {
        console.error(`  ❌ ${sourceName} DB 오류:`, error.message);
        return 0;
    }
    console.log(`  ✅ ${sourceName}: ${rows.length}건 저장 완료!`);
    return rows.length;
}

// ============================================================
// SOURCE 1: KOBIS (영화진흥위원회) 공공 API
// ============================================================
async function syncKobisMovies(movieCalId) {
    console.log('\n📡 [KOBIS API] 영화진흥위원회 — 개봉예정 영화');

    const BASE_URL = 'https://kobis.or.kr/kobisopenapi/webservice/rest/movie/searchMovieList.json';
    const currentYear = TODAY.split('-')[0];
    let allMovies = [];
    let curPage = 1;

    // KOBIS openStartDt requires YYYY format
    while (curPage <= 10) {
        const url = `${BASE_URL}?key=${KOBIS_API_KEY}&openStartDt=${currentYear}&itemPerPage=100&curPage=${curPage}`;
        try {
            const text = await fetchWithRetry(url);
            const json = JSON.parse(text);
            const movies = json?.movieListResult?.movieList || [];

            if (!movies.length) break;
            allMovies.push(...movies);

            const totCount = json?.movieListResult?.totCnt || 0;
            if (allMovies.length >= totCount) break;
            curPage++;
        } catch (e) {
            console.log(`  ⚠️ KOBIS API 실패: ${e.message}`);
            break;
        }
    }

    console.log(`  🎬 수집: ${allMovies.length}건`);

    const events = allMovies
        // API returns all of YYYY, so we filter by strictly upcoming dates
        .filter(m => m.openDt && m.openDt.length >= 8 && m.openDt >= TODAY_COMPACT)
        .map(m => ({
            name: m.movieNm,
            event_date: fmtDate(m.openDt),
            memo: [
                m.genreAlt && `장르: ${m.genreAlt}`,
                m.nationAlt && `제작국: ${m.nationAlt}`,
                m.directors?.director?.[0]?.peopleNm && `감독: ${m.directors.director[0].peopleNm}`,
            ].filter(Boolean).join(' | '),
            type: 'movie',
            external_resource_id: `kobis_${m.movieCd}`,
        }));

    return await upsertEvents(events, movieCalId, 'KOBIS-개봉예정');
}

// ============================================================
// SOURCE 2: CGV Playwright 스크래핑 (KOBIS fallback)
// ============================================================
async function scrapeCGVMovies(browser, movieCalId) {
    console.log('\n🌐 [스크래핑] CGV — 개봉예정');

    const url = 'https://www.cgv.co.kr/movies/pre-sales.aspx';
    try {
        const page = await browser.newPage();
        await page.setExtraHTTPHeaders({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept-Language': 'ko-KR,ko;q=0.9'
        });
        await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
        await sleep(2000);

        const html = await page.content();
        await page.close();

        const $ = cheerio.load(html);
        const events = [];
        const seen = new Set();

        // CGV 개봉예정 목록 파싱
        $('.sect-movies-big li, .sect-movie-chart li, [class*="movie"] li').each((_, el) => {
            const titleEl = $(el).find('strong.title, .title, h3, .movie-name, [class*="title"]').first();
            const name = titleEl.text().trim();
            const dateEl = $(el).find('.txt-info, .release-date, [class*="date"], .opening-date').first();
            const dateText = dateEl.text().trim();

            if (!name || name.length < 2 || seen.has(name)) return;

            // "2026.04.15 개봉" 등에서 날짜 추출
            const dateMatch = dateText.match(/(\d{4})[.\-\/](\d{1,2})[.\-\/](\d{1,2})/);
            const event_date = dateMatch
                ? `${dateMatch[1]}-${dateMatch[2].padStart(2, '0')}-${dateMatch[3].padStart(2, '0')}`
                : null;

            if (!event_date) return;
            seen.add(name);
            events.push({
                name,
                event_date,
                memo: `출처: CGV 개봉예정`,
                type: 'movie',
                external_resource_id: `cgv_movie_${hashCode(name + event_date)}`,
            });
        });

        console.log(`  🔍 CGV 추출: ${events.length}건`);
        return await upsertEvents(events, movieCalId, 'CGV-개봉예정');
    } catch (e) {
        console.log(`  ⚠️ CGV 스크래핑 실패: ${e.message}`);
        return 0;
    }
}

// ============================================================
// MAIN
// ============================================================
async function main() {
    console.log('=== 🎬 영화 개봉 예정일 수집 시작 (₩0) ===');
    console.log(`📅 수집 기간: ${TODAY} ~ ${fmtDate(SIX_MONTHS_LATER)}\n`);

    const movieCalId = await getMovieCalendarId();
    if (!movieCalId) {
        console.error('❌ 영화 카테고리의 calendar_id를 찾을 수 없습니다.');
        console.error('   seed_movies_categories.sql을 Supabase에서 먼저 실행해주세요.');
        process.exit(1);
    }
    console.log(`📂 영화 캘린더 ID: ${movieCalId.slice(0, 8)}...`);

    let totalSaved = 0;

    // ---- Stage 1: KOBIS 공공 API ----
    totalSaved += await syncKobisMovies(movieCalId);

    // ---- Stage 2: CGV Playwright (KOBIS 보조) ----
    let browser;
    try {
        browser = await chromium.launch({ headless: true });
        totalSaved += await scrapeCGVMovies(browser, movieCalId);
    } catch (e) {
        console.error('❌ Playwright 실행 실패:', e.message);
    } finally {
        if (browser) await browser.close();
    }

    console.log(`\n=== 🎉 완료! 총 ${totalSaved}건 저장 (KOBIS API + CGV, 비용 ₩0) ===`);
}

main().catch(console.error);
