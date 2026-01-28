# Android 빌드 에러 복구 계획서 (Manifest Merger 중심)

## 0) 문서 목적
Android 리빌드 실패(`:app:processDebugMainManifest`)를 재현 가능하게 진단하고,  
원인별로 복구 절차와 검증 기준을 명확히 정리한다.

**Current Status (2026-01-26):**
- **Step D (Manifest Patch)**: `tools:replace` 플러그인(`plugins/withAndroidManifestFix.js`) 적용됨.
- **Verification**: Clean Rebuild 대기 중.

---

## 1) 현상 요약 (실제 로그 기준)
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

## 2) 원인 가설 (우선순위)
1. **AndroidX와 구 Support 라이브러리 혼용**
   - `com.android.support:*` 계열이 트랜짓/직접 의존성으로 남아 있어 Manifest 병합 충돌 발생
2. **Manifest 병합 충돌 처리 미흡**
   - `android:appComponentFactory` 중복 정의를 명시적으로 덮어쓰기 하지 않음
3. **Deprecated/Legacy 의존성**
   - 오래된 라이브러리가 AndroidX 전환을 방해

---

## 3) 복구 단계 (Action Plan)

### Step A) 문제 의존성 추적 (필수)
**목표:** `com.android.support:*`를 끌어오는 라이브러리를 특정  
**방법:** Gradle 의존성 트리에서 `com.android.support` 검색  
**산출물:** 문제 의존성 목록 (직접/간접 구분)

---

### Step B) AndroidX/Jetifier 설정 확인
**목표:** AndroidX 전환 전제조건 충족  
**확인 항목 (android/gradle.properties)**
- `android.useAndroidX=true`
- `android.enableJetifier=true`

> 없으면 추가 필요. (단, Expo/React Native 권장 범위를 벗어나지 않도록 주의)

---

### Step C) Legacy Support 라이브러리 제거/대체
**목표:** `com.android.support:*` 의존성 제거  
**전략**
- 직접 의존성 제거 → AndroidX 대응 라이브러리로 교체
- 트랜짓 의존성은 라이브러리 업데이트로 해결
- 업데이트 불가 시 대체 라이브러리 검토

---

### Step D) Manifest 충돌 완화 (임시 또는 병행)
**목표:** `android:appComponentFactory` 충돌 방지  
**방법**
- `android/app/src/debug/AndroidManifest.xml` 또는 `android/app/src/main/AndroidManifest.xml`에
  `tools:replace="android:appComponentFactory"` 적용  
- `tools` 네임스페이스 추가 필요 (`xmlns:tools="http://schemas.android.com/tools"`)

> **Status**: `plugins/withAndroidManifestFix.js`를 통해 자동 적용됨 (Patch Applied).
> **주의:** 근본 원인(legacy support 제거)이 우선이며, `tools:replace`는 보조 수단.

---

### Step E) Gradle/AGP 정합성 점검
**목표:** Android Gradle Plugin/Gradle 버전과 Expo SDK 호환성 유지  
**확인 파일**
- `android/gradle/wrapper/gradle-wrapper.properties`
- `android/build.gradle`

> 버전 불일치가 있으면 Expo 권장 범위 내에서만 조정.

---

## 4) 검증 계획
1. **Manifest 병합 성공 여부**  
   - `:app:processDebugMainManifest` 성공 확인
2. **의존성 정합성 확인**  
   - `com.android.support:*` 의존성 제거 여부 확인
3. **런타임 확인**  
   - 앱 실행 시 크래시 없이 정상 진입

---

## 5) 필요 정보 (추가 요청)
- `:app:dependencies` 출력 (debugRuntimeClasspath)  
- `android/gradle.properties`, `android/build.gradle`, `android/app/build.gradle` 버전 정보  
- 실행 명령 (`run-android-local.bat` vs `npx expo run:android`)  

