import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch'; // If node 18+, native fetch is available, but this is script
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
if (!process.env.SUPABASE_URL && !process.env.EXPO_PUBLIC_SUPABASE_URL) {
    dotenv.config({ path: '.env' });
}

const supabaseUrl = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL;
// GitHub Actions에서는 SUPABASE_SERVICE_ROLE_KEY를 환경변수로 주입받습니다.
// 로컬 테스트를 위해 ANON_KEY도 허용합니다.
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const footballApiKey = process.env.FOOTBALL_DATA_API_KEY;

if (!supabaseUrl || !supabaseKey || !footballApiKey) {
    console.error('Error: Missing Supabase credentials or FOOTBALL_DATA_API_KEY in environment.');
    process.exit(1); // GitHub Actions 실패 알림용 (claude.md Fail-Safe)
}

const supabase = createClient(supabaseUrl, supabaseKey);

// football-data.org 지원 리그 코드 (Free Tier 기준)
const LEAGUES = [
    { code: 'PL', name: 'EPL (프리미어리그)' },
    { code: 'PD', name: '라리가' },
    { code: 'BL1', name: '분데스리가' },
    // 필요 시 세리에A(SA), 리그앙(FL1) 등 추가 가능
];

function formatDateStruct(date) {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

async function syncFootballEvents() {
    console.log(`[Sync Football] Starting... `);

    // 1. 카테고리 정보 조회하여 calendar_id 캐싱 (claude.md DB 정합성 규칙)
    const { data: categories, error: catErr } = await supabase
        .from('interest_categories')
        .select('name, target_calendar_id');

    if (catErr || !categories) {
        console.error('Failed to fetch interest categories:', catErr);
        process.exit(1);
    }

    const calendarMap = {};
    categories.forEach(c => { calendarMap[c.name] = c.target_calendar_id; });

    const today = new Date();
    const dateFrom = formatDateStruct(today);
    const dateToObj = new Date(today);
    dateToObj.setDate(dateToObj.getDate() + 30);
    const dateTo = formatDateStruct(dateToObj);

    console.log(`[Sync Football] Target Date: ${dateFrom} ~ ${dateTo}`);

    let totalUpserted = 0;

    for (const league of LEAGUES) {
        const targetCalendarId = calendarMap[league.name];
        if (!targetCalendarId) {
            console.warn(`Warning: '${league.name}' 카테고리 또는 캘린더가 존재하지 않아 건너뜁니다.`);
            continue;
        }

        console.log(`[${league.code}] Fetching data...`);
        const url = `https://api.football-data.org/v4/competitions/${league.code}/matches?dateFrom=${dateFrom}&dateTo=${dateTo}`;

        // claude.md: 명시적 Timeout(8000ms) 추가
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);

        try {
            const apiRes = await fetch(url, {
                headers: { 'X-Auth-Token': footballApiKey },
                signal: controller.signal
            });

            if (!apiRes.ok) {
                const text = await apiRes.text();
                console.error(`[${league.code}] API Error ${apiRes.status}: ${text}`);
                if (apiRes.status === 429) {
                    console.error('Rate limit reached. Waiting longer...');
                    await new Promise(r => setTimeout(r, 60000)); // Rate limit 조치
                    continue;
                }
                process.exit(1);
            }

            const data = await apiRes.json();
            const matches = data.matches || [];
            console.log(`[${league.code}] Found ${matches.length} matches.`);

            const eventsData = matches.map(match => {
                const homeTeam = match.homeTeam.name;
                const awayTeam = match.awayTeam.name;
                const startTime = new Date(match.utcDate);
                // 축구 경기는 대략 2시간(120분) 소요
                const endTime = new Date(startTime.getTime() + 120 * 60 * 1000);

                return {
                    calendar_id: targetCalendarId,
                    name: `[${league.code}] ${homeTeam} vs ${awayTeam}`,
                    event_date: formatDateStruct(startTime),
                    start_time: startTime.toISOString().split('T')[1].substring(0, 8),
                    end_time: endTime.toISOString().split('T')[1].substring(0, 8),
                    location: match.area.name, // 구장 정보가 없을 시 국가로 표기
                    type: 'sports',
                    category: 'schedule',
                    external_resource_id: `football_data_${league.code}_${match.id}`,
                    // 필터 및 상세 내역을 위해 memo에 JSON 문자열 저장
                    memo: JSON.stringify({
                        title: `[${league.name}] ${homeTeam} vs ${awayTeam}`,
                        description: `${homeTeam} vs ${awayTeam} 경기입니다.\n상태: ${match.status}`,
                        region: match.area.name,
                        detail_type: league.code,
                        teams: [homeTeam, awayTeam]
                    })
                };
            });

            if (eventsData.length > 0) {
                // Upsert
                const { error: upsertErr } = await supabase
                    .from('events')
                    .upsert(eventsData, { onConflict: 'calendar_id, external_resource_id' });

                if (upsertErr) {
                    console.error(`[${league.code}] Upsert Error:`, upsertErr);
                    process.exit(1);
                }

                totalUpserted += eventsData.length;
                console.log(`[${league.code}] Successfully upserted ${eventsData.length} events.`);
            }

            // Rate Limit (10 req/min) 방지를 위해 요청 간 지연 
            await new Promise(r => setTimeout(r, 6500));

        } catch (error) {
            console.error(`[${league.code}] Data Fetch Failed:`, error);
            process.exit(1);
        } finally {
            clearTimeout(timeout);
        }
    }

    console.log(`[Sync Football] 🎉 Fully Complete. Total Upserted: ${totalUpserted}`);
}

syncFootballEvents();
