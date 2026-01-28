# 음성 확인 기반 분석 플로우 구현 계획서 (Voice Confirmation Flow Plan)

## 0) 목표
사용자 발화를 즉시 분석하지 않고 **확인/수정 단계를 도입**하여 정확도를 높인다.  
단, **High Confidence** 케이스는 기존처럼 자동 분석하여 속도를 유지한다.

---

## 1) 코드베이스 Reality Check (현재 상태)
- `VoiceState` 타입은 `services/voice/VoiceService.ts`에 정의되어 있으며, `CONFIRM_TEXT`는 아직 없음.
- `OcrLogger`에는 `logEvent` 같은 범용 이벤트 로거가 없음 → **새 로깅 방식 필요**.
- `validateAndFinishLocal()`은 `universal.tsx`에서 자동 분석/QUALITY_FAIL만 처리.

> **결론:** 계획을 구현하려면 상태/로직/UI/로깅을 모두 확장해야 함.

---

## 2) 상태/흐름 설계

### 2-1) 상태 정의
```
IDLE
RECORDING_LOCAL
RECORDING_WHISPER
CONFIRM_TEXT   // 신규
PROCESSING
QUALITY_FAIL
ERROR
```

### 2-2) 흐름 (변경 후)
```
RECORDING_LOCAL
  -> validateAndFinishLocal
     -> Case A: High Confidence  -> PROCESSING (자동 분석)
     -> Case B: Needs Confirmation -> CONFIRM_TEXT (수정/승인)
     -> Case C: Low Quality -> QUALITY_FAIL
```

---

## 3) High Confidence 판단 로직 (의견 반영)
기존 제안(길이/키워드/숫자/날짜)을 유지하되 **오탐 방지**를 위해 다음을 보강:

**권장 조건**
- 텍스트 길이 ≥ 6
- 날짜/시간 표현 포함 (오늘/내일/모레/요일/HH:mm 등)
- 숫자(금액/시간) 포함
- 의도 키워드 포함 (약속/결제/이체/입금/송금/예약)

**자동 분석 기준**
- 위 조건 **모두 충족** 시 자동 분석
- 하나라도 부족하면 `CONFIRM_TEXT`로 전환

> 이유: “주차장/월요병” 같은 오탐을 줄이기 위함

---

## 4) UI 설계 (CONFIRM_TEXT)
**구성**
- 제목: “인식 결과 확인”
- 입력창: `TextInput` (multiline, editable, voiceText)
- 버튼:
  - ✅ 승인하고 분석 (primary) → `processVoiceText(editedText)`
  - 🎤 다시 말하기 (secondary) → `voiceService.startLocalSTT()`
  - 정밀 인식(Whisper)으로 전환 (link)

**UX 포인트**
- 수정 시 변경 여부 표시 (예: “수정됨” 배지)
- 입력창 자동 포커스(선택)

---

## 5) 로깅 설계 (의견 반영)
`OcrLogger`에 범용 이벤트 로거가 없으므로 **Stage 기반 확장** 또는 **metadata 확장**으로 처리.

### 옵션 A) Stage 확장 (권장)
- 신규 stage 추가: `voice_confirm`
- CONFIRM_TEXT 진입:
  ```
  logger?.logStage({
    stage: 'voice_confirm',
    stageOrder: 2,
    success: true,
    fallbackReason: 'needs_confirmation',
    metadata: { original_text, normalized_text }
  });
  logger?.flush();
  ```
- 승인 시:
  - `metadata.edited_text`, `metadata.is_edited`

### 옵션 B) 기존 stage에 metadata만 추가
- `voice_local` 로그에 `needs_confirmation` 기록
- 승인 시 `voice_local` 재로그 or `voice_whisper` 유사 로그

> **추천:** 옵션 A (분석 시점 구분이 명확)

---

## 6) 구현 단계 (Action Plan)
1. **VoiceState 확장**  
   - `services/voice/VoiceService.ts`에 `CONFIRM_TEXT` 추가
2. **High Confidence 판단 함수 추가**  
   - `services/voice/VoiceNormalizer.ts`에 `isHighConfidence(text)` 추가 권장
3. **전이 로직 수정**  
   - `app/scan/universal.tsx`의 `validateAndFinishLocal()` 분기 수정
4. **CONFIRM_TEXT UI 추가**  
   - `voiceStatusContainer`에 CONFIRM_TEXT 렌더링
5. **로깅 추가**  
   - `needs_confirmation` 로그 + 수정 승인 로그 기록

---

## 7) 검증 시나리오
- **고신뢰 자동 분석**: “내일 점심 3만원 결제” → 자동 분석
- **확인 단계 진입**: “모치랑 내일 저녁” → CONFIRM_TEXT → “7시 약속” 추가 → 승인 → 분석
- **품질 미달**: “아” → QUALITY_FAIL
- **로깅 확인**: `needs_confirmation` + `voice_confirm` 로그 존재

