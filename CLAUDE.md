# HaruClick (minsim)

AI 기반 OCR/음성 인식으로 경조사·일정을 자동 추출하여 캘린더에 등록하는 Expo 모바일 앱

---

## 🤖 AI 어시스턴트 필수 동작 지침 (자동화 룰)
**사용자가 "claude.md 지침을 준수해라"라고 단 한 줄만 명령하더라도, AI는 다음 3단계를 "반드시" 자동으로 수행해야 합니다.**
1. **사전 검토**: 코드 수정이나 플랜 업데이트 전, `research.md`(아키텍처)와 `supabase/`(DB 스키마, RLS) 코드를 스스로 검색 및 교차 검증하여 기존 시스템과의 충돌을 알아서 방지합니다.
2. **안전한 업데이트**: 검증된 바탕 위에서 구조를 깨지 않도록 플랜 파일이나 코드를 업데이트합니다.
3. **CHANGELOG 자동 기록**: 모든 작업(코드 수정, 플랜 작성 등)이 끝나면 **사용자가 묻지 않아도 스스로 `CHANGELOG.md` 파일을 수정하여 "언제(Date), 무엇을(What), 왜(Why) 바꿨는지" 기록하고 저장**해야 합니다.

---

## 🎯 핵심 기능

| 기능 | 설명 |
|------|------|
| **OCR 스캔** | 청첩장, 부고장, 영수증 등 이미지에서 일정/금액 추출 |
| **음성 입력** | 음성 → 텍스트 → 일정 변환 |
| **스마트 분류** | 결혼/장례/생일/기타 자동 분류 |
| **캘린더 연동** | 디바이스 캘린더 자동 동기화 |
| **인간관계 장부** | 경조사 주고받은 금액 관리 |

---

## 🏗️ 아키텍처

```
app/                    # Expo Router 페이지
├── _layout.tsx        # 앱 초기화, 인증, 탭 네비, 딥링크, 푸시 토큰
├── index.tsx          # 홈 (D-Day, 이벤트 타임라인)
├── scan/              # OCR/음성 입력 플로우
│   ├── universal.tsx  # 카메라/음성 입력 화면 (54KB)
│   └── result.tsx     # AI 분석 결과 편집 (128KB)
├── calendar/          # 월별 캘린더 뷰 + 공유 캘린더 + 채팅
├── relationship-ledger/  # 인간관계 장부
└── settings/          # 설정

services/               # 비즈니스 로직
├── ai/                # AI/LLM 관련
│   └── OpenAIService.ts  # GPT-4o 분석 (핵심 ⭐, 61KB)
├── supabase-modules/  # DB CRUD 모듈
│   ├── events.ts      # 이벤트
│   ├── unified.ts     # 통합 저장 로직 (알림 스케줄링 포함)
│   └── ledger.ts      # 장부
├── voice/             # 음성 인식
├── ocr.ts             # OCR 파이프라인 메인 (48KB)
└── notifications.ts   # 푸시 알림

components/            # 재사용 UI 컴포넌트
constants/             # 디자인 토큰, 카테고리 정의
```

---

## 🔧 개발 명령어

```bash
# 개발 서버 (터널 모드 권장)
npm run start
.\auto-run-tunnel.bat   # ngrok 터널 자동 실행

# 안드로이드 Development Build
.\build-android-local.bat
.\run-android-local.bat

# 테스트
npm test                # Jest 유닛 테스트
npm run e2e:test        # Detox E2E 테스트
```

---

## ⚠️ 중요 규칙

### AI 서비스
- `OpenAIService.ts`가 핵심 분석 엔진
- Few-shot 예시는 Supabase `approved_fewshots` 테이블에서 동적 로드
- 음성 입력 시 `isVoiceInput: true` 플래그 전달 필수

### Supabase
- RLS(Row Level Security) 정책 활성화됨
- `services/supabase-modules/` 모듈만 DB 접근
- 환경변수: `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`

### 음성 인식
- `@react-native-voice/voice` 사용
- Expo Go에서 동작 안 함 → Development Build 필수
- 상세 로직: `services/voice/`, `VOICE_PIPELINE_STABILITY_PLAN.md`

### 알림
- `expo-notifications` 사용
- 푸시 토큰은 `push_tokens` 테이블 저장
- 알림 스케줄링은 `unified.ts`에서 처리

---

## 🚫 하지 말 것

- ❌ `is_completed` 컬럼 참조 (테이블에 없음, 과거 버그 원인)
- ❌ Expo Go에서 음성 기능 테스트
- ❌ `node_modules/` 또는 `android/` 직접 수정
- ❌ SQL 파일 직접 실행 (마이그레이션 기록 필요)

---

## 📂 핵심 파일

| 파일 | 역할 |
|------|------|
| `app/scan/universal.tsx` | OCR/음성 입력 시작점 |
| `app/scan/result.tsx` | AI 분석 결과 편집 (~2000줄) |
| `services/ai/OpenAIService.ts` | GPT-4o 분석 (~1800줄) |
| `services/ocr.ts` | OCR 파이프라인 (~1400줄) |
| `services/supabase-modules/unified.ts` | 통합 저장 로직 |

---

## 📝 AI 참고사항

- 한글 프로젝트: 변수명은 영어, 주석/UI는 한글
- `.agent/workflows/` 에 자주 쓰는 워크플로우 정의됨
- 에러 발생 시 `troubleshooting_guide.md` 먼저 확인
- 큰 파일 수정 시 반드시 빌드 테스트 (`npm run start`)

### 📄 문서 관리 규칙 (매 작업 후 반드시 준수)

| 문서 | 갱신 시점 | 역할 |
|------|-----------|------|
| `CHANGELOG.md` | **매 수정 작업마다** | 변경 이력 (언제, 무엇을, 왜) |
| `research.md` | 대규모 구조 변경 시에만 | 프로젝트 전체 아키텍처 스냅샷 |
| `CLAUDE.md` | 규칙/절차 변경 시에만 | 개발 지침 및 규칙 |

---

## 🔄 프로젝트 업데이트/변경/수정 작업 지침

이 프로젝트에서 코드를 변경하거나 기능을 추가/수정, 혹은 새로운 플랜(계획) 파일을 검토할 때 반드시 아래 지침을 따르세요.

### 1. 작업 전 필수 절차 (컨텍스트 파악 및 플랜 검토)

#### 1.1. 사용자 플랜 검토 및 계획서 작성
- **새로운 플랜 검토**: 사용자가 새로운 업데이트 플랜이나 수정 사항을 제시하면, 무작정 코딩을 시작하지 마세요.
- **필수 컨텍스트 참조**: 기존 코드베이스, `supabase/` 스키마 및 RLS 정책, 그리고 `research.md`를 자세히 읽고 플랜과 대조하세요.
- **잠재적 오류 사전 차단**: 제안된 플랜이 기존 아키텍처나 DB 구조에 충돌하지 않는지(예: 외래키 위반, 타입 불일치 등) 검토하고, 문제가 예상되면 플랜을 수정 후 사용자 승인을 받으세요.

#### 1.2. 영향 범위 파악
- 수정하려는 파일 혹은 추가하려는 기능이 기존 시스템에 미치는 영향을 코드 검색(`grep_search` 등)으로 파악하세요.
  - `services/ocr.ts` 수정 → OCR 파이프라인 전체 테스트 필요
  - `services/ai/OpenAIService.ts` 수정 → 모든 ScanType 케이스 확인
  - `services/supabase-modules/` 수정 → RLS 정책 및 DB 제약조건 영향 확인
  - `app/_layout.tsx` 수정 → 앱 전체 초기화/인증 흐름 검증

### 2. 코드 작성 규칙

#### 2.1. 언어
- 모든 설명, 업데이트 내역, 수정 제안은 **한국어**로 작성합니다.
- 코드 내 변수명은 영어, 주석은 한국어(or 영어), UI 텍스트는 한국어.

#### 2.2. 타입 안전성
- TypeScript의 엄격한 타입을 반드시 준수합니다.
- `any` 사용을 최소화하고, 새 타입 추가 시 `services/ai/OpenAIService.ts` 또는 `services/supabase-modules/types.ts`의 기존 패턴을 따릅니다.

#### 2.3. 로깅
- **프로덕션 로그 최소화**: `console.log`는 반드시 `__DEV__` 조건 하에 작성합니다.
  ```typescript
  if (__DEV__) {
      console.log('[Module] Debug info:', data);
  }
  ```
- 중요 에러만 `console.error` 또는 `console.warn`으로 남깁니다.

#### 2.4. 에러 핸들링
- 네트워크 호출, DB 쿼리, AI API 호출에는 반드시 `try-catch`를 적용합니다.
- 실패 시에도 앱이 크래시되지 않도록 **Fail-Safe** 로직을 구현합니다.
- 사용자에게는 "재시도" 또는 "직접 입력" 옵션을 항상 제공합니다.

#### 2.5. 비용 효율성 (AI 호출)
- **OpenAI Vision은 최후의 수단**으로만 사용합니다.
- AI 호출 체인: `Regex → ML Kit → TFLite → Google Vision → OpenAI Text → OpenAI Vision`
- 호출 순서를 뒤집거나 건너뛰는 변경은 반드시 사전 협의합니다.

### 3. 파일 수정 가이드

#### 3.1. 대형 파일 수정 시 주의
아래 파일들은 매우 크므로 수정 시 특별히 주의합니다:

| 파일 | 크기 | 주의사항 |
|------|------|----------|
| `app/scan/result.tsx` | 128KB | 컴포넌트 분리 고려. 전체 교체 금지 |
| `services/ai/OpenAIService.ts` | 61KB | 스키마 변경 시 모든 ScanType 호환 확인 |
| `app/scan/universal.tsx` | 54KB | 상태 관리 복잡. 부분 수정만 허용 |
| `services/ocr.ts` | 48KB | 파이프라인 순서 변경 금지 |
| `components/AddEventModal.tsx` | 62KB | 폼 검증 로직 깨뜨리지 않도록 주의 |

#### 3.2. Supabase 스키마 변경
- 모든 DB 스키마 변경은 `migrations/` 폴더에 날짜 기반 SQL 파일로 작성합니다.
  - 네이밍: `YYYYMMDD_description.sql`
- RLS 정책을 함께 추가/수정해야 합니다.
- 루트의 `.sql` 파일을 직접 실행하지 말고, `migrations/`에 통합합니다.

#### 3.3. 새 서비스 추가
- `services/` 하위에 단일 책임 파일로 생성합니다.
- DB 접근은 반드시 `services/supabase-modules/`를 거칩니다.
- 외부 API 호출 시 타임아웃을 반드시 설정합니다.

#### 3.4. 새 화면 추가
- `app/` 하위에 Expo Router 규칙에 맞게 파일을 생성합니다.
- 디자인 토큰(`constants/DesignTokens.ts`)을 사용합니다.
- 하드코딩된 색상값을 넣지 않습니다.

### 4. 빌드 및 검증

#### 4.1. 변경 후 필수 확인
1. `npm run start`로 Metro Bundler 정상 기동 확인
2. `npx tsc --noEmit`으로 TypeScript 타입 에러 없음 확인
3. 관련 로그(`[Scan]`, `[OCR]`, `[OpenAI]`, `[Notifications]`)가 정상 출력되는지 확인
4. 기본 스캔 테스트 수행

#### 4.2. 네이티브 모듈 변경 시
- 반드시 `.\run-android-local.bat` 스크립트를 사용합니다.
- ❌ `npx expo run:android` 직접 실행 금지 (환경 설정 누락 방지)
- 빌드 후 폰에 설치 안 될 시: `adb install -r android/app/build/outputs/apk/debug/app-debug.apk`

#### 4.3. 터널 모드 (Physical Device)
- JS 수정만 확인: `.\auto-run-tunnel.bat`
- "Error loading app: timeout" 발생 시 → `troubleshooting_guide.md` 참조

### 5. 타임아웃 기준

| 단계 | 기본 타임아웃 | 비고 |
|------|---------------|------|
| OCR (ML Kit/TFLite) | 30초 | 이미지 전처리 포함 |
| Google Vision OCR | 10초 | 네트워크 의존 |
| OpenAI Text 분석 | 60초 | Few-shot 포함 |
| OpenAI Vision 분석 | 30초 | 최후 수단 |
| DB Fetch (Few-shot) | 3초 | Fallback to static |

> ⚠️ 실제 코드의 타임아웃 값이 위 표와 다를 경우, **코드 기준으로 동기화**합니다.

### 6. 주요 에러 대응 참조

| 에러 메시지 | 원인 | 대응 |
|-------------|------|------|
| `Session check timeout` | Supabase 응답 지연 | 타임아웃 연장 또는 네트워크 확인 |
| `Invalid hook call` | Hook 호출 위치 오류 | 훅을 컴포넌트 최상단으로 이동 |
| `OCR 추출 시간 초과` | ML Kit 처리 지연 | 이미지 해상도 축소 또는 재시도 |
| `OpenAI Vision 분석 시간 초과` | API 응답 지연 | 재시도 또는 텍스트 분석으로 폴백 |
| `DB Fetch Timeout` | Supabase 쿼리 지연 | 타임아웃 3초 유지, static fallback 확인 |
