# 음성 인식 정확도 향상 작업 계획서 (Integrated Master Plan)

## 0) 문서 목적
본 문서는 음성 입력(STT) 분석 정확도를 체계적으로 개선하기 위한 통합 계획서이다.   
사용자 피드백과 코드베이스 현황을 반영하여, **Hybrid STT(Local 우선 + Whisper Fallback) 구조의 정상화**를 최우선 과제로 삼고, 이후 **데이터 기반의 정규화 및 선순환(Flywheel)** 체계를 구축한다.

---

## 10) 음성 기능 에러 해결 및 안정화 계획 (Voice Error Fix Plan)

### 10-0) 에러 현황 분석 (핵심 2건)
**Error 1: DB 제약 조건 위반 (Critical)**  
- 에러: `new row for relation "ocr_pipeline_logs" violates check constraint "ocr_pipeline_logs_stage_check"`  
- 원인: `ocr_pipeline_logs.stage` CHECK 제약조건이 `voice_local`, `voice_whisper`를 허용하지 않음.  
- 해결: **DB 제약조건 갱신** 필요. (단, 실제로는 CHECK 제약이 아니라 **ENUM 타입**일 수 있으므로 사전 확인 필요)

**Error 2: Native Module Missing (Critical)**  
- 에러: `[TypeError: Cannot read property 'startSpeech' of null]`  
- 원인: `@react-native-voice/voice`는 네이티브 모듈 연결이 필수. 현재 실행 앱이 **Expo Go**이거나 **Development Client에 네이티브 코드가 포함되지 않은 빌드**일 가능성.  
- 해결: **Development Build 재생성** 필요. (프로젝트 가이드상 `run-android-local` 사용 권장)

---

### 10-1) 해결 단계 (Action Plan)

#### Step 1) DB 제약조건 업데이트 (SQL 실행)
**사전 확인 필요:**  
1) CHECK 제약인지 ENUM 타입인지 확인  
2) 제약 이름이 다를 수 있음  

**확인 쿼리 (권장):**
```sql
-- 제약 확인
SELECT conname, pg_get_constraintdef(c.oid)
FROM pg_constraint c
JOIN pg_class t ON c.conrelid = t.oid
WHERE t.relname = 'ocr_pipeline_logs';
```

**CHECK 제약일 경우:**
```sql
ALTER TABLE ocr_pipeline_logs DROP CONSTRAINT IF EXISTS ocr_pipeline_logs_stage_check;
ALTER TABLE ocr_pipeline_logs 
ADD CONSTRAINT ocr_pipeline_logs_stage_check 
CHECK (stage IN (
  'ml_kit', 
  'openai_text', 
  'google_vision', 
  'openai_vision', 
  'voice_local', 
  'voice_whisper'
));
```

**ENUM 타입일 경우 (대안):**
```sql
ALTER TYPE ocr_stage_enum ADD VALUE IF NOT EXISTS 'voice_local';
ALTER TYPE ocr_stage_enum ADD VALUE IF NOT EXISTS 'voice_whisper';
```

> **개선사항:** SQL은 `migrations/`로 관리하고, 운영 DB에는 **배포 전 사전 검증** 필수.

---

#### Step 2) 네이티브 빌드 수행 (Local Environment)
`@react-native-voice/voice`는 네이티브 모듈이므로 **Development Client 재빌드가 필수**.  
프로젝트 가이드에 따라 `npx expo run:android` 대신 스크립트 사용 권장.

**권장 명령어:**
```bat
.\run-android-local.bat
```

> **주의:** Expo Go에서는 동작하지 않음. 반드시 Dev Client로 실행 필요.

---

#### Step 3) 방어 코드 추가 (Optional Code Fix)
네이티브 모듈 미연결 시 앱이 크래시 나는 것을 방지하는 보호 로직 추가.

**아이디어:**
- `Voice.start()` 호출 전 모듈 존재 여부 체크  
- 없을 경우 `startWhisperRecording()`로 자동 Fallback 또는 사용자 안내  
- 실패 시 `fallback_reason: voice_init_failed` 로깅 (표준화 필요)

> **개선사항:** 보호 로직은 기능 유지보다 **크래시 방지**에 초점.

---

### 10-2) 검증 계획 (Verification)
1. **DB Insert 확인**: QUALITY_FAIL/Whisper 로그가 `ocr_pipeline_logs`에 정상 저장되는지 확인.  
2. **음성 인식 시작 확인**: "🎙 말씀해주세요" 버튼 클릭 시 크래시 없이 녹음 상태 진입.  
3. **Dev Client 확인**: Expo Go가 아닌 Dev Client 환경에서 재현 테스트.  

---

## 11) Android 빌드 에러 복구 계획서 (Manifest Merger 중심)

### 11-0) 문서 목적
Android 리빌드 실패(`:app:processDebugMainManifest`)를 재현 가능하게 진단하고,  
원인별로 복구 절차와 검증 기준을 명확히 정리한다.

---

### 11-1) 현상 요약 (실제 로그 기준)
**핵심 실패 지점**
- `Task :app:processDebugMainManifest FAILED`
- `android:appComponentFactory` 충돌:
  - `androidx.core:core:1.15.0` vs `com.android.support:support-compat:28.0.0`
- Namespace 중복 경고:
  - `com.android.support:animated-vector-drawable:28.0.0`
  - `com.android.support:support-vector-drawable:28.0.0`
  - `androidx.versionedparcelable` vs `com.android.support:versionedparcelable:28.0.0`

**비치명 경고**
- `react-native-fast-tflite` C++ `nodiscard` 경고 (빌드 실패 원인 아님)

---

### 11-2) 원인 가설 (우선순위)
1. **AndroidX와 구 Support 라이브러리 혼용**
   - `com.android.support:*` 계열이 트랜짓/직접 의존성으로 남아 있어 Manifest 병합 충돌 발생
2. **Manifest 병합 충돌 처리 미흡**
   - `android:appComponentFactory` 중복 정의를 명시적으로 덮어쓰기 하지 않음
3. **Deprecated/Legacy 의존성**
   - 오래된 라이브러리가 AndroidX 전환을 방해

---

### 11-3) 복구 단계 (Action Plan)

#### Step A) 문제 의존성 추적 (필수)
**목표:** `com.android.support:*`를 끌어오는 라이브러리를 특정  
**방법:** Gradle 의존성 트리에서 `com.android.support` 검색  
**산출물:** 문제 의존성 목록 (직접/간접 구분)

---

#### Step B) AndroidX/Jetifier 설정 확인
**목표:** AndroidX 전환 전제조건 충족  
**확인 항목 (android/gradle.properties)**
- `android.useAndroidX=true`
- `android.enableJetifier=true`

> 없으면 추가 필요. (단, Expo/React Native 권장 범위를 벗어나지 않도록 주의)

---

#### Step C) Legacy Support 라이브러리 제거/대체
**목표:** `com.android.support:*` 의존성 제거  
**전략**
- 직접 의존성 제거 → AndroidX 대응 라이브러리로 교체
- 트랜짓 의존성은 라이브러리 업데이트로 해결
- 업데이트 불가 시 대체 라이브러리 검토

---

#### Step D) Manifest 충돌 완화 (임시 또는 병행)
**목표:** `android:appComponentFactory` 충돌 방지  
**방법**
- `android/app/src/debug/AndroidManifest.xml` 또는 `android/app/src/main/AndroidManifest.xml`에 `tools:replace="android:appComponentFactory"` 적용  
- `tools` 네임스페이스 추가 필요 (`xmlns:tools="http://schemas.android.com/tools"`)

> **주의:** 근본 원인(legacy support 제거)이 우선이며, `tools:replace`는 보조 수단.

---

#### Step E) Gradle/AGP 정합성 점검
**목표:** Android Gradle Plugin/Gradle 버전과 Expo SDK 호환성 유지  
**확인 파일**
- `android/gradle/wrapper/gradle-wrapper.properties`
- `android/build.gradle`

> 버전 불일치가 있으면 Expo 권장 범위 내에서만 조정.

---

### 11-4) 검증 계획
1. **Manifest 병합 성공 여부**  
   - `:app:processDebugMainManifest` 성공 확인
2. **의존성 정합성 확인**  
   - `com.android.support:*` 의존성 제거 여부 확인
3. **런타임 확인**  
   - 앱 실행 시 크래시 없이 정상 진입

---

## 12) Android 리빌드 실패 대응 계획 (Gradle Deprecation 경고 포함)

### 12-0) 현상 요약
- 메시지: `Deprecated Gradle features were used ... incompatible with Gradle 9.0`
- 빌드 실패 로그는 **경고가 아니라 별도의 실제 에러**가 앞부분에 존재할 가능성이 큼.
- 현재 로그에는 **실제 실패 원인 라인**이 누락되어 있어 추가 로그 확보가 필요.

---

### 12-1) 원인 분석 계획 (수집 단계)
**Step A) 상세 로그 확보 (필수)**  
- `--warning-mode all`, `--stacktrace`, `--info` 옵션으로 전체 로그 재확보  
- 실패 지점의 **첫 번째 에러 라인**을 확인 (deprecated 경고는 원인 아님)

**Step B) Gradle/AGP/Expo 버전 매트릭스 확인**  
- `android/gradle/wrapper/gradle-wrapper.properties` (Gradle 버전)  
- `android/build.gradle` (AGP 버전)  
- Expo SDK/RN 버전 호환성 확인  

**Step C) 플러그인/스크립트 Deprecation 원인 파악**  
- Warning 대상 플러그인/스크립트 명시  
- 프로젝트 코드 vs 외부 플러그인 구분

---

### 12-2) 해결 단계 (Action Plan)

**Step 1) 로그 기반 원인 분기**
- **Gradle/AGP 버전 불일치**일 경우:  
  - Expo 권장 범위 내에서 Gradle/AGP 버전 정렬
- **플러그인/스크립트 deprecated 사용**일 경우:  
  - 플러그인 업데이트 또는 deprecated DSL 교체

**Step 2) 안전한 복구 시나리오**
- `node_modules` 재설치/Gradle 캐시 클린은 **원인 확인 후** 진행  
- 무작정 클린은 재현성/추적성을 저하시킬 수 있음

**Step 3) Gradle 9.0 대비 경고 정리**
- 프로젝트 내부 경고는 수정  
- 외부 플러그인 경고는 업데이트/이슈 트래킹

---

### 12-3) 검증 계획
1. **재빌드 성공 여부**: 동일 명령으로 `assembleDebug` 성공 확인  
2. **에러 재현 불가**: 동일 조건에서 오류 재발하지 않는지 확인  
3. **Deprecated 경고 감소**: `--warning-mode all`에서 경고 수 감소 또는 위치 명확화

---

### 12-4) 필요 정보 (요청)
- 실패 로그의 **최초 에러 라인 포함 전체 출력**  
- `android/build.gradle`, `android/gradle/wrapper/gradle-wrapper.properties` 버전 정보  
- 실행한 정확한 명령 (`run-android-local.bat` vs `npx expo run:android`)

---

## 13) 음성 모듈 에러 해결 계획서 (Voice Module Fix Plan, 코드베이스 반영)

### 13-0) 코드베이스 Reality Check
| 항목 | 현재 상태 | 해석/영향 |
| --- | --- | --- |
| `@react-native-voice/voice` 설치 | `package.json`에 `^3.2.4` 등록됨 | 패키지 설치 자체는 완료 상태 |
| Expo Config Plugin | `app.json`에 `@react-native-voice/voice` 플러그인 없음 | 플러그인 제공 여부에 따라 필요. 권한 주입에는 이미 영향 없음 |
| 마이크 권한(Android) | `app.json`에 `RECORD_AUDIO` 포함 | 권한 누락 가능성 낮음 |
| 마이크 권한(iOS) | `NSMicrophoneUsageDescription` 있음 | iOS 권한 누락 가능성 낮음 |
| New Architecture | `android/gradle.properties`에 `newArchEnabled=false` | New Architecture 비활성화 상태 (호환성 이슈 방지) |
| 실행 환경 | Dev Client 필요 (Expo Go 불가) | Expo Go 실행 시 100% 실패 |

---

### 13-1) 계획서 수정 포인트 (기존 계획 보완)
**A) “권한 누락”은 1차 원인에서 제외**  
- 권한은 이미 `app.json`에 등록되어 있으므로, **초기 원인 리스트에서 후순위**로 이동.

**B) “Config Plugin 추가”는 조건부로 전환**  
- `@react-native-voice/voice`가 **Expo Config Plugin을 제공할 때만** 추가.  
- 플러그인이 없으면 **추가 효과 없음** (권한 이미 존재).

**C) “New Architecture 호환성 점검”을 새로운 핵심 단계로 추가**  
- `newArchEnabled=true` 상태에서 모듈 호환성 이슈 가능.  
- 테스트 목적의 임시 비활성화(검증용) 필요.

---

### 13-2) 업데이트된 Action Plan

**Step 1) 실행 환경 검증 (필수)**
- 앱 상단에 **Development Build** 표기 확인.
- 실행 명령은 `npx expo start --dev-client` 또는 `.\run-android-local.bat`.

**Step 2) 네이티브 링크 확인 (자동 링크 검증)**
- `android/app/build/generated/rncli/src/main/java/.../PackageList.java`에 `VoicePackage` 존재 여부 확인.
- 없다면 prebuild/autolinking 실패로 분기.

**Step 3) 최소 재빌드 (권장 순서)**
- `npx expo prebuild --clean --platform android`
- `.\run-android-local.bat`
- 성공 시 로그에 `Voice` 관련 네이티브 모듈 로딩 확인

**Step 4) New Architecture 비활성화 검증 (핵심)**
- `android/gradle.properties`에서 `newArchEnabled=false`로 테스트 빌드  
- 정상 동작 시, 모듈 호환성 이슈로 판단하고 유지/대체 전략 수립

**Step 5) 플러그인 여부 확인**
- 라이브러리 문서 기준으로 Config Plugin 존재 시 `app.json`에 추가
- 없으면 이 단계는 스킵

---

### 13-3) 검증 기준
1. 앱 실행 후 **`[VoiceService] Local STT V5 started`** 로그 확인  
2. `NativeModules`에서 `Voice`가 `null`이 아닌지 확인  
3. Dev Client에서만 동작하는지 재검증 (Expo Go 실행 시 실패 확인)

---

## 14) 음성 기능 유지보수 및 안정화 체크리스트 (Voice Stabilization Checklist)
본 문서는 음성 인식 기능의 안정성을 유지하기 위해 **정기적으로(또는 리빌드 시마다)** 점검해야 할 항목을 정의한다.

### 14-1) 빌드 환경 (Build Environment)
- **Dev Client 실행 필수**: Expo Go 사용 금지. 앱 상단에 **Development Build** 표시 확인.
- **아키텍처 설정**: `android/gradle.properties`에서 `newArchEnabled=false` 유지.
- **Clean Rebuild**: 네이티브 모듈 변경 시 `npx expo prebuild --clean --platform android` 후 리빌드.

### 14-2) 권한 및 보안 (Permissions & Security)
- **Android 권한**: `app.json > android.permissions`에 `RECORD_AUDIO` 포함 확인.
- **iOS 권한**: `app.json > ios.infoPlist`에 `NSMicrophoneUsageDescription` 포함 확인.
- **네트워크 보안**: 로컬 개발 시 `app.json > android.usesCleartextTraffic=true` 유지.  
  (디버그는 `network_security_config`로 cleartext 허용 설정됨)

### 14-3) Local STT 플로우 (Local STT Flow)
- **자동 시작**: 앱 진입/복귀 시 Local STT가 즉시 시작되는가?
- **품질 분기(Quality Gate)**:
  - 짧은 단어(예: "아") 입력 시 `QUALITY_FAIL` 전환 확인.
  - **오탐 테스트는 P8(Entity Regex 튜닝) 반영 이후** 확인.
- **UI 일관성**: 대기/실패/녹음 상태에서 Whisper 전환 버튼이 접근 가능한가?

### 14-4) Whisper 폴백 (Whisper Fallback)
- **전환 동작**: **"정밀 인식(Whisper)으로 전환"** 버튼 클릭 시 Whisper 녹음 모드 진입.
- **에러 처리**: Whisper API 실패 시 `api_error` 로깅 및 재시도 옵션 제공.

### 14-5) 로깅 및 분석 (Logging & Analytics)
- **Zero Data Loss (Flush)**:
  - `short_text`, `no_entity`, `analysis_unknown` 비정상 종료에도 로그 적재.
  - `permission_denied`, `voice_error` 발생 시 `flush()` 호출 확인.
- **표준화(Normalization)**:
  - `fallback_reason`가 표준 값만 사용되는지 확인 (`permission_denied_permanent` 등 비표준 제거).

### 14-6) 로그 시그니처 (Log Signature Reference)
문제 발생 시 로그를 통해 빠르게 원인을 파악한다.

| 상태 | 예상 로그 (Success) | 에러 로그 (Failure) | 조치 |
| --- | --- | --- | --- |
| 초기화 | `[VoiceService] Local STT V5 started` | `NATIVE_MODULE_MISSING` | Dev Client 확인, Clean Rebuild |
| 권한 | 권한 요청 후 Local STT 시작 | `permission_denied` (fallback_reason) | 앱 설정 권한 확인 |
| Local | `[Voice] Local Final:` 로그 확인 | `[Voice] Local Error` 또는 `voice_error` | 발음/마이크 확인 |
| Whisper | Whisper 결과 수신 로그 | `api_error` | API Key/네트워크 확인 |

---

## 15) 날짜 파싱 정확도 개선 계획 (Date Parsing Fix Plan, 코드베이스 반영)

### 15-0) 현상 요약
- 발화: "모치랑 내일저녁 7시 약속"
- 인식 결과: **date = 2026-01-26 (오늘)**
- 기대 결과: **date = 2026-01-27 (내일)**

---

### 15-1) 코드베이스 Reality Check
| 항목 | 현재 코드 상태 | 판단 |
| --- | --- | --- |
| 상대 날짜 계산 규칙 (내일/모레/어제/다음주 등) | **OpenAIService.ts 시스템 프롬프트에 RELATIVE DATE CALCULATION 규칙 존재** | **적용됨** |
| TODAY 주입 | `TODAY = ${referenceDate}` 제공 + "Use TODAY only if no anchor date exists." | 존재하지만 상대 날짜 계산 지시 부족 |
| 상대 날짜 라벨 처리 | `"Do NOT re-interpret relative dates using TODAY. Trust the labels."` 규칙 존재 | **BLOCK 라벨이 있을 때만 유효**, 음성 입력에는 적용 어려움 |
| "내일저녁" 분리 보정 | `VoiceNormalizer.ts`에 관련 치환 없음 | **미적용** |
| task.md(P15) 관리 | `task.md` 없음 | **미적용** |
| 붙여쓰기 상대 날짜 ("다음주 금요일") | `VoiceNormalizer.normalizeDateTimes`에 `다음주/지난주/저번주` 보정 없음 | **미적용** |

**결론:** 프롬프트 강화/정규화 보정이 코드에 반영되지 않았고,  
현행 규칙은 **BLOCK 라벨 기반**이어서 음성 입력의 상대 날짜 처리에 약하다.

---

### 15-2) 업데이트된 Action Plan

**Step 1) OpenAI System Prompt 강화 (필수)**
- EXTRACTION RULES > WHEN 섹션에 **상대 날짜 계산 규칙** 추가:
  - "내일" = TODAY + 1 day
  - "모레" = TODAY + 2 days
  - "어제" = TODAY - 1 day
  - "다음 주 [요일]" = TODAY 기준 다음 주 해당 요일
  - "내일 저녁"처럼 **시간 결합형 표현도 절대 날짜/시간으로 변환**
- 기존 `"Do NOT re-interpret relative dates using TODAY"` 규칙과 충돌하지 않도록  
  **"BLOCK 라벨이 없는 경우에는 상대 날짜를 TODAY 기준으로 계산"** 문구 추가

**Step 2) Normalizer 보정 (선택)**
- `VoiceNormalizer.normalizeDateTimes`에 붙여쓰기 보정 추가:
  - `/내일저녁/g -> '내일 저녁'`
  - `/오늘저녁/g -> '오늘 저녁'`
  - `/다음주/g -> '다음 주'`, `/지난주/g -> '지난 주'`, `/저번주/g -> '저번 주'`
  - 필요 시 `/내일아침/, /내일오전/, /내일오후/` 등 확장

**Step 3) 검증**
- "모치랑 내일저녁 7시 약속" → `date=2026-01-27 19:00` 출력 확인
- "다음주 금요일 오후 5시 김재근 결혼식" → **2026-02-06 금요일 17:00** 출력 확인

---

### 15-3) 예상 효과
- 자연어 상대 날짜(내일/모레/다음주) 인식률 개선
- TODAY로 잘못 매핑되는 오류 감소
---

<!-- Removed duplicate maintenance checklist: consolidated into section 14 -->

---

## 16) 음성 확인 기반 분석 플로우 (UI/상태 설계 + 로깅)
목표: **말 끝 즉시 자동 분석** 대신, **텍스트 확인 → 수정 → 승인 후 분석**으로 정확도와 신뢰도를 향상한다.  
단, **고신뢰 케이스는 자동 분석 유지**하여 속도 저하를 최소화한다.

### 16-1) UI/상태 설계
**상태 정의 (추가/정리)**
- `RECORDING_LOCAL`: 로컬 STT 진행 중 (실시간 텍스트 프리뷰)
- `QUALITY_FAIL`: 품질 미달/엔티티 불명확 (재시도/Whisper 안내)
- `CONFIRM_TEXT` (신규): 최종 텍스트 확인/수정 화면
- `PROCESSING`: 승인 후 분석 진행
- `ERROR`: 시스템 오류

**화면 구성**
- **CONFIRM_TEXT 화면**
  - 상단: "인식 결과 확인" 메시지
  - 본문: 편집 가능한 텍스트 입력(voiceText)
  - 하단 버튼:  
    - "승인하고 분석" (primary)  
    - "다시 말하기 (Local)" (secondary)  
    - "정밀 인식(Whisper)으로 전환" (link/button)

**전환 규칙**
- Local STT 최종 결과 수신 →  
  - **고신뢰**: 자동 분석 (`PROCESSING`)  
  - **중립/애매**: `CONFIRM_TEXT` 진입  
  - **품질 미달**: `QUALITY_FAIL`

**고신뢰 조건 (예시)**
- `VoiceNormalizer.isEntityLike()` = true  
- 텍스트 길이 ≥ 4  
- 숫자 + 날짜(또는 시간) 동시 포함

---

### 16-2) 로깅 플로우
**핵심 원칙**
- 자동 분석이 아닌 경우에도 **확인 단계 진입 로그**를 남긴다.
- 사용자가 수정한 텍스트는 **정답 후보**로 저장 가능하도록 메타데이터로 기록한다.

**로그 이벤트 설계 (예시)**
- `voice_local` 단계
  - 성공: `success=true`, `metadata.original_text`, `metadata.normalized_text`
  - `fallback_reason`:
    - `short_text`, `no_entity` → `QUALITY_FAIL`
    - `needs_confirmation` → `CONFIRM_TEXT` 진입 (신규)

- `voice_confirm` (신규 단계)  
  - 사용자 확인 진입 시 로그  
  - `metadata.edited_text` (사용자 수정 시)

- `voice_processing`
  - 승인 후 분석 시작 로그

**Flush 규칙**
- `CONFIRM_TEXT` 진입 시점에 **1차 flush**  
- 승인 후 분석 성공/실패 시 **최종 flush**

---

### 16-3) 검증 시나리오
1. **고신뢰 자동 분석**: "내일 점심 3만원" → 자동 분석 진행
2. **확인 단계 진입**: "모치랑 내일저녁 7시 약속" → CONFIRM_TEXT에서 수정/승인
3. **수정 반영**: 사용자가 텍스트 수정 후 승인 → 수정 텍스트로 분석
4. **로깅 확인**: `needs_confirmation`, `voice_confirm` 로그가 DB에 적재
