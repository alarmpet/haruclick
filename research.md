# HaruClick (minsim) 프로젝트 코드베이스 심층 분석 보고서

> **최종 분석일**: 2026-03-02
> **버전**: Expo SDK 54 / React Native 0.81.5 / Supabase JS 2.90.1

본 보고서는 `minsim` 폴더 내의 전체 코드베이스를 분석하여 애플리케이션의 아키텍처, 주요 워크플로우, 서브시스템 간의 상호작용 및 세부 동작 원리, 그리고 **발견된 문제점과 개선사항**을 종합적으로 파악한 결과를 담고 있습니다.

---

## 1. 프로젝트 개요 및 아키텍처

**HaruClick (하루클릭)**은 사용자의 개입을 최소화(Zero Input)하여 청첩장, 부고장, 영수증 등을 스캔하고 자동으로 일정과 지출(경조사비 등)을 관리해 주는 AI 기반 스마트 캘린더 및 관계 정리장 앱입니다.

| 계층 | 기술 스택 | 비고 |
|------|-----------|------|
| **Frontend** | React Native (Expo SDK 54), Expo Router, TypeScript | Pretendard 폰트·디자인 토큰 기반 UI |
| **Backend (BaaS)** | Supabase (PostgreSQL, Auth, Storage, Realtime) | RLS 전면 적용 |
| **AI/ML** | OpenAI GPT-4o, Google Vision API, ML Kit, TFLite | 비용 계단식 Fallback |
| **음성** | @react-native-voice/voice, Whisper (Fallback) | 온디바이스 우선 |
| **테스트** | Jest, Detox, Playwright (Python) | 유닛 + E2E |

### 핵심 설계 철학
- **"기록 앱이 아니라 생활 정리 비서"**: 사용자가 직접 입력하지 않아도 AI가 자동으로 맥락을 파악하여 정리.
- **AI First**: 판단은 사람이, 정리는 AI가 먼저 완료.
- **Context Aware**: 단순 텍스트 추출이 아니라 "이것이 어떤 의미인지" 파악.
- **비용 효율성**: `Regex → ML Kit → TFLite → Google Vision → OpenAI Text → OpenAI Vision` 순으로 저비용 우선.

---

## 2. 프로젝트 폴더 구조 및 역할

```
minsim/
├── app/                          # Expo Router 페이지 (라우팅)
│   ├── _layout.tsx              # 🔑 앱 초기화, 인증, 탭 네비게이션, 딥링크, 푸시 토큰
│   ├── index.tsx                # 홈 대시보드 (D-Day, 통계, 타임라인)
│   ├── auth/                    # 소셜 로그인 (네이버, 카카오, 구글)
│   ├── scan/                    # OCR/음성 입력 플로우
│   │   ├── index.tsx            # 스캔 진입점 (카메라/갤러리)
│   │   ├── universal.tsx        # 🔑 통합 스캔/음성 UI (54KB, 핵심 화면)
│   │   └── result.tsx           # 🔑 AI 분석 결과 편집/확인 (128KB, 가장 큰 파일)
│   ├── calendar/                # 캘린더 뷰 + 공유 캘린더 + 그룹 채팅
│   ├── relationship-ledger/     # 인간관계 장부 (경조사 주고받기)
│   ├── history/                 # 이벤트 내역
│   ├── stats/                   # 통계/리포트
│   ├── community/               # 커뮤니티 기능
│   └── settings/                # 설정 (8개 하위 파일)
│
├── services/                     # 비즈니스 로직 (32개 파일 + 3개 디렉토리)
│   ├── ai/                      # AI/LLM 관련 (7개 파일)
│   │   ├── OpenAIService.ts     # 🔑 GPT-4o 분석 엔진 (61KB, 1308줄)
│   │   ├── AnalysisEngine.ts    # 분석 결과 후처리
│   │   ├── ConfidenceCalculator.ts  # 신뢰도 계산
│   │   ├── OcrFeedbackService.ts    # OCR 피드백 루프
│   │   ├── FewShotQualityFilter.ts  # Few-shot 품질 필터
│   │   ├── PromptTemplates.ts   # 프롬프트 템플릿
│   │   └── TestSamples.ts       # 테스트 샘플 데이터
│   ├── supabase-modules/        # DB CRUD 모듈 (9개 파일)
│   │   ├── unified.ts           # 🔑 통합 이벤트 저장 + 알림 스케줄링
│   │   ├── events.ts            # 이벤트 CRUD
│   │   ├── calendars.ts         # 캘린더/공유 관리
│   │   ├── chat.ts              # Realtime 그룹 채팅
│   │   ├── ledger.ts            # 경조사 장부
│   │   ├── relationship-ledger.ts   # 관계 기반 장부
│   │   ├── stats.ts             # 통계 쿼리
│   │   ├── client.ts            # Supabase 클라이언트 + 캐시
│   │   └── types.ts             # 공용 타입
│   ├── voice/                   # 음성 인식 (2개 파일)
│   │   ├── VoiceService.ts      # 음성 STT 상태 머신
│   │   └── VoiceNormalizer.ts   # 한국어 자연어 정규화
│   ├── ocr.ts                   # 🔑 OCR 파이프라인 메인 (48KB, 1278줄)
│   ├── GoogleVisionService.ts   # Google Vision API 호출
│   ├── TFLiteService.ts         # TensorFlow Lite 분류/추출
│   ├── ImageClassifier.ts       # 이미지 분류
│   ├── CategoryClassifier.ts    # 카테고리 자동 분류
│   ├── CategoryValidator.ts     # 카테고리 검증
│   ├── RecommendationEngine.ts  # 🔑 경조사비 AI 추천 (22KB)
│   ├── ReciprocityEngine.ts     # 상호호혜성 계산
│   ├── notifications.ts         # 푸시 알림 (중복방지 포함)
│   ├── OcrLogger.ts             # OCR 로깅 (DB 적재)
│   ├── piiMasking.ts            # PII 마스킹
│   └── ... (기타 보조 서비스)
│
├── components/                   # UI 컴포넌트 (21개 파일 + 3개 디렉토리)
│   ├── AddEventModal.tsx        # 이벤트 추가 모달 (62KB)
│   ├── EventDetailModal.tsx     # 이벤트 상세 모달 (23KB)
│   ├── EventTimeline.tsx        # 타임라인 뷰
│   ├── RecommendationTable.tsx  # 추천 금액 표시
│   ├── scan/                    # 스캔 관련 컴포넌트
│   ├── home/                    # 홈 화면 컴포넌트
│   └── chat/                    # 채팅 컴포넌트
│
├── constants/                    # 상수 및 디자인 토큰
│   ├── DesignTokens.ts          # 색상·타이포·간격·모션 토큰
│   ├── Colors.ts                # 기본 색상 상수
│   ├── categories.ts            # 카테고리 체계 (경조사·생활·금융 등)
│   └── LoadingTips.ts           # 로딩 중 표시할 의미 있는 팁
│
├── contexts/                     # React Context
│   └── ThemeContext.tsx          # 다크/라이트 테마
│
├── migrations/                   # Supabase DB 마이그레이션 (17개 SQL 파일)
├── plugins/                      # Expo 빌드 플러그인
├── scripts/                      # 빌드/배포 스크립트
├── e2e/                          # E2E 테스트 (Detox + Playwright)
└── __tests__/                    # Jest 유닛 테스트
```

---

## 3. 핵심 기능 워크플로우 심층 분석

### 3.1. 지능형 OCR 파이프라인 (`services/ocr.ts`, 1278줄)

이 앱의 핵심은 문서에서 정보를 추출하는 **6단계 파이프라인**으로, 비용 효율성과 정확도를 극대화합니다.

#### 파이프라인 단계별 상세

| 단계 | 함수명 | 설명 | 타임아웃 |
|------|--------|------|----------|
| **1. 적응형 전처리** | `preprocessImage()`, `buildAdaptiveVariants()` | 이미지 종류(사진/스크린샷)에 따라 해상도·방향 변환 조합 생성 | - |
| **2. 스코어링** | `scoreOcrText()` | 추출된 텍스트의 품질을 점수화 (한글 비율, 키워드 존재 등) | - |
| **3. 오류 보정** | `correctOcrTypos()`, `reconstructColumnarLayout()` | OCR 오탈자 자동 교정 + 결제앱 열 레이아웃 재구성 | - |
| **4. 날짜 파싱** | `preprocessRelativeDates()` | "어제", "내일모레" 등 상대 날짜를 절대 날짜로 변환 (앵커 기반) | - |
| **4.5. 고급 전처리** | `performAdvancedPreprocessing()` | Deskew(기울기 보정) + ROI(관심 영역) 추출 | - |
| **5. 채팅 전처리** | `preprocessChatScreenshotOcrText()` | 채팅 스크린샷의 메시지 블록을 분리하여 시간 정보 복원 | - |

#### 메인 파이프라인 흐름 (`extractTextFromImage()`)

```
이미지 → 캐시 확인 → 적응형 변환 생성 → ML Kit OCR (각 변환) → 스코어링
                                                      ↓
                                            [Score ≥ 기준] → 오류 보정 → 날짜 파싱 → 반환
                                            [Score < 기준]
                                                      ↓
                                 고급 전처리 (Deskew+ROI) → ML Kit 재시도
                                                      ↓
                                            [Score ≥ 기준] → 반환
                                            [Score < 기준]
                                                      ↓
                                         Google Vision API 호출 → 반환
```

### 3.2. AI 분석 엔진 (`services/ai/OpenAIService.ts`, 1308줄)

OCR로 추출된 텍스트를 GPT-4o로 구조화합니다.

#### 지원 문서 타입 (ScanType)

| 타입 | 설명 | 추출 필드 |
|------|------|-----------|
| `INVITATION` | 청첩장/초대장 | 일시, 장소, 주소, 주최자, 추천 금액, 계좌번호 |
| `OBITUARY` | 부고장 | 고인, 관계, 장례식장, 일시, 추천 금액 |
| `BANK_TRANSFER` | 은행 이체/입금 | 금액, 입출금 구분, 대상, 잔액, 은행명, 카테고리 |
| `STORE_PAYMENT` | 매장 결제 | 가맹점, 금액, 카테고리, 결제수단, 승인번호 |
| `BILL` | 청구서 | 제목, 금액, 납부기한, 가상계좌 |
| `SOCIAL` | 모임비 | 금액, 장소, 참석자, 1인당 금액 |
| `APPOINTMENT` | 약속/일정 | 제목, 장소, 메모 |
| `UNKNOWN` | 분류 불가 | - |

#### Few-shot 동적 로딩 시스템
- Supabase `approved_fewshots` 테이블에서 실시간 예시 로드
- 세션 레벨 캐시로 API 호출 최소화
- `FewShotQualityFilter.ts`로 품질 필터링
- 폴백: Static 예시 사용 (DB 조회 실패 시)

### 3.3. 음성 인식 파이프라인 (`services/voice/`)

#### VoiceService 상태 머신 (State Machine)

`VoiceService.ts`는 다음 7개 상태를 관리합니다:
- `IDLE` → `RECORDING` → `PROCESSING` → `CONFIRMING` → `IDLE`
- 오류 시: `ERROR` → 자동 `safeRestartLocalSTT()`

#### 이중 Fallback 전략
1. **Primary**: `@react-native-voice/voice` (네이티브 STT, 온디바이스)
2. **Fallback**: `expo-av` 녹음 → Whisper API 전송 → 텍스트 반환

#### VoiceNormalizer 처리 범위
- 한국어 숫자 표현: "삼만원" → 30000, "오천" → 5000
- 상대 날짜: "내일", "모레", "다음주 토요일" → 절대 날짜
- 시간 표현: "오후 세시" → 15:00

### 3.4. 통합 이벤트 저장 시스템 (`services/supabase-modules/unified.ts`)

모든 스캔/음성 결과는 `saveUnifiedEvent()` 함수를 통해 **단일 진입점**으로 저장됩니다.

```
ScannedData → 날짜 정규화(toISODate) → 카테고리 그룹 분류(determineCategoryGroup)
                                  → Supabase events 테이블 INSERT
                                  → 알림 스케줄링 (scheduleEventNotification)
                                  → 관계 장부 기록 (경조사 유형일 경우)
```

### 3.5. 알림 시스템 (`services/notifications.ts`)

- `expo-notifications` 동적 import (Expo Go 호환)
- **중복 방지**: `eventId` 기반 식별자 + 이미 스케줄된 알림 검사
- **과거 시점 방어**: 트리거 시간이 과거이면 자동 스킵
- **플랫폼 분기**: Web은 콘솔 로그, 네이티브는 실제 알림

### 3.6. 앱 초기화 및 인증 (`app/_layout.tsx`, 518줄)

- **탭 네비게이션**: 홈, 캘린더, 스캔, 관계장부, 설정 (5탭)
- **인증 흐름**: Supabase Auth 세션 체크 → 타임아웃 3초 → 미인증 시 로그인 화면
- **딥링크 처리**: `handleDeepLink()` - OAuth 콜백 URL에서 액세스 토큰 추출
- **푸시 토큰**: 로그인 성공 시 자동 등록 및 DB 저장

### 3.7. 경조사비 추천 엔진 (`services/RecommendationEngine.ts`, 22KB)

과거 지불 이력·관계 유형·지역 평균을 종합하여 AI가 적정 경조사비를 자동 추천합니다.

### 3.8. 카테고리 체계 (`constants/categories.ts`)

모든 이벤트는 3단계 카테고리로 분류됩니다:
- **카테고리 그룹** (CategoryGroupType): 경조사, 생활, 금융, 일정 등
- **카테고리**: 결혼, 장례, 생일, 식비, 교통 등
- **서브카테고리**: 세부 분류

---

## 4. 백엔드 시스템 및 보안

### 4.1. Supabase RLS (Row Level Security)
- `migrations/` 폴더에 17개 마이그레이션 파일로 스키마 관리
- 모든 테이블에 RLS 적용: 본인 데이터 + 공유 그룹 내 데이터만 접근 가능
- `20260225_fix_security_warnings.sql`: 보안 경고 대응 패치 적용됨

### 4.2. PII Masking (`services/piiMasking.ts`)
- AI 서비스 전달 시 민감 정보(이름, 계좌번호 등) 마스킹

### 4.3. OCR 로깅 시스템 (`services/OcrLogger.ts`, 9.6KB)
- 모든 OCR 처리 과정과 결과를 `ocr_logs` 테이블에 적재
- 단계별 소요 시간, 성공/실패, 에러 메시지 기록
- 품질 개선을 위한 피드백 루프 구축

### 4.4. 환경 변수

| 변수 | 용도 |
|------|------|
| `EXPO_PUBLIC_SUPABASE_URL` | Supabase 프로젝트 URL |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Supabase 익명 키 |
| `EXPO_PUBLIC_OPENAI_API_KEY` | OpenAI API 키 |
| `EXPO_PUBLIC_GOOGLE_CLOUD_API_KEY` | Google Cloud Vision API 키 |

---

## 5. 발견된 문제점 및 개선사항

### 5.1. 🔴 심각도 높음 (Critical)

| 항목 | 문제 | 개선 방향 |
|------|------|-----------|
| **거대 파일** | `result.tsx` (128KB), `OpenAIService.ts` (61KB), `universal.tsx` (54KB), `ocr.ts` (48KB) 등 단일 파일이 지나치게 비대 | 책임 분리를 위한 리팩토링: 타입 분리, 유틸 함수 모듈화, UI 서브컴포넌트 분리 |
| **API 키 노출 위험** | `EXPO_PUBLIC_*` 접두어는 클라이언트 번들에 포함됨 → OpenAI API 키가 앱 번들에 노출 가능 | Edge Function 또는 서버 프록시를 통한 API 호출로 전환 |
| **타임아웃 불일치** | `agent.md`의 정책 타임아웃과 실제 코드(`universal.tsx`, `OpenAIService.ts`)의 값이 다를 수 있음 | 타임아웃 상수를 한 곳에 중앙 관리 (예: `constants/timeouts.ts`) |

### 5.2. 🟡 심각도 중간 (Major)

| 항목 | 문제 | 개선 방향 |
|------|------|-----------|
| **에러 핸들링 일관성** | 함수별 에러 처리 방식이 다름 (`try-catch`, `console.error`, `throw`) | 중앙 에러 핸들링 미들웨어 도입 (`services/errorHandler.ts` 확장) |
| **로깅 기준 부재** | 일부 함수에 `console.log`가 프로덕션에도 출력됨 | 모든 로그를 `__DEV__` 조건부 또는 커스텀 로거를 거치도록 통일 |
| **SQL 파일 산재** | 프로젝트 루트에 25개 이상의 `.sql` 파일이 분산 | `migrations/` 디렉토리로 통합 이관 |
| **캐시 전략 부재** | `ocrCache`는 있으나 API 응답/통계 등의 캐시는 미비 | `supabase-modules/client.ts`의 캐시를 전면 확대 |

### 5.3. 🟢 심각도 낮음 (Minor)

| 항목 | 문제 | 개선 방향 |
|------|------|-----------|
| **TypeScript strict** | `tsconfig.json`에 strict 모드 미활성화 가능성 | `strict: true` 활성화 및 점진적 타입 오류 해결 |
| **테스트 커버리지** | `__tests__` 내 6개 파일, 핵심 서비스 유닛 테스트 부족 | `OpenAIService`, `ocr.ts`, `VoiceNormalizer` 유닛 테스트 확대 |
| **접근성** | UI 컴포넌트에 `accessibilityLabel` 미적용 | 주요 버튼·입력 필드에 접근성 레이블 추가 |
| **디자인 토큰 미적용** | 일부 스타일에 하드코딩된 색상값(예: `'#00B8B8'`, `'rgba(0,100,100,0.35)'`) 존재 | `DesignTokens.ts` 변수로 통일 |

---

## 6. 종합 결론

하루클릭은 모바일 프론트엔드부터 AI 구조화 논리, 모듈화된 백엔드까지 **책임 분리가 견고한 완성도 높은 시스템**입니다. 특히 OCR 파이프라인의 6단계 계단식 Fallback 구조와 Few-shot 동적 로딩은 실용적이고 비용 효율적인 설계입니다.

다만, 핵심 파일들의 비대화와 API 키 보안 이슈는 서비스 확장 시 반드시 해결해야 할 기술 부채이며, 타임아웃 중앙 관리·에러 핸들링 통일·테스트 확대를 순차적으로 진행하면 서비스 안정성이 크게 향상될 것입니다.
