# 음성 인식 파이프라인 안정화 계획 (Voice Pipeline Stability Plan)
업데이트: 2026-01-26
Master Plan: 이 문서는 음성 파이프라인의 단일 참조 문서입니다.

## 0. 범위/목표
- Local STT 안정화, Whisper 폴백, CONFIRM_TEXT UX, 정규화(ITN) 품질, 로깅/테스트 체계화
- 사용자 흐름을 깨지 않으면서 오류를 격리하고, 안정적으로 재시작 가능한 상태로 복원

## 1. 증상 요약
- "다시 말하기"가 간헐적으로 실패하거나, 연속으로 code 5/11 오류가 발생함.
- Final 결과가 나온 뒤에도 Local STT 오류가 계속 발생하며 ERROR/QUALITY_FAIL로 전환됨.
- 짧은 텍스트/빈 텍스트로 short_text 로그가 찍히는 케이스가 존재.

## 2. 원인 후보 (코드베이스 기반 분석)
1) **Final 이후에도 Local STT가 계속 살아있음**
   - `onSpeechResults`에서 Final 수신 후 `VoiceService`의 내부 상태가 계속 `RECORDING_LOCAL`.
   - `validateAndFinishLocal()`은 UI 상태만 `CONFIRM_TEXT`로 변경하고, STT 세션을 종료하지 않음.
   - 그 사이 발생한 code 5/11이 `onSpeechError`에서 ERROR 처리되어 UI가 깨짐.

2) **VoiceService 상태와 UI 상태가 분리되어 충돌**
   - VoiceService는 `onStateChange`로 `ERROR` 전환.
   - UI는 `CONFIRM_TEXT`로 유지하려 하지만 오류 이벤트가 덮어씀.

3) **재시작 시 레이스 컨디션**
   - `safeRestartLocalSTT()`가 즉시 cancel/stop 후 짧은 시간 내 start 호출.
   - Final 타이머(1.2s)와 재시작 호출이 겹치면 이벤트 순서가 꼬임.

4) **오류 이벤트와 정상 종료 이벤트 구분 부족**
   - code 11(no match) / code 5(client error)는 "재시작 과정"에서 자주 발생.
   - 현재는 suppress 로직이 있지만, 상태 전환과 로깅은 여전히 발생 가능.

## 3. 작업 계획

### Phase 1: Critical Fixes 🔴

#### Task 1.1: Whisper API 연동
- `handleStopWhisper()` 수정: Whisper URI 획득
- `OpenAIService.transcribeAudio()` 호출 추가
- 결과 텍스트로 `processVoiceText()` 연결
- 에러 처리 (`api_error` 로깅)
- 검증: "정밀 인식" 버튼으로 Whisper 분석 성공
- 추가 의견: Whisper 실패 시 UI가 안정적으로 Local STT로 복귀하도록 폴백 흐름을 명시 (사용자 안내 포함)

#### Task 1.2: CONFIRM_TEXT UI 구현
- `universal.tsx` render에 `CONFIRM_TEXT` 조건 추가
- `TextInput` (multiline, editable) 추가
- "승인하고 분석" 버튼 연결
- "다시 말하기" 버튼 연결
- 스타일링 (기존 디자인 시스템)
- 검증: `CONFIRM_TEXT` 화면에서 텍스트 수정 가능
- 추가 의견: 텍스트가 공백/최소 길이일 때 안내 문구 표시 및 분석 버튼 비활성화

#### Task 1.3: 정규화 ITN 버그 수정
- `normalizeKoreanNumbers()` 보호 토큰 검토
- 단일 음절(오/이/일) 변환 조건 강화
- 테스트 케이스 작성
- 검증:
  - "오후 3시" → "오후 3시" (변환 금지)
  - "삼만 오천원" → "35000원" (변환 유지)
  - "기성이랑 밥" → "기성이랑 밥" (변환 금지)
- 추가 의견: 보호 토큰이 있는 구간은 숫자 변환 로직이 절대 관통하지 않도록 우선순위 보장

### Phase 2: Stability & Quality 🟡

#### Task 2.1: STT 세션 안정화
- Final 이후 세션 명확한 종료 로직 추가 (`stopLocalSTTForConfirm()` 등)
- 세션 토큰 도입 (레이스 컨디션 방지)
- 오류 이벤트 필터 강화 (Final/CONFIRM_TEXT 이후 code 5/11 무시)
- 상태 머신 일원화 (UI 전환 시 VoiceService 상태 명시 동기화)
- 검증: "다시 말하기" 연속 3회 성공
- 추가 의견: Final 처리 시 타이머/리스너 정리, 늦게 도착한 이벤트는 세션ID로 폐기
- 수동 확인 포인트 (포커스 진입/복귀)
  - 진입 시 1회만 세션 시작: 음성 모드 화면 진입 시 `IDLE → RECORDING_LOCAL` 흐름이 1회만 발생
  - 화면 이탈 시 정상 정리: 다른 탭/화면 이동 시 녹음/리스너 종료 및 `IDLE` 복귀
  - 백그라운드 복귀: 앱 백그라운드 → 활성화 복귀 시 `IDLE`에서 1회만 재시작
  - 중복 리스너 방지: 동일 화면에서 텍스트 입력/버튼 클릭만 했을 때 STT 재시작/중복 로그가 없어야 함
  - 확정 타이머: `RECORDING_LOCAL` 최종 결과 후 1.2초 대기 → `CONFIRM/PROCESSING` 흐름이 1회만 트리거
- 변경 영향 요약 (이번 안정화)
  - `useFocusEffect`/AppState 복귀 시 `initVoiceSession()` 재등록을 막아 중복 리스너/중복 시작/레이스 컨디션 감소
  - 타이머 종료 및 상태 동기화 콜백이 고정되어 포커스 이동/복귀 시 오래된 클로저 참조 위험 감소
  - 화면 진입/복귀 반복 시 STT가 중복 시작되거나 멈추지 않는 문제 완화

#### Task 2.2: 테스트 코드 작성
- `VoiceNormalizer.test.ts` 생성
- 숫자 정규화 테스트
- 날짜 정규화 테스트
- ITN 오류 회귀 테스트
- 상태 전환 테스트 (통합)
- 검증: 테스트 커버리지 80% 이상
- 추가 의견: Whisper 폴백 경로를 포함한 최소 1개 통합 테스트 추가

#### Task 2.3: High Confidence 자동 분석
- `validateAndFinishLocal()`에서 `isHighConfidence()` 활용
- 고신뢰 케이스 `CONFIRM_TEXT` 생략 로직
- 검증: "내일 점심 3만원" → 자동 분석
- 추가 의견: 고신뢰 판단 실패 시 항상 CONFIRM_TEXT로 수렴하도록 안전 가드 추가

### Phase 3: Monitoring & Refinement 🟢

#### Task 3.1: 로깅 표준화
- `voice_confirm` stage 구현
- `fallback_reason` 표준화
- Metadata 확장 (`original_text`, `edited_text`)
- 검증: DB 로그 구조 확인
- 추가 의견: `session_id`/`source`(local/whisper) 필드 추가로 원인 추적성 강화

#### Task 3.2: 날짜 파싱 개선
- OpenAI 프롬프트 강화 (상대 날짜 계산)
- `normalizeDateTimes()` 패턴 확장
- 검증: "다음주 금요일" → 정확한 절대 날짜
- 추가 의견: 기준 날짜/타임존을 로그에 남겨 재현 가능성 확보

#### Task 3.3: 문서 정리
- 기존 6개 계획서 아카이빙 (`docs/archive/voice/`)
- Master Plan을 단일 참조 문서로 설정
- README 업데이트

## 4. 검증 체크리스트

### 자동 테스트
- `npm test -- VoiceNormalizer.test.ts` 통과
- `npm test -- VoiceService.test.ts` 통과
- `npm test -- VoiceNormalizer.test.ts VoiceService.test.ts` 통과
- 통합 테스트 통과 (추가 후)

### 수동 테스트
- Scenario 1: Local STT → CONFIRM → 분석
- Scenario 2: Whisper 폴백
- Scenario 3: 정규화 검증
- Scenario 4: 음성 모드 포커스 진입/복귀 (Task 2.1 체크리스트 기준)

## 5. 성공 기준 (Phase 1)
- Whisper 버튼으로 정상 분석 가능
- CONFIRM_TEXT 화면에서 텍스트 수정 가능
- "오후/오전" 정규화 버그 0건
- 테스트 시나리오 3개 모두 통과

## 6. 위험/의존성
- Whisper API 장애/레이트리밋 대응 필요: 폴백 기준 및 사용자 안내 문구 확보
- 테스트 음성 샘플 부족 시 재현 난이도 상승: 샘플셋 최소 구성 필요
- 타임존 기준 미정 시 날짜 파싱 결과 불일치 가능: 기준 일자/타임존 명시 필요
