# haruclick (v1.0.0)

No description provided.

## 🚀 Features
- **AI-Powered OCR**: Automatically extracts text from receipts, invitations, and common document images.
- **Smart Classification**: Categorizes event types (Wedding, Funeral, Birthday) and financial transactions.
- **Calendar Integration**: Syncs extracted events directly to your device calendar.
- **Dark Mode Support**: Fully supported with dynamic theming.
- **Accessibility**: Optimized for screen readers.

## 🎙 Voice Pipeline Docs
- **Master Plan**: `VOICE_PIPELINE_STABILITY_PLAN.md`
- **Archive**: `docs/archive/voice/`

## 📂 Project Structure
```
├── __tests__
│   ├── services
│   │   └── errorHandler.test.ts
│   └── simple.test.js
├── app
│   ├── auth
│   │   ├── login.tsx
│   │   ├── signup.tsx
│   │   └── welcome.tsx
│   ├── calendar
│   │   └── index.tsx
│   ├── community
│   │   └── index.tsx
│   ├── history
│   │   └── index.tsx
│   ├── relationship-ledger
│   │   └── index.tsx
│   ├── scan
│   │   ├── index.tsx
│   │   ├── result.tsx
│   │   └── universal.tsx
│   ├── settings
│   │   ├── customer-support
│   │   │   ├── index.tsx
│   │   │   └── write.tsx
│   │   ├── calendar-sync.tsx
│   │   ├── index.tsx
│   │   ├── notifications.tsx
│   │   ├── privacy.tsx
│   │   ├── profile.tsx
│   │   └── terms.tsx
│   ├── stats
│   │   └── index.tsx
│   ├── _layout.tsx
│   ├── index.tsx
│   └── login-callback.tsx
├── assets
│   ├── fonts
│   │   ├── Pretendard-Bold.otf
│   │   └── Pretendard-Medium.otf
│   ├── adaptive-icon.png
│   ├── favicon.png
│   ├── icon.png
│   └── splash-icon.png
├── components
│   ├── scan
│   │   ├── EditableRow.tsx
│   │   ├── index.ts
│   │   └── TransactionEditor.tsx
│   ├── AddEventModal.tsx
│   ├── AnalogTimePicker.tsx
│   ├── Card.tsx
│   ├── DashboardSummary.tsx
│   ├── DayTimelineModal.tsx
│   ├── EventDetailModal.tsx
│   ├── EventSaveModal.tsx
│   ├── EventTimeline.tsx
│   ├── LoadingOverlay.tsx
│   ├── MonthlySummary.tsx
│   ├── PollCard.tsx
│   ├── RecommendationTable.tsx
│   ├── ScannerFAB.tsx
│   ├── ScanSettingsModal.tsx
│   ├── SpinnerTimePicker.tsx
│   ├── TaskListModal.tsx
│   ├── TermsAgreementModal.tsx
│   └── VoteResultsBar.tsx
├── constants
│   └── Colors.ts
├── contexts
│   └── ThemeContext.tsx
├── e2e
│   ├── jest.config.js
│   └── starter.test.js
├── scripts
│   └── genReadme.js
├── services
│   ├── ai
│   │   ├── AnalysisEngine.ts
│   │   ├── OpenAIService.ts
│   │   └── PromptTemplates.ts
│   ├── authService.ts
│   ├── calendar.ts
│   ├── CategoryClassifier.ts
│   ├── DataStore.ts
│   ├── DeviceCalendarService.ts
│   ├── errorHandler.ts
│   ├── GoogleVisionService.ts
│   ├── imageHash.ts
│   ├── LunarCalendarService.ts
│   ├── NaverAuthService.ts
│   ├── notification.ts
│   ├── notifications.ts
│   ├── ocr.ts
│   ├── ocrCache.ts
│   ├── ocrCorrections.ts
│   ├── OcrLogger.ts
│   ├── ocrSettings.ts
│   ├── PollService.ts
│   ├── ReciprocityEngine.ts
│   ├── RecommendationEngine.ts
│   ├── supabase.ts
│   ├── VoteService.ts
│   └── WebScraperService.ts
├── styles
│   └── common.ts
├── supabase
│   └── functions
│       └── naver-auth
│           └── index.ts
├── add_calendar_category.sql
├── add_demo_rls_policies.sql
├── alter_events_recurrence.sql
├── app.json
├── auto-run.bat
├── babel.config.js
├── check_push_tokens.sql
├── check_rls_status.sql
├── check_user_data.sql
├── cleanup_duplicates.sql
├── create_api_logs_table.sql
├── create_bank_transactions_table.sql
├── create_ledger_table.sql
├── create_legal_documents_table.sql
├── create_ocr_cache_table.sql
├── create_ocr_corrections_table.sql
├── create_ocr_logs_table.sql
├── create_push_tokens_table.sql
├── create_support_tables.sql
├── eas.json
├── expose_users_view.sql
├── final_fix_rls.sql
├── fix_rls_security.sql
├── google-services.json
├── grant_admin_access.sql
├── insert_dummy_token.sql
├── jest.config.js
├── package.json
├── README_OAUTH.md
├── README_SUPABASE.md
├── README.template.md
├── reset_security_policies.sql
├── run-dev.bat
├── SUPABASE_SCHEMA.sql
├── tsconfig.json
├── update_auth_schema.sql
└── verify_openai_key.js
```

## 🛠 Scripts
| Script | Description |
|--------|-------------|
| `npm run start` | `expo start --port 8090` |
| `npm run android` | `expo start --android --port 8090` |
| `npm run ios` | `expo start --ios --port 8090` |
| `npm run web` | `expo start --web --port 8090` |
| `npm run lint` | `eslint .` |
| `npm run test` | `jest` |
| `npm run e2e:build` | `detox build --configuration android.emu.debug` |
| `npm run e2e:test` | `detox test --configuration android.emu.debug` |
| `npm run docs` | `node scripts/genReadme.js` |


## 📱 Installation
1. Clone the repository.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Set up `.env` file (see `.env.example`).
4. Run the app:
   ```bash
   npm run start
   ```

## 📄 License
This project is private.
