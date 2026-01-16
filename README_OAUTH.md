# Supabase 소셜 로그인 설정 가이드

앱에서 구글, 카카오, 네이버 로그인을 사용하기 위해 Supabase 대시보드에서 다음 설정을 완료해야 합니다.

## 1. 공통 설정 (Authentication > URL Configuration)
- **Site URL**: `haruclick://login-callback`
- **Redirect URLs**:
  - `haruclick://login-callback`
  - (개발 중 Expo Go 사용 시) `exp://192.168.x.x:8081` (터미널에 표시된 URL)

## 2. Google 로그인 설정
1. Google Cloud Console에서 프로젝트 생성 및 OAuth 클라이언트 ID 만들기.
2. **승인된 리디렉션 URI**: `https://<YOUR_PROJECT_REF>.supabase.co/auth/v1/callback`
3. Client ID와 Client Secret을 Supabase > Authentication > Providers > Google에 입력.

## 3. Kakao 로그인 설정
1. Kakao Developers 내 애플리케이션 > 카카오 로그인 활성화.
2. **Redirect URI**: `https://<YOUR_PROJECT_REF>.supabase.co/auth/v1/callback` 등록.
3. REST API Key(Client ID)와 Client Secret 코드를 Supabase에 입력.

## 4. Naver 로그인 설정
1. Naver Developers 내 애플리케이션 등록.
2. **Callback URL**: `https://<YOUR_PROJECT_REF>.supabase.co/auth/v1/callback` (PC/Mobile 웹)
3. Client ID와 Client Secret을 Supabase에 입력.

## 5. 딥링크 테스트
앱 실행 후 로그인 버튼 클릭 시 브라우저가 열리고, 로그인 완료 후 앱으로 다시 돌아오는지 확인하세요.
돌아오지 않는다면 `app.json`의 `scheme` 설정(`haruclick`)과 Supabase의 Redirect URL이 일치하는지 확인해야 합니다.
