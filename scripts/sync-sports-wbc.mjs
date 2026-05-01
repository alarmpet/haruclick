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
const WBC_START_DATE = '2026-03-05';
const WBC_END_DATE = '2026-03-25';
const WBC_CANDIDATE_IDS = ['wbc', 'worldbaseball', 'wbaseball'];
const CATEGORY_KEYWORDS = ['wbc', 'world baseball', 'worldbaseball'];

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

function includesKeyword(value) {
    const lowered = String(value || '').toLowerCase();
    return CATEGORY_KEYWORDS.some((keyword) => lowered.includes(keyword));
}

async function findWbcCalendarId() {
    const { data: categories, error } = await supabase
        .from('interest_categories')
        .select('name, target_calendar_id')
        .not('target_calendar_id', 'is', null);

    if (error || !categories) {
        console.error('[Sync WBC] Failed to fetch interest categories:', error?.message || error);
        return null;
    }

    const match = categories.find((item) => includesKeyword(item.name));
    if (!match?.target_calendar_id) {
        console.warn('[Sync WBC] No WBC-like category found in interest_categories.');
        return null;
    }

    console.log(`[Sync WBC] Mapped '${match.name}' to Calendar ID: ${match.target_calendar_id}`);
    return match.target_calendar_id;
}

async function discoverWbcCategoryId() {
    console.log('[Sync WBC] Probing Naver API for WBC category id...');
    for (const catId of WBC_CANDIDATE_IDS) {
        const url = `https://api-gw.sports.naver.com/schedule/games?fields=basic,schedule,baseball&upperCategoryId=${catId}&fromDate=${WBC_START_DATE}&toDate=${WBC_END_DATE}&size=10`;
        try {
            const response = await fetchWithTimeout(url);
            if (!response.ok) {
                continue;
            }

            const data = await response.json();
            const games = data.result?.games || [];
            if (games.length > 0) {
                console.log(`[Sync WBC] Found category id '${catId}' with ${games.length} games.`);
                return catId;
            }
        } catch {
            // Continue probing other candidate ids.
        }
    }

    console.warn('[Sync WBC] No valid WBC category id found from Naver API candidates.');
    return null;
}

async function fetchWbcDataWithRetry(catId, retries = MAX_RETRIES) {
    const url = `https://api-gw.sports.naver.com/schedule/games?fields=basic,schedule,baseball,manualRelayUrl&upperCategoryId=${catId}&fromDate=${WBC_START_DATE}&toDate=${WBC_END_DATE}&size=500`;

    for (let i = 0; i < retries; i++) {
        try {
            console.log(`[Sync WBC] Fetching Naver Sports API with '${catId}'... (Attempt ${i + 1}/${retries})`);
            const response = await fetchWithTimeout(url);

            if (!response.ok) {
                console.warn(`[Sync WBC] API error: Status ${response.status}`);
                throw new Error(`API returned status ${response.status}`);
            }

            const data = await response.json();
            return data.result?.games || [];
        } catch (error) {
            console.warn(`[Sync WBC] Fetch error: ${error.message}`);
            if (i === retries - 1) {
                console.error(`[Sync WBC] All ${MAX_RETRIES} retries failed.`);
                return null;
            }
            console.log(`[Sync WBC] Retrying in ${RETRY_DELAY_MS / 1000}s...`);
            await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
        }
    }

    return null;
}

async function syncWbcEvents() {
    console.log('[Sync WBC] Starting WBC match data sync...');

    const wbcCalendarId = await findWbcCalendarId();
    if (!wbcCalendarId) {
        return;
    }

    const wbcCategoryId = await discoverWbcCategoryId();
    if (!wbcCategoryId) {
        return;
    }

    const games = await fetchWbcDataWithRetry(wbcCategoryId);
    if (!games) {
        console.error('[Sync WBC] Failed to fetch data. Keeping existing DB records unchanged.');
        return;
    }

    const wbcGames = games.filter((game) => game.homeTeamName && game.awayTeamName && !game.cancel);
    console.log(`[Sync WBC] Parsed ${wbcGames.length} valid WBC matches.`);

    if (wbcGames.length === 0) {
        console.log('[Sync WBC] No WBC matches found. Done.');
        return;
    }

    const eventsToInsert = wbcGames.map((game) => {
        const title = `[WBC] ${game.homeTeamName} vs ${game.awayTeamName}`;
        const startTimeObj = new Date(game.gameDateTime);
        const endTimeObj = new Date(startTimeObj.getTime() + 210 * 60 * 1000);
        const yyyy = startTimeObj.getFullYear();
        const mm = String(startTimeObj.getMonth() + 1).padStart(2, '0');
        const dd = String(startTimeObj.getDate()).padStart(2, '0');
        const eventDate = `${yyyy}-${mm}-${dd}`;

        return {
            calendar_id: wbcCalendarId,
            name: title,
            event_date: eventDate,
            start_time: startTimeObj.toISOString().split('T')[1].substring(0, 8),
            end_time: endTimeObj.toISOString().split('T')[1].substring(0, 8),
            location: game.stadium || 'TBD',
            type: 'sports',
            category: 'schedule',
            external_resource_id: `naver_wbc_${game.gameId}`,
            memo: JSON.stringify({
                title,
                description: `${game.homeTeamName} vs ${game.awayTeamName}\nStatus: ${game.statusInfo || 'Scheduled'}`,
                region: game.stadium,
                detail_type: 'WBC',
                teams: [game.homeTeamName, game.awayTeamName]
            })
        };
    });

    try {
        console.log(`[Sync WBC] Upserting ${eventsToInsert.length} events to Supabase...`);
        const { data, error } = await supabase
            .from('events')
            .upsert(eventsToInsert, { onConflict: 'calendar_id, external_resource_id' })
            .select();

        if (error) {
            console.error('[Sync WBC] Error during upsert:', error.message);
            return;
        }

        console.log(`[Sync WBC] Successfully upserted ${data?.length || 0} events.`);
    } catch (error) {
        console.error('[Sync WBC] Unexpected error during operation:', error);
    }
}

syncWbcEvents()
    .then(() => {
        console.log('[Sync WBC] WBC sync script completed.');
        process.exit(0);
    })
    .catch((error) => {
        console.error('[Sync WBC] Unhandled Error:', error);
        process.exit(1);
    });
