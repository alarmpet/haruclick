# 하루클릭 (HaruClick)

> AI 기반 경조사 관리 및 스마트 캘린더 앱

**하루클릭**은 청첩장, 부고장, 영수증 등을 스캔하여 자동으로 일정과 지출을 관리하는 React Native 앱입니다.

---

## ✨ 주요 기능

- **📸 AI OCR**: 청첩장, 부고장, 영수증 자동 인식 (Google Vision API)
- **🎙️ 음성 입력**: 음성으로 빠르게 일정 등록 (React Native Voice)
- **📅 캘린더 통합**: 디바이스 캘린더 동기화 + 공유 캘린더
- **💰 경조사 금액 추천**: AI 기반 적정 금액 제안
- **📊 통계 & 리포트**: 월별/연도별 지출 분석

---

## 🏗️ 기술 스택

| 분류 | 기술 |
|------|------|
| **Frontend** | React Native (Expo), TypeScript |
| **Backend** | Supabase (PostgreSQL, Auth, Storage, Realtime) |
| **AI/ML** | OpenAI GPT-4o, Google Vision API, TensorFlow Lite |
| **테스트** | Jest, Detox, Playwright (Python) |
| **디자인** | Pretendard 폰트, 토큰 기반 디자인 시스템 |

---

## 📂 프로젝트 구조

```
├── app/                     # 앱 화면 (Expo Router)
│   ├── auth/               # 로그인/회원가입
│   ├── calendar/           # 캘린더 + 그룹 채팅
│   ├── scan/               # OCR/음성 입력
│   ├── settings/           # 설정
│   └── index.tsx           # 홈 화면
├── components/             # 재사용 가능한 UI 컴포넌트
├── constants/              # 디자인 토큰 (DesignTokens.ts, Colors.ts)
├── services/               # 비즈니스 로직
│   ├── ai/                # OpenAI, 분석 엔진
│   ├── supabase-modules/  # Supabase 모듈 (events, calendars, chat)
│   └── supabase.ts        # Supabase 클라이언트
├── migrations/             # Supabase DB 마이그레이션
└── e2e/                    # E2E 테스트 (Detox, Playwright)
```

---

## 🚀 빠른 시작

### 1. 설치

```bash
# 의존성 설치
npm install

# iOS 전용 (macOS)
cd ios && pod install && cd ..
```

### 2. 환경 변수 설정

`.env` 파일 생성 (`.env.example` 참고):

```bash
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
EXPO_PUBLIC_OPENAI_API_KEY=sk-...
EXPO_PUBLIC_GOOGLE_CLOUD_API_KEY=your-google-key
```

### 3. 실행

```bash
npm run start       # Expo 개발 서버
npm run android     # Android
npm run ios         # iOS
npm run web         # 웹 (localhost:8090)
```

---

## 🧪 테스트

| 명령어 | 설명 |
|--------|------|
| `npm test` | Jest 유닛 테스트 |
| `npm run e2e:build` | Detox 빌드 (Android) |
| `npm run e2e:test` | Detox E2E 테스트 |
| `python e2e/inspect_dom.py` | Playwright 웹 DOM 검사 |

---

## 📚 주요 문서

| 문서 | 설명 |
|------|------|
| `README_SUPABASE.md` | Supabase DB 스키마 및 RLS 정책 |
| `README_OAUTH.md` | 소셜 로그인 (Naver, Kakao, Google) 설정 |
| `VOICE_PIPELINE_STABILITY_PLAN.md` | 음성 인식 안정화 계획 |
| `migrations/` | DB 마이그레이션 히스토리 |

---

## 🎨 디자인 시스템

**디자인 토큰** 사용 (`constants/DesignTokens.ts`):
- 색상: `ColorTokens.brand.primary`, `ColorTokens.semantic.success`
- 타이포그래피: `Typography.fontSize.lg`, `Typography.fontFamily.bold`
- 간격: `Spacing.md`, `Spacing.xl`
- 모션: `Motion.duration.normal`

**원칙**: frontend-design 스킬 기반 (Bold aesthetics, 일관성, 토큰 중심 설계)

---

## 📦 주요 기능 상세

### 📸 OCR 파이프라인
1. 이미지 촬영 (`app/scan/index.tsx`)
2. Google Vision API로 텍스트 추출
3. OpenAI GPT-4o로 구조화 (날짜, 장소, 금액 파싱)
4. 사용자 확인 후 저장 (`app/scan/result.tsx`)

### 🎙️ 음성 입력
- React Native Voice 사용
- 음성 → 텍스트 → OpenAI 분석
- 연속 입력 지원 (`services/VoiceService.ts`)

### 📅 공유 캘린더 + 채팅
- 초대 코드로 캘린더 공유
- Realtime 구독으로 실시간 메시지 (`services/supabase-modules/chat.ts`)
- RLS 정책으로 권한 관리

---

## 🛡️ 보안

- **Row Level Security (RLS)**: 모든 테이블에 적용
- **API 키 관리**: `.env` 파일 (`.gitignore` 포함)
- **인증**: Supabase Auth (JWT 기반)

---

## 🤝 기여

1. 이슈 생성
2. Feature 브랜치 생성 (`git checkout -b feature/amazing-feature`)
3. 커밋 (`git commit -m 'Add amazing feature'`)
4. Push (`git push origin feature/amazing-feature`)
5. Pull Request 생성

---

## 📄 라이선스

Private (비공개)

---

## 📞 문의

프로젝트 관련 문의: [support@haruclick.com](mailto:support@haruclick.com)
