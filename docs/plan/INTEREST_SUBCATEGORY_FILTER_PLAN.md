# Interest Subcategory Filter Plan (Updated 2026-03-04)

## 목적
관심 카테고리 구독을 "카테고리 ON/OFF"에서 "하위 필터(지역/세부유형) 포함 구독"으로 확장해, 캘린더 과밀 노출을 줄이고 사용자가 보고 싶은 일정만 보이게 한다.

## 배경과 현재 문제
사전 점검 기준:
- `research.md` 검토
- `supabase/functions`, `services/supabase-modules`, `migrations` 실제 코드/스키마 검토

확인된 문제:
1. 구독 단위가 카테고리 레벨뿐이라 이벤트가 과다 노출된다.
- `user_interest_subscriptions`에 필터 저장 컬럼이 없다.

2. 이벤트 테이블에 필터용 정규화 필드가 없다.
- `events.location`, `events.type`는 있으나 지역/세부유형 필터에 바로 쓰기 어렵다.
- 문자열 파싱 기반 필터는 오탐/성능 리스크가 있다.

3. 기존 계획서의 API/수집 가정이 현재 코드와 어긋난다.
- 축제 API는 `searchFestival2`가 최신 경로다.
- 문화 API는 `realm2`가 최신 경로이며, `realmInfo`는 백업 경로다.
- 현재 함수는 이미 API fallback + 일부 스크랩 fallback이 반영된 상태다.

4. 필터 적용 위치가 불명확하면 일관성 문제가 생긴다.
- 캘린더 화면/알림 스케줄/홈 피드가 서로 다른 결과를 보여줄 수 있다.

---
### 🔍 AI 핵심 지침(claude.md) 기반 사전 검토 결과 및 보완 사항
*   **연구(Research.md) 환경 일치 여부**: 앱의 핵심 파이프라인(비용 계단식 Fallback)이나 아키텍처 원칙을 침해하지 않습니다. 클라이언트 측 우선 필터링 적용 전략(1차) 후 RPC 최적화(2차)로 전환하는 부분은 비용 효율성 원칙에 잘 부합합니다.
*   **Supabase 스키마 위반 여부**: 
    *   `events` 테이블 기능 확장의 경우 RLS 정책을 변경할 필요가 없는 단순 메타데이터 추가이므로 안전합니다.
    *   `user_interest_subscriptions` 테이블에 `active_filters`를 추가할 때 `default '{}'::jsonb`를 설정함으로써 기존 `subscribe_interest_category` RPC 코드를 부러뜨리지 않고 완벽히 호환 가능함을 확인했습니다.
*   **사이드 이펙트 방지**:
    *   기존 구독 RPC(`subscribe_interest_category`)는 수정 없이 동작하며, 새로운 필터 업데이트 전용 API(`updateSubscriptionFilters`)를 분리해 추가하는 제안은 매우 안전한 접근입니다.
    *   `sync-interest-events` Edge Function을 검토한 결과 `addr1` 필드를 활용해 Region을 추출할 수 있습니다.
---

## 목표
- 사용자별 구독 필터를 영속 저장한다.
- 관심 이벤트에 지역/세부유형 메타를 정규화 저장한다.
- 캘린더, 알림, 통계 조회에서 동일한 필터 기준을 사용한다.
- 필터 미설정 사용자는 기존 동작(전체 노출)을 유지한다.

## 비목표
- 관심 카테고리 트리 구조 자체 개편
- 관심 이벤트 외(경조사/가계부) 필터 체계 변경
- 대규모 추천/랭킹 시스템 도입

## 설계 원칙
1. 기존 RLS 정책을 깨지 않는다.
2. 마이그레이션은 항상 역호환(default 값, nullable)으로 시작한다.
3. 1차는 안전한 적용(클라이언트 필터), 2차는 성능 최적화(RPC/서버 필터)로 나눈다.
4. 수집(ingestion) 단계에서 메타를 최대한 정규화한다.

## 제안 스키마
### 1) `events` 확장
- `region text null`
- `detail_type text null`

인덱스:
- `idx_events_region_interest` on `(region)` where `region is not null`
- `idx_events_detail_type_interest` on `(detail_type)` where `detail_type is not null`

### 2) `user_interest_subscriptions` 확장
- `active_filters jsonb not null default '{}'::jsonb`

권장 JSON 형태:
```json
{
  "regions": ["서울", "경기"],
  "detail_types": ["festival", "exhibition", "performance"]
}
```

### 3) `interest_categories` 확장(선택)
- `filter_dimensions jsonb not null default '[]'::jsonb`

예시:
```json
[
  { "key": "region", "label": "지역" },
  { "key": "detail_type", "label": "유형" }
]
```

## 데이터 수집 반영 기준
### `sync-interest-events`
- `region`: `addr1/addr2`에서 시/도 추출
- `detail_type`: 기본값 `festival`

### `sync-culture-events`
- `region`: `place` 기반 시/도 추출
- `detail_type`: `realmName` 정규화 값

규칙:
- 추출 실패 시 `null` 저장
- 원문은 `memo`에 유지

## 필터 적용 위치
### 1차(필수, 빠른 적용)
- `services/supabase-modules/events.ts`에서 이벤트 조회 후 `active_filters`를 적용
- `services/notifications.ts`의 관심 일정 스케줄링에도 동일 필터 적용

### 2차(최적화)
- RPC 또는 뷰를 통해 서버 측 필터링으로 전환
- 월간 대량 데이터 환경에서 네트워크/클라이언트 비용 절감

## 구현 범위
### In
- DB 마이그레이션 1개(필드/인덱스)
- 관심 이벤트 수집 함수 2개 메타 필드 채우기
- 구독 필터 저장/조회 API 추가
- 관심사 설정 화면 필터 UI 추가
- 캘린더/알림 필터 동기 적용

### Out
- 추천 알고리즘
- 커뮤니티 게시글 필터 체계 연동
- 다국어 지역명 표준화

## Action Items
[ ] 1. `migrations/`에 `events.region`, `events.detail_type`, `user_interest_subscriptions.active_filters` 추가 마이그레이션 작성
[ ] 2. 기존 interest 캘린더 이벤트에 대해 `region/detail_type` 백필 SQL 작성
[ ] 3. `sync-interest-events`에 지역 추출 유틸 추가 및 `detail_type='festival'` 저장
[ ] 4. `sync-culture-events`에 지역/세부유형 저장 로직 추가
[ ] 5. `services/supabase-modules/interests.ts`에 `updateSubscriptionFilters`, `getAvailableFilterOptions` 추가
[ ] 6. `services/supabase-modules/events.ts`에 `applyInterestFilters` 추가하고 `getEvents/getTodayEvents/getUpcomingEvents`에 적용
[ ] 7. `services/notifications.ts`의 관심 일정 동기화에 동일 필터 규칙 적용
[ ] 8. `app/settings/interests.tsx`에 카테고리별 필터 UI(칩/토글) 추가
[ ] 9. 필터 미설정 사용자에 대한 역호환 동작(전체 노출) 보장 테스트
[ ] 10. E2E 검증 후 `CHANGELOG.md` 갱신

## 검증 계획
SQL 검증:
- 구독별 `active_filters` 저장 확인
- `events.region/detail_type` null 비율 확인
- 월별 관심 이벤트 건수 vs 필터 적용 후 건수 비교

앱 검증:
- 동일 계정에서 필터 ON/OFF 시 캘린더 표시 건수 즉시 반영
- 앱 재시작 후 필터 상태 유지
- 알림 스케줄링이 필터 반영된 이벤트만 생성

성능 검증:
- 월 단위 로딩 시간, 이벤트 개수 1k/5k 기준 비교
- 필요 시 2차 서버 필터링 단계로 승격

## 리스크와 대응
1. 지역 추출 정확도
- 대응: 표준 지역 사전 + 미분류(`null`) 허용 + 사용자 UI에서 "기타" 옵션 제공

2. 필터 적용 불일치(화면/알림)
- 대응: 단일 필터 함수 재사용, 테스트 케이스 공통화

3. 대량 데이터에서 클라이언트 필터 비용 증가
- 대응: 2차 단계 RPC/뷰 전환을 미리 계획

## 롤아웃 전략
1. 스키마 + 백필 먼저 적용
2. 수집 함수 배포 후 신규 데이터부터 메타 채움
3. 앱 배포에서 필터 UI/조회 반영
4. 모니터링 후 서버 필터 최적화 여부 결정

