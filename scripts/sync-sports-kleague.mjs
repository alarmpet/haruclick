import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
import path from 'path';

const envLocPath = path.resolve(process.cwd(), '.env.local');
dotenv.config({ path: envLocPath });

if (!process.env.SUPABASE_URL && !process.env.EXPO_PUBLIC_SUPABASE_URL) {
    dotenv.config({ path: path.resolve(process.cwd(), '.env') });
}

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL;
let SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL) {
    console.error('Missing SUPABASE_URL or EXPO_PUBLIC_SUPABASE_URL in environment');
    process.exit(1);
}

if (!SUPABASE_KEY) {
    console.warn('Missing SUPABASE_SERVICE_ROLE_KEY, falling back to SUPABASE_KEY (Anon Key). Data insertion might fail if RLS is enabled.');
    SUPABASE_KEY = process.env.SUPABASE_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
}

if (!SUPABASE_KEY) {
    console.error('Missing SUPABASE key for authentication.');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;
const TIMEOUT_MS = 10000;

function getDateRange30Days() {
    const today = new Date();
    const yyyy1 = today.getFullYear();
    const mm1 = String(today.getMonth() + 1).padStart(2, '0');
    const dd1 = String(today.getDate()).padStart(2, '0');
    const start = `${yyyy1}-${mm1}-${dd1}`;

    const future = new Date(today);
    future.setDate(future.getDate() + 30);
    const yyyy2 = future.getFullYear();
    const mm2 = String(future.getMonth() + 1).padStart(2, '0');
    const dd2 = String(future.getDate()).padStart(2, '0');
    const end = `${yyyy2}-${mm2}-${dd2}`;

    return { start, end };
}

async function fetchWithTimeout(url, options = {}) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
        const response = await fetch(url, { ...options, signal: controller.signal });
        clearTimeout(id);
        return response;
    } catch (error) {
        clearTimeout(id);
        throw error;
    }
}

async function fetchKleagueDataWithRetry(start, end, retries = MAX_RETRIES) {
    const url = `https://api-gw.sports.naver.com/schedule/games?fields=basic,schedule,football,manualRelayUrl&upperCategoryId=kfootball&fromDate=${start}&toDate=${end}&size=500`;

    for (let i = 0; i < retries; i++) {
        try {
            console.log(`[Sync K-League] Fetching Naver Sports API... (Attempt ${i + 1}/${retries})`);
            const response = await fetchWithTimeout(url);

            if (!response.ok) {
                console.warn(`[Sync K-League] API error: Status ${response.status}`);
                throw new Error(`API returned status ${response.status}`);
            }

            const data = await response.json();
            return data.result?.games || [];
        } catch (error) {
            console.warn(`[Sync K-League] Fetch error: ${error.message}`);
            if (i === retries - 1) {
                console.error(`[Sync K-League] All ${MAX_RETRIES} retries failed.`);
                return null;
            }
            console.log(`[Sync K-League] Retrying in ${RETRY_DELAY_MS / 1000}s...`);
            await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
        }
    }
    return null;
}

async function syncKleagueEvents() {
    console.log(`[Sync K-League] Starting K-League match data sync...`);

    // 1. Fetch category id
    const { data: categoryData, error: categoryError } = await supabase
        .from('interest_categories')
        .select('target_calendar_id, name')
        .eq('name', 'K리그')
        .limit(1);

    if (categoryError || !categoryData || categoryData.length === 0) {
        console.error('[Sync K-League] Error retrieving K-League category from DB:', categoryError?.message || 'Category "K리그" not found');
        return;
    }

    const kleagueCalendarId = categoryData[0].target_calendar_id;
    if (!kleagueCalendarId) {
        console.error('[Sync K-League] target_calendar_id is missing for "K리그" category.');
        return;
    }
    console.log(`[Sync K-League] Mapped 'K리그' to Calendar ID: ${kleagueCalendarId}`);

    // 2. Fetch matches from API
    const { start, end } = getDateRange30Days();
    console.log(`[Sync K-League] Fetching matches for ${start} ~ ${end}`);
    const games = await fetchKleagueDataWithRetry(start, end);

    if (!games) {
        console.error('[Sync K-League] Failed to fetch data. Keeping existing DB records unchanged as per fail-safe policy.');
        return;
    }

    // Process data
    const kleagueGames = games.filter(g => ['K리그1', 'K리그2'].includes(g.categoryName) && !g.cancel);
    console.log(`[Sync K-League] Parsed ${kleagueGames.length} valid K-League matches.`);

    if (kleagueGames.length === 0) {
        console.log(`[Sync K-League] No K-League matches to sync for this period. Done.`);
        return;
    }

    const eventsToInsert = kleagueGames.map(game => {
        const title = `[${game.categoryName}] ${game.homeTeamName} vs ${game.awayTeamName}`;
        const startTimeObj = new Date(game.gameDateTime);
        // 축구 경기는 대략 2시간(120분) 소요
        const endTimeObj = new Date(startTimeObj.getTime() + 120 * 60 * 1000);

        const yyyy = startTimeObj.getFullYear();
        const mm = String(startTimeObj.getMonth() + 1).padStart(2, '0');
        const dd = String(startTimeObj.getDate()).padStart(2, '0');
        const eventDate = `${yyyy}-${mm}-${dd}`;

        return {
            calendar_id: kleagueCalendarId,
            name: title,
            event_date: eventDate,
            start_time: startTimeObj.toISOString().split('T')[1].substring(0, 8),
            end_time: endTimeObj.toISOString().split('T')[1].substring(0, 8),
            location: game.stadium || '구장 미정',
            type: 'sports',
            category: 'schedule',
            external_resource_id: `naver_kleague_${game.gameId}`,
            memo: JSON.stringify({
                title: title,
                description: `${game.categoryName} ${game.homeTeamName} vs ${game.awayTeamName} 경기입니다.\n상태: ${game.statusInfo || '예정'}`,
                region: game.stadium,
                detail_type: 'KLeague',
                teams: [game.homeTeamName, game.awayTeamName]
            })
        };
    });

    // 3. Insert into Supabase
    try {
        console.log(`[Sync K-League] Upserting ${eventsToInsert.length} events to Supabase...`);
        const { data, error } = await supabase
            .from('events')
            .upsert(eventsToInsert, { onConflict: 'calendar_id, external_resource_id' })
            .select();

        if (error) {
            console.error('[Sync K-League] Error during upsert:', error.message);
        } else {
            console.log(`[Sync K-League] Successfully upserted ${data?.length || 0} events.`);
        }
    } catch (err) {
        console.error('[Sync K-League] Unexpected error during operation:', err);
    }
}

syncKleagueEvents()
    .then(() => {
        console.log('[Sync K-League] K-League sync script completed.');
        process.exit(0);
    })
    .catch((error) => {
        console.error('[Sync K-League] Unhandled Error:', error);
        process.exit(1);
    });
