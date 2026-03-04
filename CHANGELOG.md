# Changelog

모든 주요 변경사항은 이 파일에 기록됩니다.
형식: [Keep a Changelog](https://keepachangelog.com/ko/1.1.0/) 기반

> **문서 관리 규칙**
> - `CHANGELOG.md`: 매 수정 작업마다 변경 이력 기록 (이 파일)
> - `research.md`: 프로젝트 전체 아키텍처 스냅샷 (대규모 구조 변경 시에만 갱신)
> - `CLAUDE.md`: AI 에이전트용 개발 지침 (규칙/절차 변경 시에만 갱신)

---

## [Unreleased]

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
