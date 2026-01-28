# Antigravity Agent Guidelines

이 파일은 AI Agent(Antigravity)가 이 프로젝트("minsim")에서 작업을 수행할 때 반드시 따라야 할 핵심 원칙과 가이드라인을 정의합니다.

## 1. 워크플로우 및 기술 규칙 (Workflow & Technical)

### 빌드 및 실행 (Build & Run)
- **Native Rebuild**: 네이티브 모듈 변경 등으로 앱을 리빌드해야 할 경우, 반드시 **`run-android-local`** 스크립트를 사용합니다.
    - ❌ `npx expo run:android` 직접 실행 금지 (환경 설정 누락 방지)
    - ✅ `.\run-android-local.bat` 실행
    - ⚠️ **Physical Device Note**: 빌드 후 폰에 설치가 안 된 경우, 수동으로 설치합니다.
        - `adb install -r android/app/build/outputs/apk/debug/app-debug.apk`
    - ℹ️ **Tunnel Mode**: 빌드 없이 JS 수정사항만 폰에서 확인하려면 `.\auto-run-tunnel.bat`을 사용합니다.

### Physical Device Debugging (Timeout & Network)
- **증상**: "Error loading app: timeout" 발생 시
- **체크리스트**:
    1. **Network Security Config**: `android/app/src/main/res/xml/network_security_config.xml` 파일에 `<base-config cleartextTrafficPermitted="true" />` 설정 확인. (설정 변경 시 **Rebuild 필수**)
    2. **Same Wi-Fi**: PC와 폰이 동일한 Wi-Fi(SSID)에 접속했는지 확인.
    3. **Firewall**: Windows 방화벽에서 Node.js/Expo 허용 여부 확인.
    4. **Troubleshooting Guide**: 상세 내용은 `troubleshooting_guide.md` 참고.

### 계획 우선 (Planning First)
- **Implementation Plan**: 에러 수정, 기능 추가/업데이트 등 모든 작업 시작 전에는 **반드시 작업 계획서(Implementation Plan)를 먼저 작성**하고 사용자의 승인을 받습니다.
    - 계획서에는 문제 원인, 수정 방안, 검증 계획이 포함되어야 합니다.

### 커뮤니케이션 (Communication)
- **Language**: 모든 설명, 업데이트 내역, 수정 제안은 **한국어(Korean)**로 작성합니다.
    - 코드 내 주석(Comments)은 문맥에 따라 영어를 사용할 수 있으나, 복잡한 로직 설명은 한국어를 권장합니다.
- **Tone**: "친절한 동료 개발자" 톤을 유지합니다.

---

## 2. 서비스 철학 (Service Philosophy)

### 정체성 (Identity)
- **"기록 앱이 아니라 생활 정리 비서입니다"**
- 사용자가 일일이 입력하는 가계부/캘린더가 아닙니다. 
- **Zero Input**: 사용자의 개입을 최소화하고, AI가 자동으로 맥락을 파악하여 정리해주는 것이 핵심 가치입니다.

### 핵심 가치 (Core Values)
1.  **AI First**: 판단은 사람이 하더라도, 정리는 AI가 먼저 끝내놓아야 합니다.
2.  **Context Aware**: 단순한 텍스트 추출을 넘어, 이것이 "어떤 의미인지"(경조사비인지, 식비인지, 모임 회비인지)를 파악해야 합니다.
3.  **Meaningful Feedback**: 로딩 중에도 "분석 중..."보다는 "의미를 찾고 있습니다", "패턴을 분석합니다"와 같이 가치 있는 피드백을 제공합니다.

---

## 3. 개발 가이드라인 (Development Guidelines)

### 비용 효율성 (Cost Efficiency)
- **OpenAI Vision 최소화**: Vision API는 비용이 높으므로 '최후의 수단(Last Resort)'으로만 사용합니다.

- **Pipeline 우선순위**:
    ```
    Regex Parsing → ML Kit → TFLite → Google Vision → OpenAI Text → OpenAI Vision
    ```
    - **TFLite**: 문서 분류(Classification) + 핵심 필드 추출(Extraction). OCR 텍스트 품질 보강에 기여.

- **Retry 정책**:
    | 단계 | 최대 Retry 횟수 |
    |------|-----------------|
    | ML Kit OCR | 2회 (해상도 변경) |
    | Google Vision | 1회 |
    | OpenAI Text | 1회 (Google Vision 재추출 후) |

- **Robust Retry**: 상위 단계에서 실패 시 바로 포기하지 말고, 저비용 도구 내에서 재시도를 우선 수행합니다.

### 타임아웃 기준 (Timeout Standards)

| 단계 | 기본 타임아웃 | 비고 |
|------|---------------|------|
| OCR (ML Kit/TFLite) | 30초 | 이미지 전처리 포함 |
| Google Vision OCR | 10초 | 네트워크 의존 |
| OpenAI Text 분석 | 60초 | Few-shot 포함 |
| OpenAI Vision 분석 | 30초 | 최후 수단 |
| DB Fetch (Few-shot) | 3초 | Fallback to static |

> **동기화 주의**: 위 값은 정책 기준이며, 실제 코드(`universal.tsx`, `OpenAIService.ts`)의 타임아웃 값과 불일치 시 **코드 기준으로 동기화**해야 합니다.

### 사용자 경험 (UX)
- **Zero Input 지향**:
    - 날짜, 금액, 카테고리 등을 사용자가 수정할 필요가 없도록 전처리/후처리 로직을 정교하게 다듬어야 합니다.
- **Fail-Safe**:
    - 네트워크 지연이나 AI 분석 실패 시에도 앱이 멈추거나 크래시되지 않도록 방어 로직을 철저히 구현합니다.
    - 실패 시에도 "재시도" 버튼이나 "직접 입력" 옵션을 자연스럽게 제공하여 경험을 끊지 않습니다.

### 코드 품질 (Code Quality)
- **Conditional Logging**: 상용 배포 시 노이즈를 줄이기 위해 로그는 `__DEV__` 조건부로 작성하거나 커스텀 로거를 경유합니다.
- **Type Safety**: TypeScript의 엄격한 타입을 준수하여 런타임 에러를 방지합니다.

### 검증 절차 (Verification)
- **변경 후 필수 확인**:
    1. 앱 실행 및 기본 스캔 테스트 수행.
    2. Metro Bundler / ADB 로그에서 에러 없음 확인.
    3. 관련 로그(`[Scan]`, `[OCR]`, `[OpenAI]`)가 정상 출력되는지 확인.
- **권장 사항**:
    - `npx tsc --noEmit`으로 TypeScript 타입 에러 없음 확인.

### 주요 에러 및 대응 (Error Handling Reference)

| 에러 메시지 | 원인 | 대응 방법 |
|-------------|------|-----------|
| `Session check timeout` | Supabase 응답 지연 | 타임아웃 연장 또는 네트워크 확인 |
| `Invalid hook call` | useRef/useState를 잘못된 위치에서 호출 | 훅을 컴포넌트 최상단으로 이동 |
| `OCR 추출 시간 초과` | ML Kit 처리 지연 | 이미지 해상도 축소 또는 재시도 |
| `OpenAI Vision 분석 시간 초과` | API 응답 지연 | 재시도 또는 텍스트 분석으로 폴백 |
| `DB Fetch Timeout` | Supabase 쿼리 지연 | 타임아웃 3초 유지, static fallback 확인 |
