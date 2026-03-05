# Changelog

모든 주요 변경사항은 이 파일에 기록됩니다.
형식: [Keep a Changelog](https://keepachangelog.com/ko/1.1.0/) 기반

> **문서 관리 규칙**
> - `CHANGELOG.md`: 매 수정 작업마다 변경 이력 기록 (이 파일)
> - `research.md`: 프로젝트 전체 아키텍처 스냅샷 (대규모 구조 변경 시에만 갱신)
> - `CLAUDE.md`: AI 에이전트용 개발 지침 (규칙/절차 변경 시에만 갱신)

---

## [Unreleased]

### Fixed
- Android dev client LAN 접속 시 `CLEARTEXT ... not permitted by network security policy` 오류 해결
  - Date: 2026-03-05
  - What: `plugins/withAndroidDebugCleartextConfig.js` 추가 + `app.json` 플러그인 등록으로 prebuild 시 `android/app/src/debug(res/xml)`, `debugOptimized(res/xml)`의 `network_security_config.xml`을 자동 생성하여 디버그 빌드 cleartext HTTP를 전역 허용.
  - Why: 물리 디바이스의 `192.168.x.x:8081` Metro 접속이 main 보안 설정(localhost/10.0.2.2만 허용) 때문에 차단되던 문제를 디버그 전용으로 해결.
- `auto-run-tunnel.bat`: ngrok timeout handling improved with deterministic fallback
  - Date: 2026-03-05
  - What: Replaced PowerShell-wrapped `npx` tunnel invocation with direct `node_modules/.bin/expo.cmd` invocation (fallback to `npx` only when local CLI is missing), and kept non-zero exit based auto-fallback to `--lan` on port `8081`. Also normalized script output to ASCII to avoid Windows console mojibake.
  - Why: Tunnel startup sometimes exits with inconsistent status; mobile dev flow should continue via LAN instead of terminating.
- `troubleshooting_guide.md`: documented stronger auto-fallback behavior
  - Date: 2026-03-05
  - What: Added note that fallback is triggered by both process exit code and timeout log text match.
  - Why: Make failure mode and recovery path explicit for faster local debugging.

### Added
- **관심(Interest) 탭 전체 개편** - 구독 vs 선택 가져오기 투트랙 기능 구현
  - Date: 2026-03-05
  - What: `app/interest/index.tsx` (관심 탐색 Discover 화면) 신설. 카테고리별 탭, 전체 구독 토글(기존 `toggleSubscription()` 재사용), 개별 일정 `[+]` 담기 버튼 구현.
  - Why: 구독 없이도 관심 일정을 쇼핑하듯 탐색하고 원하는 건만 개인 달력에 스크랩할 수 있도록 UX 개선.
- `interests.ts` - `getPublicCalendarEvents()`, `importEventToMyCalendar()` 함수 신설
  - Date: 2026-03-05
  - What: 공용 캘린더 이벤트를 구독 없이 열람하는 함수와, 단일 이벤트를 개인 `events`로 복사하는 import 함수 추가. 중복 방지를 위해 `external_resource_id` 기반 upsert 사용.
  - Why: Discover 리스트뷰에서 선택적 스크랩 기능을 지원하기 위함.
- `scripts/sync-policies.mjs` + `.github/workflows/sync-policies.yml` 신설
  - Date: 2026-03-05
  - What: 온통청년 API(청년 정책), 복지로 API(노인/육아 정책) 수집 스크립트 및 GitHub Actions 워크플로우(매주 월·목 04:30 KST 자동 실행) 구현.
  - Why: 정부지원금 정책 일정을 무료 공공 API에서 정기적으로 수집, 관심 탭에서 탐색 가능하도록 파이프라인 구축.
- `migrations/20260305_seed_policies_categories.sql` 신설
  - Date: 2026-03-05
  - What: `interest_categories`에 정부지원(청년/노인/출산육아) 루트+리프 카테고리 및 연동 공용 캘린더 생성 SQL 작성.
  - Why: 정부지원금 데이터를 카테고리별로 분류하여 구독 토글이 동작하도록 DB 기반 마련.
### Fixed
- `sync-interest-events` Edge Function의 `category: 'schedule'` 하드코딩 오류 수정 → `'interest'`
  - Date: 2026-03-05
  - What: `supabase/functions/sync-interest-events/index.ts` L168에서 `category: "interest"`로 변경.
  - Why: 지역 축제 일정이 노란색(schedule) 필터가 아닌 파란색(interest) 필터에 표시되지 않던 버그 수정.
- `events.ts` `normalizeEventCategory()` - `'interest'` 타입 이벤트 올바르게 매핑
  - Date: 2026-03-05
  - What: `festival/performance/exhibition/popup/movie/policy` 등을 `'schedule'`이 아닌 `'interest'`로 반환하도록 수정.
  - Why: DB에서 가져온 관심 이벤트가 올바른 카테고리로 매핑되지 않아 필터 칩이 동작하지 않던 문제 해결.

- 캘린더 영역 상단에 '관심' 일정 필터 칩 추가 (영화 예매, KBO 일정 조회 토글링)
  - Date: 2026-03-05
  - What: `app/calendar/index.tsx`에 `interest` 상태 및 UI 추가 완료. `flexWrap` 적용으로 5개 필터 안정적 배치 지원.
- 영화 개봉 예정일 자동 수집 파이프라인 구축 (KOBIS API + CGV Playwright, ₩0)
  - Date: 2026-03-05
  - What:
    1. `scripts/sync-movies.mjs` — KOBIS 공공 API 1순위, CGV 스크래핑 보조
    2. `.github/workflows/sync-movies.yml` — 매주 화·금 04:00 KST 자동 실행
    3. `seed_movies_categories.sql` — 영화/개봉예정 카테고리 + 캘린더 자동 생성 SQL
    4. KOBIS API 키 `.env` 등록
  - Why: 앱 관심 채널에 영화 개봉 일정을 자동으로 제공하기 위함
- `components/community/ChannelList.tsx`: 관심 채널 아코디언(접기/펼치기) UI 구현
  - Date: 2026-03-05
  - What: 루트 카테고리(예: 스포츠) 탭 시 자식 채널(KBO, EPL 등)이 아코디언으로 펼쳐지고 다시 탭하면 접히는 UI 추가. LayoutAnimation으로 부드러운 애니메이션 적용, 우측 화살표 아이콘(▼/▲) 추가.
  - Why: 모든 채널이 항상 펼쳐진 상태로 표시되어 스크롤이 길어지는 UX 문제 해결

### Fixed
- `interest_categories` DB 테이블 중복 데이터 정리 및 재발 방지 Unique Constraint 추가
  - Date: 2026-03-05
  - What: `seed_sports_categories.sql`에서 `ON CONFLICT DO NOTHING`을 사용했으나 테이블에 unique constraint가 없어 스크립트를 여러 번 실행 시 KBO, EPL, K리그 등 자식 카테고리가 2~3번 중복 삽입됨. `migrations/20260305_fix_duplicate_interest_categories.sql`로 중복 행 제거 및 `UNIQUE(name, parent_id)` constraint 추가.
  - Why: 관심 탭(채널 리스트)에서 동일 카테고리가 2~3번 중복 표시되는 UI 버그 해결
- `app/auth/login.tsx`, `app/login-callback.tsx`: 웹(Web) 환경에서 구글 로그인이 동작하지 않는 버그 수정
  - Date: 2026-03-05
  - What:
    1. `handleSocialLogin`의 `redirectTo`가 전 플랫폼에서 `haruclick://login-callback`(커스텀 딥링크 스킴)을 사용하고 있었고, `skipBrowserRedirect: true`로 고정되어 있었음.
    2. `login-callback.tsx`가 `Linking` API만으로 URL을 처리하여 웹에서 토큰을 추출하지 못했음.
  - Why: Expo Web(브라우저) 환경은 커스텀 스킴을 처리할 수 없어 OAuth 인증 후 콜백이 실패; 웹 전용 분기(`Platform.OS === 'web'`) 및 `window.location.origin` 기반 HTTPS URL로 수정하여 해결.
  - 변경 파일:
    - `app/auth/login.tsx`: `handleSocialLogin`에 `isWeb` 분기 추가, 웹 redirectTo는 `${window.location.origin}/login-callback`, `skipBrowserRedirect: !isWeb`으로 설정
    - `app/login-callback.tsx`: `handleCallback` 첫 진입 시 `Platform.OS === 'web'`인 경우 `window.location.href`에서 바로 토큰 추출하는 분기 추가, `Platform` import 추가
- `services/supabase-modules/events.ts`: `column events.region does not exist` 에러 원인 분석 및 해결 가이드 제공
  - Date: 2026-03-05
  - What: `migrations/20260304_interest_subcategory_filters.sql` 마이그레이션이 DB에 미적용된 상태에서 코드가 `region`, `detail_type` 컬럼을 조회하여 발생한 스키마 불일치 에러. 사용자에게 Supabase SQL Editor에서 마이그레이션 실행 안내.
  - Why: 관심사 필터 기능 구현 후 DB 스키마 적용이 누락되어 앱 초기화 시 에러 발생
- `services/supabase-modules/events.ts`: `console.log` 7건에 `__DEV__` 가드 추가 (CLAUDE.md §2.3 준수)
  - Date: 2026-03-05
  - What: `getUpcomingEvents` (L125), `getEvents` (L368, L388, L391, L407, L410, L426) 내 프로덕션 로그 노출 차단
  - Why: CLAUDE.md 로깅 규칙 위반으로 프로덕션 빌드에서 불필요한 디버그 로그가 출력되는 문제 해결

### Added
- `docs/plan/SPORTS_DATA_INTEGRATION_PLAN.md` 스포츠 일정 수집 계획서 업데이트 (`claude.md` 지침 준수 반영)
  - Date: 2026-03-04
  - What: 기존 KBO/EPL/MLB/NBA 등 스포츠 수집 파이프라인 계획에 `claude.md`의 필수 안정성 지침(API 8초 타임아웃, `events` 테이블 복합 유니크 키 `calendar_id` 매핑, 스크래핑 실패 시 Webhook 연동된 Fail-Safe 로직)을 추가 반영
  - Why: 자동 수집 파이프라인(GitHub Actions) 운영 중 발생 가능한 API 지연 및 DB 제약 조건 충돌 등의 사이드 이펙트를 100% 차단하기 위함

### Changed
- `docs/plan/INTEREST_SUBCATEGORY_FILTER_PLAN.md` 문서 `claude.md` 지침에 따른 AI 교차 검증 및 보완
  - Date: 2026-03-04
  - What: `research.md`, Supabase 스키마(`events`, `user_interest_subscriptions`), Edge Functions 구조 분석 후 플랜 문서에 검토 결과 (스키마/RLS 충돌 없음, 안전망 확인) 추가 반영
  - Why: 사용자의 지시에 따라 `claude.md` 자동화 룰을 준수하여 잠재적 에러나 사이드 이펙트를 100% 차단하기 위함
- `docs/plan/INTEREST_SUBCATEGORY_FILTER_PLAN.md` 문서를 최신 코드/스키마 기준으로 전면 개정
  - Date: 2026-03-04
  - What: 구버전 API 전제 제거, 현재 Supabase 구조 기반 문제 정의/설계/액션 아이템/검증/롤아웃 재작성
  - Why: 기존 계획이 현재 구현 상태와 일부 충돌하여 실행 단계에서 오류 가능성이 높았고, CLAUDE.md의 사전 검증 기준(`research.md`, `supabase/`)을 충족하도록 정렬 필요
- `docs/plan/INTEREST_SUBCATEGORY_FILTER_PLAN.md`에 정의된 구독 필터 기능(지역, 세부유형) 구현 완료
  - Date: 2026-03-04
  - What: DB 마이그레이션 (`events.region`, `events.detail_type`, `user_interest_subscriptions.active_filters` 생성)
  - What: `sync-interest-events`, `sync-culture-events` Edge Function 업데이트 (지역/세부유형 추출 로직 추가)
  - What: `services/supabase-modules/interests.ts`, `events.ts`, `notifications.ts` 업데이트 (인메모리 필터 적용 및 푸시알림 연동)
  - What: `app/settings/interests.tsx` 필터 모달 UI 구성 및 DB 업데이트 API 연결
  - Why: 캘린더 내 과도한 이벤트 피로도를 줄이고 지역 맞춤형 이벤트만 받아볼 수 있게 하기 위함

### Added
- **관심 캘린더 (Interest Calendar)** 기능 구현 (Phase 2~5 완료)
  - `migrations/20260302_v6_interest_app.sql`: 관심 카테고리, 유저 구독, 일정 댓글 테이블 및 RLS 정책 신설
  - `services/supabase-modules/interests.ts`: 관심사 트리 로드 및 구독 토글 비즈니스 로직 추가
  - `services/supabase-modules/event_comments.ts`: 실시간(Realtime) 이벤트 댓글 피드 작성/조회기능 구현
  - `services/notifications.ts`: `syncInterestNotifications()` 추가로 관심 캘린더 일정 연동 로컬 푸시 예약 엔진 구축
  - `app/settings/interests.tsx`: 트리형 계층형 UI 및 구독 토글 버튼 구현
  - `components/CommentThread.tsx`: 하단 커뮤니티 피드 리스트 및 실시간 댓글 스트리밍 View 추가
  - `components/EventDetailModal.tsx`: 관심사 일정(`source === 'interest'`) 시 하단에 피드 모달 자동 마운트
  - `supabase/functions/sync-interest-events`: 공공데이터포털(TourAPI) 기반 자동 수집용 Supabase Edge Function 세팅 (`index.ts`, `deno.json`)
- `CHANGELOG.md` 신규 생성 — 변경 이력 관리 체계 도입

---

## [2026-03-02]

### Added
- `research.md` 심층 분석 보고서 작성 및 개선
  - OCR 6단계 파이프라인 상세 도표
  - AI 분석 엔진 ScanType 8종 분류표
  - 음성 인식 상태 머신, 통합 저장 시스템, 알림 중복방지 로직
  - 문제점/개선사항 9개 항목 (Critical/Major/Minor 분류)
- `CLAUDE.md`에 프로젝트 업데이트/변경/수정 작업 지침 추가
  - 작업 전 필수 절차, 코드 작성 규칙, 파일 수정 가이드
  - 빌드 검증 체크리스트, 타임아웃 기준, 에러 대응 참조

---

<!--
## 작성 가이드

### 카테고리
- **Added**: 새로운 기능/파일
- **Changed**: 기존 기능 변경
- **Fixed**: 버그 수정
- **Removed**: 삭제된 기능/파일
- **Security**: 보안 관련 변경
- **Deprecated**: 곧 제거될 기능

### 항목 작성 예시
```
## [YYYY-MM-DD]

### Fixed
- `services/ocr.ts`: ML Kit 타임아웃 30초 → 45초로 조정 (#이슈번호)
- `app/scan/result.tsx`: 날짜 파싱 오류 수정 (음력 날짜 미처리 문제)

### Changed
- `services/ai/OpenAIService.ts`: Few-shot 로딩 캐시 전략 변경
```
-->
