# Data Collection Alternatives Plan (Updated 2026-03-04)

## Approach
현재 코드베이스의 수집 경로(Edge Function + Node Script + Scraping)를 기준으로, 보안/정합성/운영 리스크를 먼저 제거한 뒤 대안별(API 우선, Scrape 우선, Hybrid) 실행 조건을 명확히 분리한다. 핵심은 "수집 실패를 줄이는 것"보다 "신뢰 가능한 데이터만 안정적으로 적재"하는 구조를 먼저 만드는 것이다.

## Scope
- In:
- 관심사 이벤트(공연/전시/축제/팝업) 수집 경로 정비
- 수집 대안 선택 기준(API vs Scraping vs Hybrid) 정의
- 중복 방지, 품질 검증, 운영 관측성(로그/메트릭) 강화
- Out:
- 관심사 외 도메인(경조사 OCR/가계부) 수집 로직 변경
- 앱 UI/디자인 리뉴얼
- 커뮤니티 기능 정책 개편

## Codebase Review Findings
1. 수집 경로가 3개로 분산되어 있음:
   - Edge Functions: `supabase/functions/sync-interest-events`, `supabase/functions/sync-culture-events`
   - CI Script: `scripts/sync-interest-data.mjs`, `scripts/scrape-events.mjs`
   - Workflow: `.github/workflows/sync-events.yml`
2. 비밀키 하드코딩 리스크가 존재함:
   - 스크립트 내 `SUPABASE_SERVICE_ROLE_KEY`, `API_KEY`, `FIRECRAWL_KEY` fallback 하드코딩
   - Edge Function 내 API key fallback 하드코딩
3. 업서트 키 충돌/제약 정합성 이슈가 남아 있음:
   - `migrations/20260302_v6_interest_app.sql`는 partial unique index 기반
   - `fix_events_upsert_constraint.sql`에 별도 보정안이 있으나 정식 migration 반영 전
4. 스크래핑 경로의 중복/품질 리스크:
   - `external_resource_id`가 인덱스 기반(`..._${i}_${date}`)이라 실행 순서 변화 시 중복 가능
   - 날짜 정규화 로직에 연도 하드코딩(2026) 및 regex 취약 지점 존재
5. 수집 데이터와 소비 쿼리 간 정합성 이슈:
   - `services/notifications.ts`는 `events.source = 'interest'` 필터를 사용하지만, 수집 경로에서 `source`를 저장하지 않음
6. 운영 관측성 부족:
   - 수집 run 단위 상태/건수/오류를 저장하는 테이블 또는 표준 로그 스키마 부재

## Alternatives
1. API-First (Recommended):
   - 공식 API를 1차 소스로 사용하고, 실패 또는 빈 결과일 때만 scraping fallback 실행
   - 장점: 법적/운영 안정성, 파싱 난이도 낮음
   - 단점: API 결측 구간 존재
2. Scrape-First:
   - 웹 소스를 주 소스로 사용하고 API는 보강용
   - 장점: 커버리지 확장
   - 단점: 구조 변경에 취약, 품질 변동성 큼
3. Hybrid with Quality Gate:
   - API + Scraping 병합 후 신뢰도 점수/중복해시 기준으로 최종 적재
   - 장점: 커버리지와 정확도 균형
   - 단점: 구현/운영 복잡도 상승

## Action Items
[ ] `scripts/*.mjs` 및 `supabase/functions/*`의 모든 하드코딩 키 fallback을 제거하고, 환경변수 누락 시 즉시 실패하도록 변경한다.
[ ] `events` 업서트 제약을 정식 migration으로 통합한다(Partial Index -> 명시적 UNIQUE 제약) 후 기존 보정 SQL(`fix_events_upsert_constraint.sql`)을 흡수한다.
[ ] 수집 스키마를 정렬한다: `source` 컬럼 도입 또는 `notifications.ts` 필터를 현재 스키마 기준으로 수정해 수집 데이터와 소비 쿼리 불일치를 제거한다.
[ ] `external_resource_id` 생성 규칙을 안정화한다(소스명+원본ID/URL+정규화날짜의 deterministic hash).
[ ] API-First 실행 정책을 워크플로우에 반영한다: 1차 API 수집 결과가 임계치 미만일 때만 scraping fallback을 실행한다.
[ ] 수집 run 메타를 저장하는 `ingestion_runs`(또는 동등 로그 테이블)와 결과 요약 로깅(성공/실패/중복/신규 건수)을 추가한다.
[ ] 파서 품질을 강화한다: 날짜 정규화의 연도 하드코딩 제거, regex/LLM fallback 실패 케이스 테스트 fixture를 추가한다.
[ ] 카테고리-캘린더 매핑을 이름 기반 fuzzy 매칭이 아닌 고정 키 기반 매핑으로 전환한다(카테고리 slug/code 도입).
[ ] stale 데이터 정리 정책을 정의한다(취소/종료 이벤트 soft delete 또는 `last_seen_at` 기반 비활성화).

## Validation
[ ] 동일 입력으로 2회 수집 시 신규 insert가 0건이어야 한다(완전 idempotent).
[ ] 키 누락 환경에서 스크립트/함수가 "실패"해야 하며, 기본 키로 동작하면 안 된다.
[ ] 알림 동기화(`syncInterestNotifications`)가 수집된 관심사 이벤트를 실제로 조회/스케줄링해야 한다.
[ ] API 장애 시 fallback 동작이 수행되고, run 로그에 원인/경로가 기록되어야 한다.
[ ] staging에서 7일 연속 배치 실행 시 P1 데이터 품질 이슈(대량 중복/잘못된 날짜) 0건을 유지해야 한다.

## Open Questions
- `events.source`를 추가할지, 아니면 기존 필드를 활용해 알림 쿼리를 재설계할지 결정이 필요함.
- scraping 사용 범위(법적/운영 허용 도메인)를 어디까지로 제한할지 정책 확정이 필요함.
