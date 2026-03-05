# Calendar Interest Event Visibility Fix Plan (2026-03-04, rev 2)

> **개정 이력**: 2026-03-04 초안 → rev 2 (코드베이스 직접 비교 후 수정·보강)

---

## Context
앱 로그에서 `[Reciprocity] Found 14 upcoming events`처럼 관심/문화 이벤트가 수신되고 있으나, 사용자 캘린더 UI에는 표시되지 않는 문제. 수집(ingest) → DB → RLS → UI 전 레이어에 걸쳐 복합 원인이 확인됨.

---

## Key Findings (코드 직접 확인 기준)

### F-1. UI 카테고리 필터 누락 — **심각도: 높음, 확신도: 확정**

| 파일 | 위치 | 실제 코드 |
|------|------|-----------|
| `app/calendar/index.tsx` | L63 | `filters: { ceremony, todo, schedule, expense }` 4개만 |
| `app/calendar/index.tsx` | L75 | `if (!filters[category]) return;` — 미등록 category는 **무조건 드롭** |
| `services/supabase-modules/types.ts` | L1 | `EventCategory = 'ceremony' \| 'todo' \| 'schedule' \| 'expense'` |

**DB에 실제 기록되는 category 값**:
- `sync-interest-events/index.ts` L76 → `category: 'interest'` ← **필터 없음**
- `sync-culture-events/index.ts` L128 → `category: 'exhibition' | 'performance'` ← **필터 없음**

**결론**: 두 엣지 함수가 기록하는 모든 category가 UI 필터에서 무시됨. 이벤트가 DB에 정상 존재해도 캘린더 마커가 생성되지 않음.

---

### F-2. RLS shared_categories 기본값에 `interest` 누락 — **심각도: 높음, 확신도: 확정**

| 파일 | 위치 | 실제 코드 |
|------|------|-----------|
| `migrations/20260208_add_shared_categories.sql` | L11, L18 | `DEFAULT ARRAY['ceremony','todo','schedule']` |
| `migrations/20260208_add_shared_categories.sql` | L53-60 | `can_view_event_category()` → `p_category = ANY(shared_categories)` |
| `migrations/20260208_add_shared_categories.sql` | L143-145 | Events SELECT policy에 `can_view_event_category` 적용 |

**결론**: `subscribe_interest_category` RPC가 생성하는 `calendar_members` 행의 `shared_categories`가 기본값`['ceremony','todo','schedule']`을 상속하면, `category='interest'` 이벤트는 RLS에서 차단됨. UI 이전 레이어에서 이미 0건 반환.

---

### F-3. `syncInterestNotifications()` — 3개 컬럼 오참조 — **심각도: 높음(기존 계획은 '인접 이슈'로 저평가)**

| 파일 | 위치 | 잘못된 코드 | 올바른 컬럼 |
|------|------|-------------|-------------|
| `services/notifications.ts` | L256 | `.select('id, title, date, start_time, alarm_minutes')` | `name`, `event_date` |
| `services/notifications.ts` | L261 | `.eq('source', 'interest')` | `source`는 **DB 컬럼이 아님** (클라이언트 계산 필드) |

**결론**: 이 함수가 반환하는 행은 항상 0개이거나 Supabase 오류를 반환함 → 관심 이벤트 알림이 **전혀 스케줄링되지 않음**. '인접 이슈'가 아니라 **독립된 버그**.

---

### F-4. 월별 쿼리 날짜 경계 버그 (KST 타임존) — **심각도: 중간, 확신도: 확정**

`services/supabase-modules/events.ts` L272-277:
```typescript
const start = new Date(year, month - 1, 1);  // 로컬 자정
const end   = new Date(year, month, 1);
startIso = start.toISOString();  // UTC로 변환 → KST +9h 오프셋으로 전일로 밀림
endIso   = end.toISOString();
startDate = startIso.split('T')[0];
endDate   = endIso.split('T')[0];
```

**KST(UTC+9) 사용자 기준 시뮬레이션**:
```
3월 조회 요청:
  start local = 2026-03-01 00:00 KST
  startIso    = 2026-02-28T15:00:00Z
  startDate   = "2026-02-28"  ← 2월 말 이벤트가 포함되고 3월 1일이 누락될 수 있음

  end local   = 2026-04-01 00:00 KST
  endIso      = 2026-03-31T15:00:00Z
  endDate     = "2026-03-31"  ← 3월 31일 이벤트가 .lt() 조건으로 제외됨
```

**결론**: 월 첫 날·마지막 날 이벤트가 경우에 따라 보이지 않음.

---

### F-5. 구독 토글 후 calendarIds 캐시 미무효화 — **심각도: 중간, 확신도: 확정**

`services/supabase-modules/interests.ts` L123-124:
```typescript
invalidateCalendarCache(user.id);   // ← 홈화면 캐시 무효화
// invalidateCalendarIdsCache() 호출 없음 ← 버그
return true;
```

`services/supabase-modules/calendars.ts` L6-7:
```typescript
let calendarIdsCache: { ids: string[]; timestamp: number } | null = null;
const CALENDAR_IDS_CACHE_TTL = 60 * 1000; // 1분
```

**결론**: 구독 직후 `getMyCalendarIds()`가 구 캐시를 반환 → 새 캘린더가 이벤트 쿼리(`buildCalendarOrFilter`)에서 누락. **1분 후 자동 복구**.

---

### F-6. Calendar 인터페이스에 `calendar_type` 필드 미정의 — **심각도: 낮음 (신규)**

`calendars.ts`의 `Calendar` 인터페이스에 `calendar_type` 필드가 없음. `select('*')`로 데이터는 오지만 TypeScript에서 타입 에러 유발. 진단 SQL의 `c.calendar_type = 'interest'` 조건은 런타임에는 동작하나 코드 수준에서 안전하지 않음.

---

### F-7. `types.ts`에 `isCompleted` 잔류 — **심각도: 낮음 (신규)**

`services/supabase-modules/types.ts` L14: `isCompleted?: boolean;` 필드가 여전히 존재.
`events.ts` L106: `isCompleted: false, // item.is_completed (Column missing)`
CLAUDE.md: ❌ `is_completed` 컬럼 참조 금지. 타입 정의와 현실이 불일치.

---

## Root Cause Summary

```
사용자가 관심 이벤트를 구독
        ↓
subscribe_interest_category RPC 실행
        ↓
calendar_members에 행 생성
  → shared_categories = ['ceremony','todo','schedule'] 기본값 (F-2)
        ↓
getEvents() 호출 시 RLS가 'interest' category 차단 → 0건 반환
(OR: 데이터가 반환돼도 F-1 UI 필터에서 드롭)
        ↓
알림도 F-3 컬럼 오참조로 0건 스케줄링
```

---

## Approach (변경 없음)
수집(ingest) → DB → RLS → UI 전 레이어의 카테고리 의미를 통합. 안전한 핫픽스부터 적용 후 스키마 정규화.

---

## Scope

**In-scope**:
- 캘린더 UI 관심/문화 이벤트 가시성
- 수집 카테고리 정규화 (두 엣지 함수)
- interest calendar RLS/shared_categories 정책
- 구독 캐시 즉시 반영
- 월별 쿼리 날짜 경계 수정
- 알림 쿼리 컬럼 수정

**Out-of-scope**:
- 캘린더 UI 전체 재설계
- 커뮤니티/채팅 기능 변경
- 새 데이터 제공자 추가

---

## Action Items (우선순위순)

> **반드시 순서대로**: F-2(RLS) → F-1(UI 필터) → F-5(캐시) → F-3(알림) → F-4(날짜) → F-6/F-7(타입)

### Step 1. 진단 SQL 실행 (선행 필수)
아래 Diagnostics SQL을 Supabase Dashboard SQL Editor에서 실행해 어느 레이어에서 먼저 실패하는지 확인.

### Step 2. RLS + shared_categories 수정 (F-2) — **최우선**
**마이그레이션 파일 생성**: `migrations/20260304_fix_interest_rls.sql`

핵심 내용:
- `subscribe_interest_category` RPC가 `calendar_members`를 INSERT할 때 `shared_categories`에 `'interest'` 포함
- 기존 interest calendar 구독자의 `shared_categories` 백필: `UPDATE calendar_members SET shared_categories = array_append(shared_categories, 'interest') WHERE calendar_id IN (SELECT id FROM calendars WHERE calendar_type = 'interest') AND NOT 'interest' = ANY(shared_categories)`
- 또는: interest calendar에 대해서는 `can_view_event_category()`가 `calendar_type='interest'`인 경우 `'interest'` category를 자동 허용하도록 함수 수정

### Step 3. UI 카테고리 필터 핫픽스 (F-1)
**파일**: `app/calendar/index.tsx`

- `filters` 상태 타입에 `interest: boolean` 추가, 기본값 `true`
- `CATEGORY_COLORS`에 `interest: '#00B8B8'` (청록) 추가
- `EventCategory` 타입 (`services/supabase-modules/types.ts`) 에 `'interest'` 추가

### Step 4. sync-culture-events 카테고리 정규화 (F-1 보완)
**파일**: `supabase/functions/sync-culture-events/index.ts` L127-128

```typescript
// 변경 전
type: isExhibition ? 'exhibition' : 'performance',
category: isExhibition ? 'exhibition' : 'performance',

// 변경 후
type: isExhibition ? 'exhibition' : 'performance',  // type 필드는 상세 구분 유지
category: 'interest',                               // category는 통합 값으로 정규화
```

DB 기존 행 백필 (마이그레이션에 포함):
```sql
UPDATE events SET category = 'interest'
WHERE category IN ('exhibition', 'performance')
  AND calendar_id IN (SELECT id FROM calendars WHERE calendar_type = 'interest');
```

### Step 5. 구독 캐시 즉시 무효화 (F-5)
**파일**: `services/supabase-modules/interests.ts` L123

```typescript
// 변경 전
invalidateCalendarCache(user.id);

// 변경 후
invalidateCalendarCache(user.id);
invalidateCalendarIdsCache(); // calendar_members 변경 후 즉시 반영
```

### Step 6. syncInterestNotifications 컬럼 수정 (F-3)
**파일**: `services/notifications.ts` L255-261

```typescript
// 변경 전
.select('id, title, date, start_time, alarm_minutes')
.eq('source', 'interest')

// 변경 후
.select('id, name, event_date, start_time, alarm_minutes')
// .eq('source', 'interest') 제거 — DB 컬럼이 아님
// 대신 calendar_id IN (...interest_calendar_ids) 필터만 사용

// 본문 참조도 수정:
// ev.title → ev.name
// ev.date  → ev.event_date
```

### Step 7. 월별 쿼리 날짜 경계 수정 (F-4)
**파일**: `services/supabase-modules/events.ts` L272-277

```typescript
// 변경 전 (로컬 midnight → toISOString() UTC 변환 시 날짜 밀림)
const start = new Date(year, month - 1, 1);
const end   = new Date(year, month, 1);
startDate   = start.toISOString().split('T')[0];
endDate     = end.toISOString().split('T')[0];

// 변경 후 (ISO 날짜 문자열을 직접 계산)
startDate = `${year}-${String(month).padStart(2, '0')}-01`;
const nm  = month === 12 ? { y: year + 1, m: 1 } : { y: year, m: month + 1 };
endDate   = `${nm.y}-${String(nm.m).padStart(2, '0')}-01`;
```

### Step 8. 타입 정리 (F-6, F-7)
- `services/supabase-modules/calendars.ts`: `Calendar` 인터페이스에 `calendar_type?: string` 추가
- `services/supabase-modules/types.ts`: `EventCategory`에 `'interest'` 추가, `isCompleted` 주석 정리 (CLAUDE.md 규칙 준수)

### Step 9. 엔드-투-엔드 검증 (Android)
구독 ON → fetch → 월별 마커 → 일별 타임라인 → 알림 순서로 확인.

---

## Diagnostics SQL (작업 전 실행)

```sql
-- A) interest 캘린더 이벤트 카테고리 분포 확인
SELECT c.name AS calendar_name, c.calendar_type, e.category, COUNT(*) AS cnt
FROM events e
JOIN calendars c ON c.id = e.calendar_id
WHERE c.calendar_type = 'interest'
GROUP BY c.name, c.calendar_type, e.category
ORDER BY c.name, cnt DESC;

-- B) 내 멤버십 및 shared_categories 확인
SELECT cm.calendar_id, c.name, c.calendar_type, cm.role, cm.shared_categories
FROM calendar_members cm
JOIN calendars c ON c.id = cm.calendar_id
WHERE cm.user_id = auth.uid()
ORDER BY c.name;

-- C) interest_categories → target_calendar_id 매핑 확인
SELECT id, name, target_calendar_id, is_leaf
FROM interest_categories
ORDER BY sort_order, name;

-- D) 향후 interest 캘린더 이벤트 직접 조회 (RLS 우회 — Supabase Dashboard 실행)
SELECT e.id, e.name, e.category, e.type, e.event_date, e.calendar_id
FROM events e
JOIN calendars c ON c.id = e.calendar_id
WHERE c.calendar_type = 'interest'
  AND e.event_date >= CURRENT_DATE
ORDER BY e.event_date
LIMIT 50;

-- E) RLS 통과 여부 확인 (앱 유저 세션으로 실행)
SELECT e.id, e.name, e.category, e.event_date
FROM events e
JOIN calendars c ON c.id = e.calendar_id
WHERE c.calendar_type = 'interest'
  AND e.event_date >= CURRENT_DATE
ORDER BY e.event_date
LIMIT 20;
-- D와 E의 건수 차이 = RLS가 차단하는 건수

-- F) subscribe_interest_category RPC 결과 구조 확인
SELECT routine_name, routine_definition
FROM information_schema.routines
WHERE routine_name IN ('subscribe_interest_category', 'unsubscribe_interest_category');
```

---

## Validation Checklist

- [ ] SQL D쿼리와 E쿼리의 건수가 일치함 (RLS 차단 없음)
- [ ] 구독한 사용자가 해당 월 마커에 interest 이벤트 점(dot) 표시됨
- [ ] 구독 직후(60초 이내) 신규 캘린더 이벤트가 캘린더에 반영됨
- [ ] 월 첫째 날 / 마지막 날 이벤트가 정상 표시됨 (KST 기기 기준)
- [ ] 알림 스케줄 로그에 `[syncInterestNotifications] Successfully scheduled N` 출력
- [ ] `npx tsc --noEmit` 타입 오류 없음

---

## Rollout 순서

1. **진단 SQL 실행** → 레이어별 차단 위치 특정
2. **핫픽스 배포**: Step 3(UI 필터) + Step 5(캐시) + Step 7(날짜 경계) — JS 변경만, 빠른 배포 가능
3. **마이그레이션**: Step 2(RLS + shared_categories) + Step 4(DB 백필) — 스테이징 검증 후 적용
4. **엣지 함수 배포**: Step 4(sync-culture-events 정규화)
5. **알림 수정**: Step 6(notifications.ts)
6. **타입 정리**: Step 8 — 코드 품질 정리
7. **프로덕션 모니터링** 48시간 (캘린더 가시성 + 지원 티켓)

---

## 파일 수정 목록 요약

| 파일 | 수정 내용 | 단계 |
|------|-----------|------|
| `services/supabase-modules/types.ts` | EventCategory에 'interest' 추가, isCompleted 주석 정리 | 8 |
| `app/calendar/index.tsx` | filters 상태에 interest 추가, CATEGORY_COLORS 추가 | 3 |
| `services/supabase-modules/interests.ts` | invalidateCalendarIdsCache() 추가 | 5 |
| `services/supabase-modules/events.ts` | 날짜 경계 계산 수정 | 7 |
| `services/supabase-modules/calendars.ts` | Calendar 인터페이스에 calendar_type 추가 | 8 |
| `services/notifications.ts` | select 컬럼 수정, source 필터 제거 | 6 |
| `supabase/functions/sync-culture-events/index.ts` | category → 'interest' 정규화 | 4 |
| `migrations/20260304_fix_interest_rls.sql` | shared_categories 백필, RLS 수정 | 2 |
