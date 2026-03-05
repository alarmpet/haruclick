# 스포츠 일정 수집 계획서 (SPORTS_DATA_INTEGRATION_PLAN)

> **작성일**: 2026-03-04
> **claude.md 사전 검증 완료**: ✅ research.md, supabase/ 스키마, 기존 Edge Function, GitHub Actions 패턴 교차 검증 완료

---

## 1. 목적

관심 캘린더에 **스포츠 리그 경기 일정**(KBO, EPL, K리그, MLB, NBA 등)과 **글로벌 대회**(FIFA 월드컵 2026, LA 올림픽 2028)를 자동으로 수집하여 표시한다.
사용자가 해당 스포츠 카테고리를 구독하면 캘린더에 경기 일정이 자동 추가되고, 기존 `active_filters`(지역/세부유형) 시스템과 연동하여 관심 팀만 필터링할 수 있도록 한다.

---

## 2. 사전 검증 결과 (claude.md §1)

### 2.1 research.md 교차 검증
- 기존 아키텍처: `Edge Function` + `GitHub Actions` + `Playwright Scraping` 파이프라인이 이미 운영 중
- 비용 효율성 철학: `무료 API → 스크래핑 → AI 파싱` 순서 (AI 최후의 수단)
- `DATA_COLLECTION_ALTERNATIVES_PLAN.md`의 API-First 권장 정책과 부합

### 2.2 Supabase 스키마 검증
- `events` 테이블: `region`, `detail_type`, `external_resource_id` 이미 존재 → 스포츠에 재활용 가능
- `interest_categories` 테이블: 새 스포츠 카테고리 행 추가만 필요 (스키마 변경 없음)
- `user_interest_subscriptions.active_filters`: 팀 필터용으로 확장 가능 (`teams?: string[]`)
- **RLS 변경 불필요**: 기존 정책이 모든 authenticated 사용자에게 카테고리 읽기를 허용하므로 새 카테고리 추가만으로 충분

### 2.3 기존 수집 파이프라인 검증
| 기존 경로 | 역할 | 스포츠 적용 |
|-----------|------|-------------|
| `sync-interest-events` (Edge Function) | TourAPI 축제 수집 | 별도 Edge Function 필요 |
| `sync-culture-events` (Edge Function) | 문화행사/스크래핑 수집 | 별도 Edge Function 필요 |
| `sync-events.yml` (GitHub Actions) | Playwright + Cheerio 스크래핑 | **KBO 스크래핑에 재활용** |
| `scrape-events-v2.mjs` (Node Script) | 통합 스크래퍼 v2 | 스포츠 스크래퍼 추가 가능 |

---

## 3. 데이터 소스 분석

### 3.1 해외 축구 (EPL, 라리가, 분데스리가 등)

| API | 무료 범위 | 비용 | 적합성 |
|-----|-----------|------|--------|
| **football-data.org** ⭐ | EPL, 라리가, 분데스, 세리에A, 리그앙 등 12개 리그 | **완전 무료** (10 req/min) | ✅ 최우선 |
| TheSportsDB | 다양한 리그 | 무료 (제한적) | ⭐ 백업 |
| OpenLigaDB | 주로 분데스리가 | 무료 | 보조용 |
| football.json (GitHub) | JSON 정적 데이터 | 무료 | 시즌 초 일괄 로드용 |

> **🏆 권장**: `football-data.org` Free Tier를 1차 소스로 사용
> - 무료 API Key 발급 (이메일만 필요)
> - 10 req/min 제한이지만 경기 일정 수집은 주 2회면 충분
> - EPL (PL), 라리가 (PD), 분데스리가 (BL1), 세리에A (SA), 리그앙 (FL1), 챔피언스리그 (CL) 등 지원

### 3.2 KBO (한국 프로야구)

| 방법 | 설명 | 비용 | 적합성 |
|------|------|------|--------|
| **KBO 공식 사이트 스크래핑** ⭐ | `koreabaseball.com` 경기 일정 페이지 | **$0** (GitHub Actions) | ✅ 유일한 방법 |
| Naver 스포츠 스크래핑 | `sports.naver.com` | $0 | 백업 |
| StatCast/NAVER API | 비공개 | N/A | ❌ 불가 |

> **⚠️ KBO는 공식 무료 API가 없음** → `GitHub Actions + Playwright` 스크래핑이 유일한 합법적 방법
> - `robots.txt` 준수 필수
> - 기존 `sync-events.yml` 워크플로우 패턴 재활용

### 3.3 K리그 (한국 프로축구)

| 방법 | 설명 | 비용 | 적합성 |
|------|------|------|--------|
| **football-data.org** | K리그1 미지원 😢 | - | ❌ |
| **K리그 공식 사이트 스크래핑** ⭐ | `kleague.com` 일정 페이지 | **$0** | ✅ |
| fixtur.es iCal 구독 | K리그 캘린더 구독 URL | $0 | 보조 (iCal 파싱) |

### 3.4 MLB (메이저리그 야구) 🆕

| API | 설명 | 비용 | 적합성 |
|-----|------|------|--------|
| **MLB Stats API** ⭐ | `statsapi.mlb.com` (비공식이지만 공개) | **$0** | ✅ 최우선 |
| BALLDONTLIE MLB | 경기, 순위, 통계 | 무료 tier | ⭐ 백업 |
| API-Sports Baseball | 100 req/day 무료 | $0 (제한적) | 보조 |

> **🏆 권장**: `statsapi.mlb.com` 비공식 API (API Key 불필요!)
> - 엔드포인트: `https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=YYYY-MM-DD`
> - 무료, 인증 불필요, JSON 응답
> - 시즌 일정, 실시간 스코어, 팀/선수 데이터 모두 제공

### 3.5 NBA (프로농구) 🆕

| API | 설명 | 비용 | 적합성 |
|-----|------|------|--------|
| **BALLDONTLIE NBA** ⭐ | 1946~현재 시즌, 경기/팀/통계 | **무료 tier** (API Key 필요) | ✅ 최우선 |
| NBA Stats (nba.com) | 비공식 엔드포인트 | $0 | 불안정, 백업용 |

> **🏆 권장**: `balldontlie.io` NBA API
> - 무료 계정 생성 후 API Key 발급
> - 엔드포인트: `https://api.balldontlie.io/v1/games?dates[]=YYYY-MM-DD`
> - JS/Python SDK 제공

### 3.6 FIFA 월드컵 2026 🆕 (이벤트 기반)

| API | 설명 | 비용 | 적합성 |
|-----|------|------|--------|
| **WC2026 API** ⭐ | 104경기 전체, 그룹 순위, 경기장 | **무료** (10K req/day) | ✅ 최우선 |
| BALLDONTLIE WC | 팀, 경기, 배당 | 무료 tier | 백업 |
| football-data.org WC | 월드컵 데이터 | 무료 | 보조 |

> **🏆 권장**: `wc2026api.com` (2026 월드컵 전용)
> - 무료 플랜: 10,000 req/day, 모든 엔드포인트 사용 가능
> - 2026/06~07 대회 기간에만 활성화하면 됨 → 시즌성 수집
> - 미국/캐나다/멕시코 16개 도시에서 개최

### 3.7 LA 올림픽 2028 🆕 (이벤트 기반)

| 방법 | 설명 | 비용 | 적합성 |
|------|------|------|--------|
| **olympics.com 스크래핑** ⭐ | 공식 일정 페이지 | **$0** | ✅ |
| LA28 공식 사이트 | 상세 종목/날짜 | $0 | 보조 |
| fixtur.es iCal | 올림픽 캘린더 구독 | $0 | iCal 파싱 |

> **⚠️ 올림픽은 전용 무료 API 없음** → 공식 사이트 스크래핑 또는 정적 JSON 수동 입력
> - 2028/07/14~07/30 기간 한정 → 1회성 데이터 시딩으로 처리 가능
> - 대회 확정 일정 발표 후 JSON으로 일괄 입력하는 것이 가장 안정적

---

## 4. 아키텍처 설계

### 4.1 수집 계층 구조

```
┌──────────────────────────────────────────────────────────────────┐
│                GitHub Actions (주 2회 스케줄)                      │
│                                                                  │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌───────────────┐  │
│  │football-   │ │MLB Stats   │ │BALLDONTLIE │ │ KBO/K리그     │  │
│  │data.org API│ │API (무료)  │ │NBA API     │ │ (Playwright)  │  │
│  │(EPL,LaLiga)│ │(statsapi)  │ │(balldontlie│ │               │  │
│  │            │ │            │ │.io)        │ │               │  │
│  └─────┬──────┘ └─────┬──────┘ └─────┬──────┘ └───────┬───────┘  │
│        └───────────┬──┘              │                │          │
│                    ▼                 ▼                ▼          │
│           ┌──────────────────────────────────────┐               │
│           │ Supabase categories 에서 calendar_id 조회 │               │
│           │                  ▼                   │               │
│           │     Supabase events 테이블 (UPSERT)   │               │
│           └──────────────────────────────────────┘               │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │ 시즌성 이벤트 (별도 트리거 또는 수동)                          │ │
│  │  • 월드컵 2026: wc2026api.com (대회 기간만)                   │ │
│  │  • 올림픽 2028: 정적 JSON 시딩 (1회성)                        │ │
│  └─────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────┘
```

### 4.2 데이터 적재 정합성 (claude.md §3 스키마 규약 반경)

`events` 테이블은 유니크 제약조건으로 `(external_resource_id, calendar_id)` 복합 키를 사용합니다. 따라서 단순 UPSERT 시 대상 캘린더 ID를 정확히 매핑해야 합니다.

1. 수집 스크립트 실행 시 `interest_categories` 테이블을 먼저 조회하여 각 종목(KBO, EPL 등)의 `target_calendar_id`를 캐싱합니다.
2. 수집된 일정 데이터에 매핑된 `calendar_id`를 포함하여 UPSERT 로직을 구성합니다.
3. **타임아웃 적용 (claude.md §3.3)**: 모든 외부 API 호출(football-data, MLB 등)에는 `AbortController`를 사용하여 8000ms 명시적 타임아웃을 적용해 무한 대기를 방지합니다.

### 4.3 왜 GitHub Actions인가? (vs Edge Function, MCP, Skills)

| 옵션 | 장점 | 단점 | 판정 |
|------|------|------|------|
| **GitHub Actions** ⭐ | $0 비용, Playwright 내장, cron 지원, 기존 패턴 존재 | cold start | ✅ **채택** |
| Supabase Edge Function | 서버리스, 항상 따뜻함 | Deno에서 Playwright 불가, 외부 API 제한 | ⚠️ API 전용만 가능 |
| MCP Server | 실시간 조회 | 상시 서버 필요, 비용 | ❌ 과도 |
| Skills | 개발 도구 도움 | 데이터 수집용이 아님 | ❌ 목적 불일치 |

**결론**: 
- **API 기반 수집 (football-data.org, MLB Stats API, BALLDONTLIE NBA)** → `GitHub Actions` Node 스크립트
- **스크래핑 기반 수집 (KBO, K리그)** → `GitHub Actions + Playwright` (기존 `sync-events.yml` 확장)
- **시즌성 이벤트 (월드컵, 올림픽)** → 대회 기간 한정 별도 워크플로우 또는 정적 JSON 시딩
- **Edge Function**: 스포츠는 사용하지 않음 (Deno에서 Playwright 불가, 무료 API는 Node 스크립트로 충분)

### 4.4 active_filters 확장 (팀 필터)

기존 `active_filters` JSONB 구조에 `teams` 배열을 추가:

```jsonc
// user_interest_subscriptions.active_filters 예시
{
  "regions": ["서울"],         // 기존 (축제/공연용)
  "detail_types": ["festival"], // 기존
  "teams": ["두산", "LG"]      // 신규 — 스포츠용 팀 필터
}
```

- `teams` 미설정 또는 빈 배열 → 모든 경기 표시 (기존 동작 유지)
- `teams` 설정 시 → 해당 팀이 포함된 경기만 캘린더에 표시
- **스키마 변경 불필요**: `active_filters`는 이미 JSONB이므로 자유 확장

---

## 5. 구현 상세

### 5.1 Phase 1: 해외 축구 (football-data.org API)

#### [NEW] `scripts/sync-sports-football.mjs`
- football-data.org Free API로 리그별 향후 30일 경기 일정 가져오기
- 응답을 `events` 테이블 형식으로 변환
- `external_resource_id`: `football_data_{competition}_{matchId}` 형식
- `region`: 리그 국가 (예: "England", "Spain")
- `detail_type`: 리그 코드 (예: "PL", "PD", "BL1")
- **DB 삽입 전**: `interest_categories`에서 EPL/라리가 등의 `target_calendar_id` 획득 후 매핑

```javascript
// API 호출 예시 (claude.md: 명시적 Timeout 적용)
const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 8000);

try {
  const res = await fetch(
    `https://api.football-data.org/v4/competitions/PL/matches?dateFrom=${from}&dateTo=${to}`,
    { 
      headers: { 'X-Auth-Token': process.env.FOOTBALL_DATA_API_KEY },
      signal: controller.signal
    }
  );
  // ... 처리 로직
} catch (error) {
  // Fail-safe: 에러 로깅 후 종료 (GitHub Actions가 실패를 포착하도록)
  console.error("EPL Data Fetch Failed:", error);
  process.exit(1); 
} finally {
  clearTimeout(timeout);
}
```

#### 필요 환경변수
- `FOOTBALL_DATA_API_KEY` (무료 발급)
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (기존 시크릿)

### 5.2 Phase 2: KBO (Playwright 스크래핑)

#### [NEW] `scripts/sync-sports-kbo.mjs`
- `koreabaseball.com/Schedule/GameList.aspx` 페이지를 Playwright로 방문
- 월별 경기 일정 테이블 파싱 (Cheerio 활용)
- `external_resource_id`: `kbo_{away}_{home}_{date}` 형식
- `region`: 경기장 소재지 (잠실→서울, 문학→인천, 사직→부산 등)
- `detail_type`: `"kbo"`
- 홈/원정 팀을 `memo`에 포함 → `active_filters.teams` 매칭에 활용

### 5.3 Phase 3: K리그 (Playwright 스크래핑)

#### [NEW] `scripts/sync-sports-kleague.mjs`
- `kleague.com` 일정 페이지를 Playwright로 방문
- `external_resource_id`: `kleague_{away}_{home}_{date}`
- `region`: 경기장 소재지 매핑
- `detail_type`: `"kleague1"` 또는 `"kleague2"`

### 5.4 Phase 4: MLB (statsapi.mlb.com API) 🆕

#### [NEW] `scripts/sync-sports-mlb.mjs`
- MLB Stats API로 향후 30일 경기 일정 가져오기 (API Key 불필요!)
- `external_resource_id`: `mlb_{gamePk}` 형식
- `region`: 홈팀 도시명 (예: "New York", "Los Angeles")
- `detail_type`: `"mlb"`
- `memo`에 홈/원정 팀 이름 포함 → `active_filters.teams` 매칭

```javascript
// API 호출 예시 (인증 불필요)
const res = await fetch(
  `https://statsapi.mlb.com/api/v1/schedule?sportId=1&startDate=${from}&endDate=${to}&hydrate=team`
);
```

### 5.5 Phase 5: NBA (BALLDONTLIE API) 🆕

#### [NEW] `scripts/sync-sports-nba.mjs`
- BALLDONTLIE NBA API로 향후 30일 경기 일정 가져오기
- `external_resource_id`: `nba_balldontlie_{gameId}` 형식
- `region`: 홈팀 도시명
- `detail_type`: `"nba"`

```javascript
// API 호출 예시
const res = await fetch(
  `https://api.balldontlie.io/v1/games?dates[]=${dateStr}`,
  { headers: { 'Authorization': process.env.BALLDONTLIE_API_KEY } }
);
```

### 5.6 Phase 6: FIFA 월드컵 2026 (시즌성) 🆕

#### [NEW] `scripts/sync-sports-worldcup2026.mjs`
- WC2026 API로 전체 104경기 일정 가져오기
- **실행 시점**: 대회 1개월 전(2026/05) ~ 대회 종료(2026/07) 기간만
- `external_resource_id`: `wc2026_{matchId}` 형식
- `region`: 개최 도시 (16개 도시)
- `detail_type`: `"worldcup2026"`

### 5.7 Phase 7: LA 올림픽 2028 (시즌성) 🆕

#### [NEW] `scripts/sync-sports-olympics2028.mjs` (또는 정적 JSON)
- 공식 일정 확정 후 **정적 JSON 파일로 시딩** (가장 안정적)
- 또는 olympics.com 스크래핑 (일정 변경 반영용)
- `external_resource_id`: `olympics2028_{sport}_{eventId}` 형식
- `region`: `"Los Angeles"`
- `detail_type`: 종목명 (예: `"athletics"`, `"swimming"`, `"basketball"`)

### 5.4 GitHub Actions Workflow 확장

#### [MODIFY] `.github/workflows/sync-events.yml`

기존 `scrape-and-sync` job에 스포츠 수집 step을 추가하거나, 별도 `sync-sports.yml` 생성:

```yaml
# .github/workflows/sync-sports.yml
name: Sync Sports Events

on:
  schedule:
    - cron: '0 20 * * 1,4'  # 월/목 KST 05:00
  workflow_dispatch: {}

jobs:
  sync-sports:
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci

      # ── API 기반 수집 (Playwright 불필요) ──
      - name: Sync Football (EPL, LaLiga, etc.)
        run: node scripts/sync-sports-football.mjs
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
          FOOTBALL_DATA_API_KEY: ${{ secrets.FOOTBALL_DATA_API_KEY }}

      - name: Sync MLB
        run: node scripts/sync-sports-mlb.mjs
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}

      - name: Sync NBA
        run: node scripts/sync-sports-nba.mjs
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
          BALLDONTLIE_API_KEY: ${{ secrets.BALLDONTLIE_API_KEY }}

      # ── 스크래핑 기반 수집 (Playwright 필요) ──
      - name: Install Playwright
        run: npx playwright install --with-deps chromium

      - name: Sync KBO
        run: node scripts/sync-sports-kbo.mjs
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}

      - name: Sync K-League
        run: node scripts/sync-sports-kleague.mjs
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
```

#### 시즌성 이벤트 워크플로우 (별도)

```yaml
# .github/workflows/sync-sports-seasonal.yml
name: Sync Seasonal Sports (World Cup / Olympics)

on:
  workflow_dispatch: {}  # 수동 실행만 (시즌 시작 시 활성화)

jobs:
  sync-seasonal:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci

      - name: Sync World Cup 2026
        run: node scripts/sync-sports-worldcup2026.mjs
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
```

### 5.5 interest_categories 데이터 시딩

```sql
-- 스포츠 상위 카테고리
INSERT INTO interest_categories (name, icon, is_leaf, sort_order) 
VALUES ('스포츠', '⚽', false, 100);

-- 하위 카테고리 (각각 interest 캘린더 연결)
INSERT INTO interest_categories (name, parent_id, icon, is_leaf, sort_order, target_calendar_id) 
VALUES 
  ('KBO (프로야구)', <sports_id>, '⚾', true, 101, <calendar_id>),
  ('EPL (프리미어리그)', <sports_id>, '⚽', true, 102, <calendar_id>),
  ('K리그', <sports_id>, '⚽', true, 103, <calendar_id>),
  ('라리가', <sports_id>, '⚽', true, 104, <calendar_id>),
  ('분데스리가', <sports_id>, '⚽', true, 105, <calendar_id>),
  ('MLB (메이저리그)', <sports_id>, '⚾', true, 106, <calendar_id>),
  ('NBA (프로농구)', <sports_id>, '🏀', true, 107, <calendar_id>),
  ('FIFA 월드컵 2026', <sports_id>, '🏆', true, 108, <calendar_id>),
  ('LA 올림픽 2028', <sports_id>, '🥇', true, 109, <calendar_id>);
```

### 5.6 클라이언트 수정

#### [MODIFY] `services/supabase-modules/interests.ts`
- `getAvailableFilterOptions()`에 `teams` 옵션 추가
- 스포츠 카테고리의 경우 팀 목록을 동적으로 제공

#### [MODIFY] `app/settings/interests.tsx`
- 필터 모달에 `teams` 칩 그룹 추가 (스포츠 카테고리일 때만 표시)

#### [MODIFY] `services/supabase-modules/events.ts`
- `applyInterestFilters()` 함수에 `teams` 필터 로직 추가

---

## 6. 비용 분석

| 항목 | 비용 | 비고 |
|------|------|------|
| football-data.org API | **$0/월** | Free tier (10 req/min) |
| MLB Stats API | **$0/월** | 비공식, 인증 불필요 |
| BALLDONTLIE NBA API | **$0/월** | 무료 tier |
| WC2026 API | **$0/월** | Free plan (10K req/day, 대회 기간만) |
| GitHub Actions 실행 | **$0/월** | 퍼블릭 무료, 프라이빗 2000분/월 무료 |
| Playwright Chromium | **$0** | GitHub Actions 내장 |
| Supabase 저장 | **$0 추가** | 기존 Free tier 범위 내 |
| **합계** | **$0/월** | 🎉 전체 무료 |

---

## 7. 구현 우선순위 및 로드맵

| 순서 | 항목 | 의존성 | 난이도 |
|------|------|--------|--------|
| **Phase 1** | football-data.org → EPL 등 해외축구 | API Key 발급 | ⭐ 쉬움 |
| **Phase 2** | KBO 스크래핑 + 팀 필터 UI | Playwright | ⭐⭐ 보통 |
| **Phase 3** | K리그 스크래핑 | Playwright | ⭐⭐ 보통 |
| **Phase 4** | MLB (statsapi.mlb.com) | 없음 (API Key 불필요) | ⭐ 쉬움 |
| **Phase 5** | NBA (BALLDONTLIE) | API Key 발급 | ⭐ 쉬움 |
| **Phase 6** | 팀 필터 (`active_filters.teams`) UI | Phase 1-5 완료 | ⭐ 쉬움 |
| **Phase 7** | 추가 축구 리그 (라리가, 분데스 등) | Phase 1 패턴 재활용 | ⭐ 쉬움 |
| **Phase 8** | FIFA 월드컵 2026 | 대회 1개월 전 활성화 (2026/05) | ⭐ 쉬움 |
| **Phase 9** | LA 올림픽 2028 | 일정 확정 후 시딩 (2028 초) | ⭐ 쉬움 |

---

## 8. 검증 계획

### 자동 검증
- `node scripts/sync-sports-football.mjs` 실행 후 `events` 테이블에 EPL 경기 데이터가 UPSERT되는지 확인 (매핑된 `calendar_id` 확인)
- 동일 스크립트 2회 실행 시 중복 INSERT 0건 (idempotent) 확인
- `external_resource_id`와 `calendar_id` 복합 UNIQUE 제약 정합성 확인
- API 타임아웃(8000ms) 강제 발생 시 정상 예외 처리(`process.exit(1)`) 되는지 확인

### 수동 검증
1. 앱에서 **설정 → 관심사** 화면 진입
2. "스포츠 → KBO" 카테고리 구독
3. 홈 캘린더에 KBO 경기 일정이 표시되는지 확인
4. "필터 ⚙️" 버튼 → 팀 "두산" 선택 → 두산 관련 경기만 표시되는지 확인
5. 푸시 알림이 필터에 맞는 경기만 스케줄링되는지 확인

---

## 9. 리스크 및 완화 방안

| 리스크 | 영향 | 완화 (Fail-Safe) |
|--------|------|------|
| KBO 사이트 구조 변경 | 스크래핑 실패 | Naver 스포츠 백업 스크래퍼 준비 + **GitHub Actions 실패 알림(Discord/Slack Webhook) 연동** |
| football-data.org Rate Limit | 일시적 수집 실패 | 주 2회 배치 + 재시도 로직 (exponential backoff) |
| 외부 API 지연/멈춤 | 워크플로우 행(hang) | `claude.md`에 정의된 대로 명시적 `AbortController` Timeout(8000ms) 강제 적용 |
| MLB Stats API 비공식 | 엔드포인트 변경 가능 | BALLDONTLIE MLB 백업 준비 + 실패 웹훅 |
| BALLDONTLIE 무료 tier 제한 | Rate limit 초과 | 요청 간 `setTimeout` 딜레이 + 배치 최적화 |
| 경기 취소/연기 | 캘린더와 실제 불일치 | 매 수집 시 전체 UPSERT → 변경 사항 자동 갱신 |
| 월드컵/올림픽 일정 변경 | 부정확한 데이터 | 대회 기간 중 매일 수집으로 자동 최신화 |
| robots.txt 정책 변경 | 법적 리스크 | Playwright 수집 전 `robots.txt` 자동 파싱 및 준수 확인 로직 추가 |

---

## 10. AI 검토 결과 요약 (claude.md §1 준수)

| 검증 항목 | 결과 |
|-----------|------|
| research.md 아키텍처 충돌 | ✅ 없음 — API-First + GitHub Actions 패턴 기존 정책 부합 |
| Supabase 스키마 충돌 | ✅ 해결됨 — `events` 테이블 복합 유니크 키(`external_resource_id`, `calendar_id`) 매핑 설계 추가 반영 |
| RLS 정책 충돌 | ✅ 없음 — 기존 `interest_categories`의 정책 스포츠에도 동일 적용 |
| 외부 API Timeout 규칙 | ✅ 준수 — `claude.md` §3.3 규칙에 따른 8초 타임아웃(AbortController) 명시 |
| Fail-Safe 룰 준수 | ✅ 준수 — 스크래핑 실패 시 GitHub Actions Webhook 연동 및 Fallback 소스 명시 |
| 비용 정책 | ✅ $0/월 유지 — claude.md §2.5 비용 효율성 완전 부합 |
| active_filters 하위 호환 | ✅ 보장 — JSONB 확장이므로 기존 지역/형태 필터 시스템 영향 제로 |
