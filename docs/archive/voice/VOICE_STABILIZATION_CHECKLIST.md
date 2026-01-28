# 음성 기능 유지보수 및 안정화 체크리스트 (Voice Stabilization Checklist)
본 문서는 음성 인식 기능의 안정성을 유지하기 위해 **정기적으로(또는 리빌드 시마다)** 점검해야 할 항목을 정의한다.

## 1) 빌드 환경 (Build Environment)
- **Dev Client 실행 필수**: Expo Go 사용 금지. 앱 상단에 **Development Build** 표시 확인.
- **아키텍처 설정**: `android/gradle.properties`에서 `newArchEnabled=false` 유지.
- **Clean Rebuild**: 네이티브 모듈 변경 시 `npx expo prebuild --clean --platform android` 후 리빌드.

## 2) 권한 및 보안 (Permissions & Security)
- **Android 권한**: `app.json > android.permissions`에 `RECORD_AUDIO` 포함 확인.
- **iOS 권한**: `app.json > ios.infoPlist`에 `NSMicrophoneUsageDescription` 포함 확인.
- **네트워크 보안**: 로컬 개발 시 `app.json > android.usesCleartextTraffic=true` 유지.  
  (디버그는 `network_security_config`로 cleartext 허용 설정됨)

## 3) Local STT 플로우 (Local STT Flow)
- **자동 시작**: 앱 진입/복귀 시 Local STT가 즉시 시작되는가?
- **품질 분기(Quality Gate)**:
  - 짧은 단어(예: "아") 입력 시 `QUALITY_FAIL` 전환 확인.
  - **오탐 테스트는 P8(Entity Regex 튜닝) 반영 이후** 확인.
- **UI 일관성**: 대기/실패/녹음 상태에서 Whisper 전환 버튼이 접근 가능한가?

## 4) Whisper 폴백 (Whisper Fallback)
- **전환 동작**: **"정밀 인식(Whisper)으로 전환"** 버튼 클릭 시 Whisper 녹음 모드 진입.
- **에러 처리**: Whisper API 실패 시 `api_error` 로깅 및 재시도 옵션 제공.

## 5) 로깅 및 분석 (Logging & Analytics)
- **Zero Data Loss (Flush)**:
  - `short_text`, `no_entity`, `analysis_unknown` 비정상 종료에도 로그 적재.
  - `permission_denied`, `voice_error` 발생 시 `flush()` 호출 확인.
- **표준화(Normalization)**:
  - `fallback_reason`가 표준 값만 사용되는지 확인 (`permission_denied_permanent` 등 비표준 제거).

## 6) 로그 시그니처 (Log Signature Reference)
문제 발생 시 로그를 통해 빠르게 원인을 파악한다.

| 상태 | 예상 로그 (Success) | 에러 로그 (Failure) | 조치 |
| --- | --- | --- | --- |
| 초기화 | `[VoiceService] Local STT V5 started` | `NATIVE_MODULE_MISSING` | Dev Client 확인, Clean Rebuild |
| 권한 | 권한 요청 후 Local STT 시작 | `permission_denied` (fallback_reason) | 앱 설정 권한 확인 |
| Local | `[Voice] Local Final:` 로그 확인 | `[Voice] Local Error` 또는 `voice_error` | 발음/마이크 확인 |
| Whisper | Whisper 결과 수신 로그 | `api_error` | API Key/네트워크 확인 |

