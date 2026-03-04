# Interest Subscription RLS Fix Plan

## Issue Summary
- 증상: 관심사 구독 토글 시 `42501 new row violates row-level security policy for table "calendar_members"` 발생.
- 재현 지점: [services/supabase-modules/interests.ts](c:/Users/petbl/minsim/services/supabase-modules/interests.ts) `toggleSubscription()`의 `calendar_members.upsert(...)`.
- 원인: 현재 `calendar_members` INSERT 정책은 owner/editor 권한 경로 중심으로 설계되어 있고([migrations/20260207_rls_recursion_fix.sql](c:/Users/petbl/minsim/migrations/20260207_rls_recursion_fix.sql)), 일반 사용자의 "interest 캘린더 self-join(viewer)" 경로가 정책에 없음.
- 추가 리스크: 구독 로직이 `calendar_members`와 `user_interest_subscriptions`를 클라이언트에서 2단계로 처리해 부분 성공(원자성 깨짐) 가능성이 있음.

## Plan
관심사 구독 경로를 "일반 캘린더 멤버 추가" 정책과 분리해, interest 전용 서버 경로(RPC)로 전환한다. 권한을 완화하기보다, `calendar_type='interest'`와 `category_id -> target_calendar_id` 매핑을 서버에서 강제해 안전하게 구독/해지를 처리한다.

## Scope
- In:
- 관심사 구독/해지 시 RLS 오류 제거
- interest 캘린더 전용 권한 모델 명확화
- 구독/멤버십 변경의 원자성 보장
- Out:
- 일반 공유 캘린더 초대/참여 정책 재설계
- 채팅/알림 전체 정책 리팩터링
- 문화행사 동기화 함수 로직 변경

## Action Items
[ ] 현행 정책과 데이터 전제 조건을 점검한다: `calendar_type='interest'`, `interest_categories.target_calendar_id`, 관련 캘린더 멤버십 상태.
[ ] 실패 시나리오를 명시적으로 문서화한다: 현재 `toggleSubscription()`의 insert/delete 순서별 부분 성공 케이스.
[ ] interest 전용 RPC 스펙을 정의한다: `subscribe_interest_category(p_category_id)` / `unsubscribe_interest_category(p_category_id)` 입력, 반환, 에러 코드.
[ ] 신규 RPC SQL 마이그레이션을 작성한다: `SECURITY DEFINER`, `search_path` 고정, `calendar_type='interest'` 검증, category-calendar 매핑 검증, 멤버십+구독 원자 처리.
[ ] 기존 `calendar_members` 정책은 유지하되, RPC 실행 경로에서만 허용되도록 직접 테이블 DML 의존을 제거한다.
[ ] 클라이언트 [services/supabase-modules/interests.ts](c:/Users/petbl/minsim/services/supabase-modules/interests.ts)를 RPC 호출 방식으로 교체하고 에러 메시지를 도메인별로 분리한다.
[ ] 회귀 영향 범위를 점검한다: `getMyCalendars()`, `syncInterestNotifications()`에서 구독 후 데이터 조회/알림 동작 확인.
[ ] 운영 점검 SQL과 런북을 추가한다: 정책 목록, 함수 존재, 구독/해지 성공/실패 케이스 검증 쿼리.

## Validation
[ ] SQL 레벨 검증: 일반 사용자가 직접 `calendar_members` INSERT 시 실패하고, RPC 경유 구독은 성공해야 한다.
[ ] 앱 레벨 검증: 관심사 구독 ON/OFF가 UI 상태와 DB(`user_interest_subscriptions`, `calendar_members`)에 일관되게 반영되어야 한다.
[ ] 회귀 검증: 일반 공유 캘린더 초대/참여(`join_calendar_by_code`) 경로가 기존과 동일하게 동작해야 한다.

## Open Questions
- interest 캘린더 구독 시 role을 항상 `viewer`로 고정할지, 카테고리별 쓰기 권한 확장 가능성을 열어둘지 결정이 필요함.
