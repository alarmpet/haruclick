/**
 * sync-policies.mjs
 * 정부지원금·복지 정책 일정 수집 스크립트 (비용 ₩0)
 *
 * 데이터 소스:
 *   1) 한국사회보장정보원 중앙부처복지서비스 API (공공데이터포털)
 *      Endpoint: https://apis.data.go.kr/B554287/NationalWelfareInformationsV001
 *      Format: XML
 *   2) 한국사회보장정보원 지자체복지서비스 API (공공데이터포털)
 *      Endpoint: https://apis.data.go.kr/B554287/LocalGovernmentWelfareInformations
 *      Format: XML
 *   3) 온통청년 OpenAPI (한국고용정보원) — 청년 특화 정책
 *      Endpoint: https://www.youthcenter.go.kr/opi/youthPlcyList.do
 *      Format: JSON
 *
 * 실행: node scripts/sync-policies.mjs
 */

import { createClient } from '@supabase/supabase-js';

// ============================================================
// 환경 변수
// ============================================================
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://brsouceosomykgloouiu.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const BOKJIRO_API_KEY = process.env.BOKJIRO_API_KEY || '0d5c0817338279ae29455c6494e581285ae5e02454e7c40494ca2f61d69c76e8';  // 복지로 API 키
const YOUTH_API_KEY = process.env.YOUTH_API_KEY || '';       // 온통청년 (별도 발급 필요)

// 복지로 Real Endpoints (공공데이터포털 승인키로 접근)
// V2 API는 리스트 조회 엔드포인트명과 파라미터(srchKeyCode)가 다릅니다.
const BOKJIRO_NATIONAL_URL = 'https://apis.data.go.kr/B554287/NationalWelfareInformationsV001/NationalWelfarelistV001';
const BOKJIRO_LOCAL_URL = 'https://apis.data.go.kr/B554287/LocalGovernmentWelfareInformations/LcgvWelfarelist';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const TODAY = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().split('T')[0];

// ============================================================
// 유틸리티
// ============================================================
function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

async function fetchWithRetry(url, maxRetries = 2) {
    for (let i = 0; i <= maxRetries; i++) {
        try {
            const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
            const text = await res.text();
            if (res.ok) return text;

            throw new Error(`HTTP ${res.status} - ${text.slice(0, 100)}`);
        } catch (e) {
            if (i === maxRetries) throw e;
            console.log(`  ⏳ 재시도 ${i + 1}/${maxRetries}... (${e.message})`);
            await sleep(2000 * (i + 1));
        }
    }
}

/** XML에서 특정 태그 값을 문자열로 추출 */
function extractXml(xml, tag) {
    const match = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)<\/${tag}>`));
    return match ? match[1].trim().replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>') : '';
}

/** XML 반복 <item> 목록을 객체 배열로 파싱 (원하는 리스트 태그명 사용) */
function parseXmlItems(xml, listTag = 'servList') {
    const items = [];
    const itemMatches = xml.matchAll(new RegExp(`<${listTag}>([\\s\\S]*?)<\/${listTag}>`, 'g'));
    for (const match of itemMatches) {
        const block = match[1];
        // 모든 태그를 key-value 쌍으로 파싱
        const obj = {};
        const tags = block.matchAll(/<([a-zA-Z0-9_]+)>([\s\S]*?)<\/\1>/g);
        for (const t of tags) {
            obj[t[1]] = t[2].trim().replace(/&amp;/g, '&');
        }
        items.push(obj);
    }
    return items;
}

async function getPolicyCategoryCalendarId(nameContains) {
    const { data } = await supabase
        .from('interest_categories')
        .select('name, target_calendar_id')
        .ilike('name', `%${nameContains}%`)
        .not('target_calendar_id', 'is', null)
        .limit(1)
        .single();
    if (!data?.target_calendar_id) {
        console.warn(`  ⚠️ '${nameContains}' 카테고리 캘린더 ID 없음`);
        return null;
    }
    return data.target_calendar_id;
}

async function upsertPolicies(events, calendarId, sourceName) {
    if (!events.length || !calendarId) {
        console.log(`  ⚠️ ${sourceName}: 건너뜀`);
        return 0;
    }

    // 중복 제거 (여러 생애주기에 동시 속하는 정책으로 인한 'cannot affect row a second time' 에러 방지)
    const uniqueEvents = Array.from(new Map(events.map(e => [e.external_resource_id, e])).values());

    const { error } = await supabase.from('events').upsert(uniqueEvents, {
        onConflict: 'calendar_id,external_resource_id'
    });
    if (error) { console.error(`  ❌ ${sourceName} DB 오류:`, error.message); return 0; }
    console.log(`  ✅ ${sourceName}: ${uniqueEvents.length}건 저장 (중복제거 전 ${events.length}건)`);
    return uniqueEvents.length;
}

// ============================================================
// SOURCE 1: 복지로 중앙부처 복지서비스 (노인/육아 정책)
// ============================================================
async function syncBokjiroNational(targetGroup, calIdHint, lifeArray) {
    console.log(`\n🏛️ [복지로-중앙부처] ${targetGroup} 정책 수집 시작...`);
    if (!BOKJIRO_API_KEY) { console.warn('  ⚠️ BOKJIRO_API_KEY 없음'); return 0; }

    const calId = await getPolicyCategoryCalendarId(calIdHint);
    if (!calId) return 0;

    let allItems = [];
    for (const lifeNmArray of lifeArray) {
        const params = new URLSearchParams({
            serviceKey: BOKJIRO_API_KEY,
            callTp: 'L',       // 목록 조회
            pageNo: '1',
            numOfRows: '50',
            srchKeyCode: '001', // 검색 시 필수
            lifeArray: lifeNmArray,  // 생애주기 코드 (노인=0009, 영유아=0001, 임신=0006)
        });
        const url = `${BOKJIRO_NATIONAL_URL}?${params.toString()}`;
        try {
            const xml = await fetchWithRetry(url);
            const items = parseXmlItems(xml, 'servList');
            console.log(`  🔍 [${lifeNmArray}] ${items.length}건`);
            allItems = allItems.concat(items);
        } catch (e) {
            console.warn(`  ⚠️ 복지로 중앙부처(${lifeNmArray}) 실패: ${e.message}`);
        }
    }

    const events = allItems
        .filter(p => p.servNm)
        .map(p => ({
            calendar_id: calId,
            name: p.servNm?.slice(0, 100) || `${targetGroup} 복지 서비스`,
            event_date: TODAY,
            start_time: '09:00',
            end_time: '18:00',
            location: p.jurMnofNm || p.intrcnMlstnDd || '전국',
            memo: [
                p.servDgst?.slice(0, 200) && `📌 ${p.servDgst.slice(0, 200)}`,
                p.tgtrDsc && `👥 대상: ${p.tgtrDsc}`,
                p.srvUrl && `🔗 ${p.srvUrl}`,
            ].filter(Boolean).join('\n'),
            type: 'policy',
            category: 'interest',
            external_resource_id: `bokjiro_nat_${p.servId || p.servNm?.slice(0, 20)}`,
        }));

    return await upsertPolicies(events, calId, `복지로-${targetGroup}`);
}

// ============================================================
// SOURCE 2: 복지로 지자체 복지서비스
// ============================================================
async function syncBokjiroLocal(targetGroup, calIdHint, lifeArray) {
    console.log(`\n🏙️ [복지로-지자체] ${targetGroup} 정책 수집 시작...`);
    if (!BOKJIRO_API_KEY) { console.warn('  ⚠️ BOKJIRO_API_KEY 없음'); return 0; }

    const calId = await getPolicyCategoryCalendarId(calIdHint);
    if (!calId) return 0;

    let allItems = [];
    for (const lifeNmArray of lifeArray) {
        const params = new URLSearchParams({
            serviceKey: BOKJIRO_API_KEY,
            callTp: 'L',
            pageNo: '1',
            numOfRows: '30',
            srchKeyCode: '001',
            lifeArray: lifeNmArray,
        });
        const url = `${BOKJIRO_LOCAL_URL}?${params.toString()}`;
        try {
            const xml = await fetchWithRetry(url);
            const items = parseXmlItems(xml, 'servList');
            console.log(`  🔍 [지자체-${lifeNmArray}] ${items.length}건`);
            allItems = allItems.concat(items);
        } catch (e) {
            console.warn(`  ⚠️ 복지로 지자체(${lifeNmArray}) 실패: ${e.message}`);
        }
    }

    const events = allItems
        .filter(p => p.servNm)
        .map(p => ({
            calendar_id: calId,
            name: `[지자체] ${p.servNm?.slice(0, 97)}`,
            event_date: TODAY,
            start_time: '09:00',
            end_time: '18:00',
            location: p.ctpvNm ? `${p.ctpvNm} ${p.signguNm || ''}`.trim() : '지자체',
            memo: [
                p.servDgst?.slice(0, 200) && `📌 ${p.servDgst.slice(0, 200)}`,
                p.tgtrDsc && `👥 대상: ${p.tgtrDsc}`,
            ].filter(Boolean).join('\n'),
            type: 'policy',
            category: 'interest',
            external_resource_id: `bokjiro_local_${p.servId || p.servNm?.slice(0, 20)}`,
        }));

    return await upsertPolicies(events, calId, `복지로-지자체-${targetGroup}`);
}

// ============================================================
// SOURCE 3: 온통청년 OpenAPI (청년 정책)
// ============================================================
async function syncYouthPolicies(calIdHint) {
    console.log('\n👨‍🎓 [온통청년] 청년 정책 수집 시작...');
    if (!YOUTH_API_KEY) { console.warn('  ⚠️ YOUTH_API_KEY 없음 → 건너뜀'); return 0; }

    const calId = await getPolicyCategoryCalendarId(calIdHint);
    if (!calId) return 0;

    const params = new URLSearchParams({
        openApiVlak: YOUTH_API_KEY,
        pageIndex: '1',
        pageSize: '100',
        displayJsonYn: 'Y',
    });
    let allPolicies = [];
    try {
        const text = await fetchWithRetry(`https://www.youthcenter.go.kr/opi/youthPlcyList.do?${params}`);
        const json = JSON.parse(text);
        allPolicies = json?.youthPolicy?.youthPolicyList || [];
        console.log(`  🔍 조회된 정책: ${allPolicies.length}건`);
    } catch (e) {
        console.warn(`  ⚠️ 온통청년 API 실패: ${e.message}`);
        return 0;
    }

    const events = allPolicies
        .filter(p => p.rqutPrdSe === '상시' || (p.rqutEndDe && p.rqutEndDe >= TODAY.replace(/-/g, '')))
        .map(p => {
            const startRaw = p.rqutStrtDe;
            const startDate = (startRaw && startRaw.length >= 8)
                ? `${startRaw.slice(0, 4)}-${startRaw.slice(4, 6)}-${startRaw.slice(6, 8)}`
                : TODAY;
            const endRaw = p.rqutEndDe;
            const endLabel = (endRaw && endRaw.length >= 8)
                ? `~${endRaw.slice(0, 4)}-${endRaw.slice(4, 6)}-${endRaw.slice(6, 8)}`
                : '상시';
            return {
                calendar_id: calId,
                name: p.polyBizSjnm?.slice(0, 100) || '청년 지원 정책',
                event_date: startDate,
                start_time: '09:00',
                end_time: '18:00',
                location: p.cnsgNmor || '전국',
                memo: [
                    `📝 신청: ${endLabel}`,
                    p.bizPrdCn && `📅 기간: ${p.bizPrdCn}`,
                    p.plyBizUrl && `🔗 ${p.plyBizUrl}`,
                ].filter(Boolean).join('\n'),
                type: 'policy',
                category: 'interest',
                external_resource_id: `youth_${p.bizId || p.polyBizSjnm?.slice(0, 20)}`,
            };
        });

    return await upsertPolicies(events, calId, '온통청년');
}

// ============================================================
// MAIN
// ============================================================
async function main() {
    console.log('=== 🏛️ 정부지원 정책 일정 수집 시작 ===');
    console.log(`📅 기준일: ${TODAY}\n`);

    let total = 0;

    // 온통청년은 고용노동부(중앙부처) 소관이므로 중앙부처 캘린더로 분류합니다.
    total += await syncYouthPolicies('중앙부처');

    // 복지로 중앙부처 — 노인 (006), 출산육아 (001, 007)
    total += await syncBokjiroNational('노인', '중앙부처', ['006']);
    total += await syncBokjiroNational('출산육아', '중앙부처', ['001', '007']);

    // 복지로 지자체 — 노인 (006), 출산육아 (001, 007)
    total += await syncBokjiroLocal('노인', '지자체', ['006']);
    total += await syncBokjiroLocal('출산육아', '지자체', ['001', '007']);

    console.log(`\n=== 🎉 완료! 총 ${total}건 저장 ===`);
}

main().catch(console.error);
