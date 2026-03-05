import { serve } from "std/http/server.ts";
import { createClient } from "supabase";
import { parse } from "xml/mod.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const CULTURE_API_KEY = Deno.env.get("CULTURE_API_KEY") ?? "";

const PRIMARY_API_BASE_URL = "https://apis.data.go.kr/B553457/cultureinfo/realm2";
const BACKUP_API_BASE_URL = "https://apis.data.go.kr/B553457/cultureinfo/realmInfo";

type CalendarMapping = {
  performanceCalendarId: string | null;
  exhibitionCalendarId: string | null;
};

function toArray<T>(value: T | T[] | null | undefined): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function yyyymmddToIso(raw?: string): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 8) return null;
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
}

function normalizeTitle(value: string): string {
  let next = value;
  for (let i = 0; i < 3; i++) {
    const prev = next;
    next = next
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, "\"")
      .replace(/&#39;/g, "'");
    if (next === prev) break;
  }
  return next.replace(/\s+/g, " ").trim();
}

function inferIsExhibition(realmName: string): boolean {
  const lowered = realmName.toLowerCase();
  return lowered.includes("전시") || lowered.includes("미술") || lowered.includes("exhibition");
}

function hashString(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) - hash) + input.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(16);
}

async function fetchWithRetry(url: string, maxRetries = 3): Promise<Response> {
  let lastError: unknown = null;
  for (let i = 0; i < maxRetries; i++) {
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 HaruClick/1.0",
        },
      });
      if (res.ok) return res;
      lastError = new Error(`HTTP ${res.status}`);
    } catch (e) {
      lastError = e;
    }
    await new Promise((r) => setTimeout(r, 800 * Math.pow(2, i)));
  }
  throw new Error(`Failed after ${maxRetries} retries: ${String(lastError)}`);
}

function extractCultureItemsFromXml(xmlText: string): { items: any[]; totalCount: number } {
  const document = parse(xmlText) as any;
  const body = document?.response?.body ?? document?.response?.msgBody;
  const totalCount = Number(body?.totalCount ?? 0);
  const rawItems = body?.items?.item ?? body?.perforList;
  return { items: toArray(rawItems), totalCount };
}

async function fetchCultureApiItems(fromYmd: string): Promise<{ source: string; items: any[] }> {
  const numOfRows = 100;
  const maxPages = 5;
  const baseUrls = [PRIMARY_API_BASE_URL, BACKUP_API_BASE_URL];

  for (const baseUrl of baseUrls) {
    const collected: any[] = [];
    let pageNo = 1;
    let done = false;

    try {
      while (!done && pageNo <= maxPages) {
        const url = `${baseUrl}?ServiceKey=${encodeURIComponent(CULTURE_API_KEY)}&from=${fromYmd}&cPage=${pageNo}&rows=${numOfRows}`;
        console.log(`[Culture API] ${baseUrl} page=${pageNo}`);
        const response = await fetchWithRetry(url);
        const xmlText = await response.text();
        const { items, totalCount } = extractCultureItemsFromXml(xmlText);

        if (!items.length) {
          break;
        }

        collected.push(...items);

        if (items.length < numOfRows || (totalCount > 0 && collected.length >= totalCount)) {
          done = true;
        } else {
          pageNo++;
        }
      }

      if (collected.length > 0) {
        return { source: baseUrl, items: collected };
      }
    } catch (e) {
      console.warn(`[Culture API Fallback] failed from ${baseUrl}`, e);
    }
  }

  return { source: "none", items: [] };
}

function extractInterparkCardsFromJson(data: any): any[] {
  const results: any[] = [];

  const walk = (node: any) => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      for (const item of node) walk(item);
      return;
    }

    if (typeof node.title === "string" && typeof node.startDate === "string") {
      results.push(node);
    }

    for (const key of Object.keys(node)) {
      walk(node[key]);
    }
  };

  walk(data);
  return results;
}

async function scrapeInterparkFallback(mapping: CalendarMapping, fromYmd: string): Promise<any[]> {
  const targets: Array<{ name: string; url: string; type: "exhibition" | "performance"; calendarId: string | null }> = [
    {
      name: "interpark_exhibition",
      url: "https://tickets.interpark.com/contents/genre/exhibition",
      type: "exhibition",
      calendarId: mapping.exhibitionCalendarId,
    },
    {
      name: "interpark_musical",
      url: "https://tickets.interpark.com/contents/genre/musical",
      type: "performance",
      calendarId: mapping.performanceCalendarId,
    },
    {
      name: "interpark_concert",
      url: "https://tickets.interpark.com/contents/genre/concert",
      type: "performance",
      calendarId: mapping.performanceCalendarId,
    },
  ];

  const dedup = new Map<string, any>();

  for (const target of targets) {
    if (!target.calendarId) continue;

    try {
      console.log(`[Scrape Fallback] fetching ${target.url}`);
      const response = await fetchWithRetry(target.url);
      const html = await response.text();
      const nextDataMatch = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
      if (!nextDataMatch) {
        console.log(`[Scrape Fallback] __NEXT_DATA__ not found for ${target.name}`);
        continue;
      }

      const nextData = JSON.parse(nextDataMatch[1]);
      const cards = extractInterparkCardsFromJson(nextData);

      for (const card of cards) {
        const rawTitle = normalizeTitle(String(card.title ?? ""));
        if (!rawTitle || rawTitle === "제목") continue;

        const rawStart = String(card.startDate ?? card.playStartDate ?? "");
        const startIso = yyyymmddToIso(rawStart);
        if (!startIso) continue;

        const ymd = rawStart.replace(/\D/g, "").slice(0, 8);
        if (ymd < fromYmd) continue;

        const contentKey = String(card.goodsCode ?? card.link ?? `${rawTitle}_${ymd}`);
        const externalId = `interpark_${hashString(contentKey)}`;
        const location = normalizeTitle(String(card.placeName ?? ""));

        const startHour = rawStart.replace(/\D/g, "").slice(8, 10);
        const startMinute = rawStart.replace(/\D/g, "").slice(10, 12);
        const hasTime = /^\d{2}$/.test(startHour) && /^\d{2}$/.test(startMinute);
        const defaultStart = target.type === "exhibition" ? "10:00" : "19:00";
        const startTime = hasTime ? `${startHour}:${startMinute}` : defaultStart;

        dedup.set(externalId, {
          calendar_id: target.calendarId,
          name: rawTitle,
          event_date: startIso,
          start_time: startTime,
          end_time: target.type === "exhibition" ? "20:00" : "22:00",
          location,
          memo: `수집원: ${target.name} (scrape fallback)\n링크: ${String(card.link ?? "")}`,
          type: target.type,
          category: "schedule",
          external_resource_id: externalId,
        });
      }
    } catch (e) {
      console.warn(`[Scrape Fallback] failed on ${target.name}`, e);
    }
  }

  return [...dedup.values()];
}

function resolveCalendarMapping(categories: any[]): CalendarMapping {
  const performance = categories.find((c: any) => {
    const name = String(c.name ?? "");
    const lower = name.toLowerCase();
    return name.includes("공연") || lower.includes("performance");
  })?.target_calendar_id ?? null;

  const exhibition = categories.find((c: any) => {
    const name = String(c.name ?? "");
    const lower = name.toLowerCase();
    return name.includes("전시") || lower.includes("exhibition");
  })?.target_calendar_id ?? null;

  return {
    performanceCalendarId: performance,
    exhibitionCalendarId: exhibition,
  };
}

serve(async () => {
  try {
    console.log("[sync-culture-events] Started gathering culture data...");
    if (!CULTURE_API_KEY) {
      throw new Error("Missing CULTURE_API_KEY in environment variables.");
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: categories, error: catError } = await supabase
      .from("interest_categories")
      .select("name, target_calendar_id")
      .not("target_calendar_id", "is", null);

    if (catError) {
      throw new Error(`Failed to fetch category mapping: ${catError.message}`);
    }

    const mapping = resolveCalendarMapping(categories ?? []);
    if (!mapping.performanceCalendarId && !mapping.exhibitionCalendarId) {
      throw new Error("target_calendar_id missing for both performance and exhibition categories.");
    }

    const fromYmd = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const todayIso = new Date().toISOString().slice(0, 10);

    const { source: apiSource, items: apiItems } = await fetchCultureApiItems(fromYmd);

    let newEvents: any[] = [];
    let sourceLabel = apiSource;

    if (apiItems.length > 0) {
      newEvents = apiItems
        .map((item: any) => {
          const realmName = normalizeTitle(String(item.realmName ?? item.serviceName ?? ""));
          const isExhibition = inferIsExhibition(realmName);
          const calendarId = isExhibition ? mapping.exhibitionCalendarId : mapping.performanceCalendarId;
          if (!calendarId) return null;

          const title = normalizeTitle(String(item.title ?? ""));
          if (!title) return null;

          const startIso = yyyymmddToIso(String(item.startDate ?? "")) ?? todayIso;
          const endIso = yyyymmddToIso(String(item.endDate ?? "")) ?? startIso;
          const place = normalizeTitle(String(item.place ?? ""));
          const seq = String(item.seq ?? `${title}_${startIso}`);

          return {
            calendar_id: calendarId,
            name: title,
            event_date: startIso,
            start_time: "10:00",
            end_time: "21:00",
            location: place,
            memo: `형태: ${realmName || "문화행사"}\n기간: ${startIso} ~ ${endIso}\n장소: ${place || "N/A"}\n수집원: ${apiSource}`,
            type: isExhibition ? "exhibition" : "performance",
            category: "schedule",
            external_resource_id: `culture_portal_${seq}`,
          };
        })
        .filter((event: any) => !!event);
    } else {
      console.warn("[sync-culture-events] API sources empty. Switching to scrape fallback.");
      newEvents = await scrapeInterparkFallback(mapping, fromYmd);
      sourceLabel = "interpark_scrape_fallback";
    }

    if (newEvents.length === 0) {
      return new Response(JSON.stringify({ success: true, message: "No culture data found from API and fallback.", source: sourceLabel }), {
        headers: { "Content-Type": "application/json" },
        status: 200,
      });
    }

    console.log(`[Mapper] Prepared ${newEvents.length} events for UPSERT. source=${sourceLabel}`);

    const { data: insertedData, error: dbError } = await supabase
      .from("events")
      .upsert(newEvents, { onConflict: "calendar_id,external_resource_id", ignoreDuplicates: false })
      .select("id, name");

    if (dbError) {
      throw new Error(`DB Insert Failed: ${dbError.message}`);
    }

    return new Response(JSON.stringify({
      success: true,
      message: `Successfully processed ${newEvents.length} culture events.`,
      source: sourceLabel,
      inserted: insertedData?.length || 0,
    }), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error: any) {
    console.error("[sync-culture-events] Fatal Error:", error);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      headers: { "Content-Type": "application/json" },
      status: 500,
    });
  }
});

