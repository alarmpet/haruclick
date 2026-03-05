import { serve } from "std/http/server.ts";
import { createClient } from "supabase";

// 환경 변수 설정
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
// 발급된 일반 인증키 적용 (환경변수 없을 시 Fallback)
const TOUR_API_KEY = Deno.env.get("TOUR_API_KEY") ?? "0d5c0817338279ae29455c6494e581285ae5e02454e7c40494ca2f61d69c76e8";

// 국문 관광정보 서비스 GW API (KorService1/2) 엔드포인트
const API_BASE_URL = "https://apis.data.go.kr/B551011/KorService2/searchFestival1";

serve(async (req) => {
    try {
        console.log("[sync-interest-events] Started gathering festival data...");

        // 1. Supabase Admin 클라이언트 생성 (RLS 우회)
        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

        // --- Fetch target calendar ID from database (Issue #4) ---
        const { data: categories, error: catError } = await supabase
            .from('interest_categories')
            .select('target_calendar_id')
            .eq('name', '지역 축제')
            .single();

        if (catError) {
            throw new Error(`Failed to fetch category mapping: ${catError.message}`);
        }

        const calId = categories?.target_calendar_id;
        if (!calId) {
            console.warn('[Warn] target_calendar_id missing for 지역 축제.');
        }

        // 2. 한국관광공사 지역축제 API 데이터 요청
        const today = new Date();
        const eventStartDate = today.toISOString().slice(0, 10).replace(/-/g, ""); // YYYYMMDD

        // 행사정보조회 URL 구성
        const apiReqUrl = `${API_BASE_URL}?serviceKey=${TOUR_API_KEY}&numOfRows=50&pageNo=1&MobileOS=ETC&MobileApp=HaruClick&_type=json&arrange=A&eventStartDate=${eventStartDate}`;

        console.log(`[API Request] fetching from ${API_BASE_URL}...`);
        const response = await fetch(apiReqUrl);

        if (!response.ok) {
            throw new Error(`API returned HTTP ${response.status}`);
        }

        const data = await response.json();
        const items = data?.response?.body?.items?.item || [];

        if (!items || items.length === 0) {
            return new Response(JSON.stringify({ message: "No festival data found for today." }), {
                headers: { "Content-Type": "application/json" },
                status: 200,
            });
        }

        // 3. API 응답 데이터를 EventRecord 형태(DB Scheme)로 변환
        const newEvents = items.map((festival: any) => {
            // API 응답 필드: title (제목), eventstartdate (시작일), eventenddate (종료일), addr1 (주소), contentid (고유ID)
            // date 변환 (YYYYMMDD -> YYYY-MM-DD)
            const startDateStr = festival.eventstartdate.replace(/(\d{4})(\d{2})(\d{2})/, "$1-$2-$3");
            const endDateStr = festival.eventenddate.replace(/(\d{4})(\d{2})(\d{2})/, "$1-$2-$3");

            return {
                calendar_id: calId,
                name: festival.title,
                event_date: startDateStr, // 시작일을 기본 캘린더 배치일로 사용
                start_time: '10:00', // 축제는 대략적 오전 10시로 임의 지정
                end_time: '22:00',
                location: festival.addr1 || '',
                memo: `축제 기간: ${startDateStr} ~ ${endDateStr}\n행사장소: ${festival.addr1}`,
                type: 'festival',
                category: 'schedule',
                // 중복 방지를 위한 고유 ID (크롤러 식별자)
                external_resource_id: `tourapi_festival_${festival.contentid}`
            };
        }).filter((event: any) => !!event.calendar_id);

        console.log(`[Mapper] Prepared ${newEvents.length} events for UPSERT.`);

        // 4. Supabase UPSERT (external_resource_id 기준 충돌 처리 - Issue #1 복합키 버그 수정)
        const { data: insertedData, error: dbError } = await supabase
            .from('events')
            .upsert(newEvents, { onConflict: 'calendar_id,external_resource_id', ignoreDuplicates: false })
            .select('id, name');

        if (dbError) {
            console.error("[DB Error]", dbError);
            throw new Error(`DB Insert Failed: ${dbError.message}`);
        }

        return new Response(JSON.stringify({
            success: true,
            message: `Successfully processed ${newEvents.length} festivals.`,
            result: insertedData
        }), {
            headers: { "Content-Type": "application/json" },
            status: 200,
        });

    } catch (error: any) {
        console.error("[sync-interest-events] Fatal Error:", error);
        return new Response(JSON.stringify({ success: false, error: error.message }), {
            headers: { "Content-Type": "application/json" },
            status: 500,
        });
    }
});
