import { serve } from "std/http/server.ts";
import { createClient } from "supabase";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const TOUR_API_KEY = Deno.env.get("TOUR_API_KEY") ?? "";

const PRIMARY_API_BASE_URL = "https://apis.data.go.kr/B551011/KorService2/searchFestival2";
const BACKUP_API_BASE_URL = "https://apis.data.go.kr/B551011/KorService2/areaBasedList2";

function yyyymmddToIso(raw?: string): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 8) return null;
  const y = digits.slice(0, 4);
  const m = digits.slice(4, 6);
  const d = digits.slice(6, 8);
  return `${y}-${m}-${d}`;
}

function extractRegion(addr: string): string | null {
  if (!addr) return null;
  const match = addr.match(/^(서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주|[가-힣]+도|[가-힣]+시)\b/);
  if (match) {
    const region = match[1];
    const map: Record<string, string> = {
      '서울특별시': '서울', '부산광역시': '부산', '대구광역시': '대구',
      '인천광역시': '인천', '광주광역시': '광주', '대전광역시': '대전',
      '울산광역시': '울산', '세종특별자치시': '세종',
      '경기도': '경기', '강원도': '강원', '강원특별자치도': '강원',
      '충청북도': '충북', '충청남도': '충남',
      '전라북도': '전북', '전북특별자치도': '전북', '전라남도': '전남',
      '경상북도': '경북', '경상남도': '경남',
      '제주특별자치도': '제주', '제주도': '제주'
    };
    return map[region] || region;
  }
  return null;
}

function toArray<T>(value: T | T[] | null | undefined): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

async function fetchWithRetry(url: string, maxRetries = 3): Promise<Response> {
  let lastError: unknown = null;
  for (let i = 0; i < maxRetries; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return res;
      lastError = new Error(`HTTP ${res.status}`);
    } catch (e) {
      lastError = e;
    }
    await new Promise((r) => setTimeout(r, 800 * Math.pow(2, i)));
  }
  throw new Error(`Failed after ${maxRetries} retries: ${String(lastError)}`);
}

async function fetchFestivalItems(eventStartDate: string): Promise<{ source: string; items: any[] }> {
  const common = `serviceKey=${encodeURIComponent(TOUR_API_KEY)}&numOfRows=100&pageNo=1&MobileOS=ETC&MobileApp=HaruClick&_type=json&arrange=A`;

  const candidates: { name: string; url: string }[] = [
    {
      name: "KorService2/searchFestival2",
      url: `${PRIMARY_API_BASE_URL}?${common}&eventStartDate=${eventStartDate}`,
    },
    {
      name: "KorService2/areaBasedList2",
      url: `${BACKUP_API_BASE_URL}?${common}&contentTypeId=15`,
    },
  ];

  for (const candidate of candidates) {
    try {
      console.log(`[API Request] trying ${candidate.name}`);
      const response = await fetchWithRetry(candidate.url);
      const data = await response.json();
      const items = toArray(data?.response?.body?.items?.item);
      if (items.length > 0) {
        return { source: candidate.name, items };
      }
      console.log(`[API Response] ${candidate.name} returned 0 items`);
    } catch (e) {
      console.warn(`[API Fallback] ${candidate.name} failed`, e);
    }
  }

  return { source: "none", items: [] };
}

serve(async () => {
  try {
    console.log("[sync-interest-events] Started gathering festival data...");

    if (!TOUR_API_KEY) {
      throw new Error("Missing TOUR_API_KEY in environment variables.");
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: categories, error: catError } = await supabase
      .from("interest_categories")
      .select("name, target_calendar_id")
      .not("target_calendar_id", "is", null);

    if (catError) {
      throw new Error(`Failed to fetch category mapping: ${catError.message}`);
    }

    const festivalCategory = (categories ?? []).find((c: any) =>
      String(c.name ?? "").includes("축제")
    );
    const calId = festivalCategory?.target_calendar_id;

    if (!calId) {
      console.warn("[Warn] target_calendar_id missing for festival category.");
      return new Response(JSON.stringify({ success: false, message: "Festival calendar mapping missing." }), {
        headers: { "Content-Type": "application/json" },
        status: 200,
      });
    }

    const today = new Date();
    const todayIso = today.toISOString().slice(0, 10);
    const eventStartDate = todayIso.replace(/-/g, "");

    const { source, items } = await fetchFestivalItems(eventStartDate);
    if (items.length === 0) {
      return new Response(JSON.stringify({ success: true, message: "No festival data from primary/backup APIs.", source }), {
        headers: { "Content-Type": "application/json" },
        status: 200,
      });
    }

    const newEvents = items
      .map((festival: any) => {
        const startRaw = String(festival.eventstartdate ?? "");
        const endRaw = String(festival.eventenddate ?? startRaw);
        const startDateStr = yyyymmddToIso(startRaw);
        const endDateStr = yyyymmddToIso(endRaw) ?? startDateStr;

        // Backup API may include non-festival/invalid rows; skip entries without valid start date.
        if (!startDateStr) return null;
        if (startRaw && startRaw < eventStartDate) return null;

        const contentId = String(festival.contentid ?? "");
        const title = String(festival.title ?? "").trim();
        const addr1 = String(festival.addr1 ?? "").trim();
        const addr2 = String(festival.addr2 ?? "").trim();
        const location = [addr1, addr2].filter(Boolean).join(" ");
        const region = extractRegion(addr1) || extractRegion(location);

        if (!title || !contentId) return null;

        return {
          calendar_id: calId,
          name: title,
          event_date: startDateStr,
          start_time: "10:00",
          end_time: "22:00",
          location,
          region,
          detail_type: "festival",
          memo: `축제 기간: ${startDateStr} ~ ${endDateStr}\n행사장소: ${location || "N/A"}\n수집원: ${source}`,
          type: "festival",
          category: "interest",
          external_resource_id: `tourapi_festival_${contentId}`,
        };
      })
      .filter((event: any) => !!event);

    console.log(`[Mapper] Prepared ${newEvents.length} events for UPSERT. source=${source}`);

    const { data: insertedData, error: dbError } = await supabase
      .from("events")
      .upsert(newEvents, { onConflict: "calendar_id,external_resource_id", ignoreDuplicates: false })
      .select("id, name");

    if (dbError) {
      throw new Error(`DB Insert Failed: ${dbError.message}`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Successfully processed ${newEvents.length} festivals.`,
        source,
        inserted: insertedData?.length || 0,
      }),
      {
        headers: { "Content-Type": "application/json" },
        status: 200,
      },
    );
  } catch (error: any) {
    console.error("[sync-interest-events] Fatal Error:", error);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      headers: { "Content-Type": "application/json" },
      status: 500,
    });
  }
});

