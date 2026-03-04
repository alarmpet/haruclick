# Design Tokens

하루클릭 디자인 시스템의 기준값입니다. 실제 토큰 구현은 `constants/DesignTokens.ts`를 소스 오브 트루스로 사용합니다.

## Color
- `ColorTokens.brand`: 제품 아이덴티티 색상
- `ColorTokens.semantic`: 성공/경고/위험/정보 상태 색상
- `ColorTokens.neutral`: 회색 스케일
- `ColorTokens.surface`: 배경/카드/오버레이 계열

## Typography
- `Typography.fontFamily`: `Pretendard-Medium`, `Pretendard-Bold`
- `Typography.fontSize`: `xs(12)` ~ `4xl(36)`
- `Typography.lineHeight`: `tight`, `normal`, `relaxed`

## Spacing
- 4px 기반 스케일: `xs(4)` ~ `6xl(64)`

## Motion
- `Motion.duration`: `fast(150)`, `normal(300)`, `slow(500)`
- `Motion.stagger.item`: `50ms`

## Shadow / Radius
- `Shadow.sm`, `Shadow.md`, `Shadow.lg`
- `BorderRadius.sm` ~ `BorderRadius.full`

## 적용 원칙
1. 신규 화면은 `constants/DesignTokens.ts` 사용을 기본으로 합니다.
2. 기존 `Colors.ts` 사용 코드는 점진적으로 토큰으로 마이그레이션합니다.
3. 컴포넌트 단위로 우선 적용 후, 화면 단위 리팩터링으로 확장합니다.
