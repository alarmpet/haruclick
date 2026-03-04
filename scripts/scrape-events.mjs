/**
 * scrape-events.mjs
 * Firecrawl API 기반 웹 스크래핑 → Regex 우선 파싱 → GPT-4o Fallback → Supabase DB 적재
 *
 * 실행 방법:
 *   node scripts/scrape-events.mjs
 *
 * 환경변수 (또는 아래 상수에 직접 입력):
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, FIRECRAWL_KEY, OPENAI_API_KEY
 */

import { createClient } from '@supabase/supabase-js';

// ============================================================
// ▼▼▼ 환경변수 또는 직접 입력 ▼▼▼
// ============================================================
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://brsouceosomykgloouiu.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const FIRECRAWL_KEY = process.env.FIRECRAWL_KEY || '';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
// ============================================================

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// ============================================================
// 스크래핑 타겟 정의
// ============================================================
const SCRAPE_TARGETS = [
    {
        name: '인터파크 전시',
        url: 'https://tickets.interpark.com/contents/genre/exhibition',
        categoryName: '전시 (미술/박물관)',
        type: 'exhibition',
        useGPT: true,  // 인터파크는 구조가 복잡해 GPT 필수
    },
    {
        name: '인터파크 뮤지컬',
        url: 'https://tickets.interpark.com/contents/genre/musical',
        categoryName: '공연 (연극/뮤지컬)',
        type: 'performance',
        useGPT: true,
    },
    {
        name: '인터파크 콘서트',
        url: 'https://tickets.interpark.com/contents/genre/concert',
        categoryName: '공연 (연극/뮤지컬)',
        type: 'performance',
        useGPT: true,
    },
    {
        name: '네이버 팝업스토어',
        url: 'https://m.search.naver.com/search.naver?query=%ED%8C%9D%EC%97%85%EC%8A%A4%ED%86%A0%EC%96%B4+%EC%9D%BC%EC%A0%95',
        categoryName: '팝업 스토어',
        type: 'popup',
        useGPT: false,
    },
];

// ============================================================
// 1. Firecrawl API로 웹페이지 스크래핑
// ============================================================
async function scrapeWithFirecrawl(url) {
    if (!FIRECRAWL_KEY) {
        console.warn('  ⚠️ FIRECRAWL_KEY가 설정되지 않았습니다. 기본 fetch로 대체합니다.');
        return await fallbackFetch(url);
    }

    try {
        const res = await fetch('https://api.firecrawl.dev/v1/scrape', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${FIRECRAWL_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                url,
                formats: ['markdown'],
                waitFor: 3000,
            }),
        });

        if (!res.ok) {
            console.warn(`  ⚠️ Firecrawl API 실패 (${res.status}). 기본 fetch로 대체합니다.`);
            return await fallbackFetch(url);
        }

        const json = await res.json();
        return json.data?.markdown || '';
    } catch (error) {
        console.error('  ❌ Firecrawl 호출 에러:', error.message);
        return await fallbackFetch(url);
    }
}

async function fallbackFetch(url) {
    try {
        const res = await fetch(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 HaruClick/1.0' },
        });
        return await res.text();
    } catch (error) {
        console.error('  ❌ Fallback fetch 에러:', error.message);
        return '';
    }
}

// ============================================================
// 2. Regex 파서 (비용 0원 — 우선 시도)
// ============================================================
function parseEventsWithRegex(rawText, type) {
    const events = [];

    // 패턴 1: "제목 | 날짜" 또는 "제목 - 날짜" 형태
    const datePatterns = [
        // YYYY.MM.DD ~ YYYY.MM.DD 또는 YYYY-MM-DD 형태
        /(?:^|\n)[\s]*[#*\-]*\s*(.{2,60})\s*[|\-–~]\s*(\d{4}[.\-/]\d{1,2}[.\-/]\d{1,2})/gm,
        // MM.DD ~ MM.DD 또는 MM/DD 형태
        /(?:^|\n)[\s]*[#*\-]*\s*(.{2,60})\s*[|\-–~]\s*(\d{1,2}[.\-/]\d{1,2})/gm,
    ];

    // 패턴 2: 마크다운 링크 + 날짜 조합
    const markdownPattern = /\[([^\]]{2,60})\]\([^)]*\)[\s\S]{0,100}?(\d{4}[.\-/]\d{1,2}[.\-/]\d{1,2})/gm;

    // 패턴 3: 제목 뒤에 기간 표시 (예: "봄날 2026.03.15 ~ 2026.04.30")
    const titleDateRange = /(.{2,50})\s+(\d{4}[.\-/]\d{1,2}[.\-/]\d{1,2})\s*[~\-–]\s*(\d{4}[.\-/]\d{1,2}[.\-/]\d{1,2})/gm;

    const seen = new Set();

    // 우선: 제목+기간 범위 패턴
    let match;
    while ((match = titleDateRange.exec(rawText)) !== null) {
        const title = cleanTitle(match[1]);
        const startDate = normalizeDate(match[2]);
        if (title && startDate && !seen.has(title)) {
            seen.add(title);
            events.push({
                name: title,
                event_date: startDate,
                type,
                memo: `기간: ${match[2]} ~ ${match[3]}`,
            });
        }
    }

    // 보조: 단일 날짜 패턴
    for (const pattern of datePatterns) {
        while ((match = pattern.exec(rawText)) !== null) {
            const title = cleanTitle(match[1]);
            const date = normalizeDate(match[2]);
            if (title && date && !seen.has(title)) {
                seen.add(title);
                events.push({ name: title, event_date: date, type });
            }
        }
    }

    // 마크다운 링크 패턴
    while ((match = markdownPattern.exec(rawText)) !== null) {
        const title = cleanTitle(match[1]);
        const date = normalizeDate(match[2]);
        if (title && date && !seen.has(title)) {
            seen.add(title);
            events.push({ name: title, event_date: date, type });
        }
    }

    return events;
}

function cleanTitle(raw) {
    return raw
        .replace(/[#*\[\]()]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 100);
}

function normalizeDate(dateStr) {
    const cleaned = dateStr.replace(/[.\-/]/g, '-');
    const parts = cleaned.split('-');
    if (parts.length === 3) {
        const year = parts[0].length === 4 ? parts[0] : `2026`;
        const month = parts[parts.length === 4 ? 1 : (parts[0].length === 4 ? 1 : 0)].padStart(2, '0');
        const day = parts[parts.length - 1].padStart(2, '0');
        return `${year}-${month}-${day}`;
    }
    if (parts.length === 2) {
        // MM-DD 형태: 올해로 가정
        const now = new Date();
        return `${now.getFullYear()}-${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}`;
    }
    return null;
}

// ============================================================
// 3. GPT-4o Text 파싱 Fallback (Regex 실패 시)
//    CLAUDE.md 규칙: "OpenAI Text는 최후 수단"
// ============================================================
async function parseEventsWithGPT(rawText, type) {
    if (!OPENAI_API_KEY) {
        console.warn('  ⚠️ OPENAI_API_KEY가 설정되지 않았습니다. GPT 파싱을 건너뜁니다.');
        return [];
    }

    // HTML 태그 제거 전처리
    const cleaned = rawText
        .replace(/<[^>]*>/g, '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/\\+/g, '')
        .replace(/\s{3,}/g, '\n');

    // 텍스트가 너무 길면 잘라서 비용 절감
    const truncated = cleaned.slice(0, 8000);
    const today = new Date(new Date().getTime() + 9 * 60 * 60 * 1000).toISOString().split('T')[0];

    try {
        const res = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${OPENAI_API_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: 'gpt-4o-mini',  // 비용 효율: gpt-4o 대신 mini 사용
                messages: [
                    {
                        role: 'system',
                        content: `당신은 공연/전시/행사 정보 전문 파서입니다.
주어진 마크다운 텍스트에서 공연·전시·콘서트·뮤지컬·팝업 등의 정보를 추출하세요.

오늘 날짜: ${today}

중요 규칙:
- "name"은 반드시 공연/전시의 제목(작품명)이어야 합니다. 공연장 이름(예: 세종대학교 대양홀, 장충체육관)이나 날짜는 이름으로 쓰지 마세요.
- "location"은 공연장/장소를 씁니다.
- "event_date"는 공연 시작일(YYYY-MM-DD)입니다.
- 오늘 날짜(${today}) 이후의 미래 행사만 추출하세요. 과거 행사는 제외하세요.
- 확실하지 않은 항목은 제외하세요.
- 최대 20개까지 추출하세요.

반환 형식: [{"name": "작품명", "event_date": "YYYY-MM-DD", "location": "공연장"}]`,
                    },
                    {
                        role: 'user',
                        content: truncated,
                    },
                ],
                temperature: 0.1,
                max_tokens: 2000,
            }),
        });

        const json = await res.json();
        const content = json.choices?.[0]?.message?.content || '[]';

        // JSON 블록 추출
        const jsonMatch = content.match(/\[[\s\S]*\]/);
        if (!jsonMatch) return [];

        const parsed = JSON.parse(jsonMatch[0]);
        return parsed.map(item => ({
            name: item.name?.slice(0, 100) || '무제',
            event_date: item.event_date || new Date().toISOString().split('T')[0],
            location: item.location || '',
            type,
        }));
    } catch (error) {
        console.error('  ❌ GPT 파싱 에러:', error.message);
        return [];
    }
}

// ============================================================
// 4. DB 적재 (기존 sync-interest-data.mjs 패턴 재사용)
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
    if (!calendarId) {
        console.warn(`  ⚠️ ${sourceName}: calendar_id 없음, 건너뜁니다.`);
        return;
    }
    if (events.length === 0) {
        console.log(`  → ${sourceName}: 추출된 이벤트 없음`);
        return;
    }

    const rows = events.map((e, i) => ({
        calendar_id: calendarId,
        name: e.name,
        event_date: e.event_date,
        start_time: '10:00',
        end_time: '22:00',
        location: e.location || '',
        memo: e.memo || `출처: ${sourceName}`,
        type: e.type || 'interest',
        category: 'interest',
        external_resource_id: `scrape_${sourceName.replace(/\s/g, '_')}_${i}_${e.event_date}`,
    }));

    const { error } = await supabase
        .from('events')
        .upsert(rows, { onConflict: 'calendar_id,external_resource_id' });

    if (error) {
        console.error(`  ❌ ${sourceName} DB 저장 실패:`, error.message);
    } else {
        console.log(`  ✅ ${sourceName}: ${rows.length}건 저장 완료!`);
    }
}

// ============================================================
// MAIN: 비용 계단식 파이프라인
//   1) Firecrawl 스크래핑
//   2) Regex 파싱 (비용 0원)
//   3) Regex 실패  → GPT-4o-mini Fallback
//   4) DB 적재
// ============================================================
async function main() {
    console.log('=== 🕷️ Firecrawl 기반 이벤트 스크래핑 시작 ===\n');

    if (!SUPABASE_SERVICE_ROLE_KEY) {
        console.error('❌ SUPABASE_SERVICE_ROLE_KEY가 설정되지 않았습니다.');
        process.exit(1);
    }

    // DB에서 카테고리 → 캘린더 ID 매핑 가져오기
    const categories = await getCategoryCalendarMap();
    console.log('📂 카테고리-캘린더 매핑:', categories.map(c => `${c.name} → ${c.target_calendar_id?.slice(0, 8)}...`).join(', '));

    const findCalId = (catName) => {
        // 부분 매치 (예: "공연 (연극/뮤지컬)" → "공연" 포함 검색)
        const found = categories.find(c => c.name.includes(catName.split(' ')[0]));
        return found?.target_calendar_id;
    };

    let totalSaved = 0;

    for (const target of SCRAPE_TARGETS) {
        console.log(`\n--- [${target.name}] ${target.url} ---`);

        // Step 1: Firecrawl로 스크래핑
        const rawText = await scrapeWithFirecrawl(target.url);
        if (!rawText) {
            console.log('  → 스크래핑 실패, 건너뜁니다.');
            continue;
        }
        console.log(`  📄 스크래핑 완료 (${rawText.length}자)`);

        // Step 2: Regex 파싱 (비용 0원)
        let events = parseEventsWithRegex(rawText, target.type);
        console.log(`  🔍 Regex 파싱 결과: ${events.length}건`);

        // Step 3: GPT 파싱 (useGPT:true 타겟은 항상 / 그 외는 Regex 3건 미만일 때)
        const shouldUseGPT = target.useGPT || events.length < 3;
        if (shouldUseGPT) {
            if (target.useGPT) {
                console.log('  🤖 GPT-4o-mini 파싱 (인터파크 구조 최적화)...');
            } else {
                console.log('  🤖 Regex 결과 부족 → GPT-4o-mini Fallback 시도...');
            }
            const gptEvents = await parseEventsWithGPT(rawText, target.type);
            console.log(`  🤖 GPT 파싱 결과: ${gptEvents.length}건`);
            // GPT 결과를 우선 사용 (useGPT 타겟은 GPT 결과로 교체)
            if (target.useGPT && gptEvents.length > 0) {
                events = gptEvents;  // GPT 결과로 완전 교체
            } else {
                // Fallback: Regex + GPT 합치기 (중복 제거)
                const seen = new Set(events.map(e => e.name));
                for (const ge of gptEvents) {
                    if (!seen.has(ge.name)) {
                        events.push(ge);
                        seen.add(ge.name);
                    }
                }
            }
        }

        // Step 4: 과거 날짜 필터 (오늘 이후만 저장)
        const todayStr = new Date(new Date().getTime() + 9 * 60 * 60 * 1000).toISOString().split('T')[0];
        const beforeFilter = events.length;
        events = events.filter(e => e.event_date && e.event_date >= todayStr);
        if (beforeFilter !== events.length) {
            console.log(`  🗑️ 과거 날짜 제거: ${beforeFilter - events.length}건 → 미래 이벤트 ${events.length}건`);
        }

        // Step 5: DB 적재
        const calId = findCalId(target.categoryName);
        await upsertEvents(events, calId, target.name);
        totalSaved += events.length;
    }

    console.log(`\n=== 🎉 스크래핑 완료! 총 ${totalSaved}건 처리 ===`);
}

main().catch(console.error);
