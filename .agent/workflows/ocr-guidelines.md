---
description: OCR 성능 향상을 위한 개발 지침 및 로드맵 (v2025)
---

# 🚀 OCR 성능 향상 지침 (Minsim v2025)

## 현재 구현 상태

| 레이어 | 파일 | 역할 |
|--------|------|------|
| 1단계 | `services/ocr.ts` | ML Kit 로컬 OCR (한국어 스크립트) |
| 2단계 | `services/GifticonAnalysis.ts` | Regex 기반 텍스트 파싱 (폴백) |
| 3단계 | `services/ai/OpenAIService.ts` | GPT-4o-mini 분류 및 구조화 |

---

## 1. 이미지 전처리 (Pre-processing) ⭐ 핵심

> "입력이 좋아야 출력이 좋다"

### 필수 적용 사항

- [ ] **스캔 가이드 UI**: 촬영 시 사각형 오버레이로 문서 정렬 유도
- [ ] **기울기 보정 (Deskewing)**: 기울어진 이미지 자동 보정
- [ ] **이진화 (Binarization)**: 화려한 배경(청첩장) 제거 → 흑백 분리
- [ ] **해상도 최적화**: 300 DPI 이상 확보 (작은 글씨 인식용)

### 추천 라이브러리

```javascript
// React Native에서 사용 가능한 이미지 처리 옵션
- react-native-image-editor    // 크롭, 회전
- react-native-image-manipulator // Expo 호환 이미지 처리
- OpenCV (react-native-opencv3) // 고급 전처리 (이진화, 노이즈 제거)
```

---

## 2. 하이브리드 OCR 전략

### 현재 파이프라인 (As-Is)

```
이미지 촬영 → ML Kit OCR → GPT-4o-mini 분석 → 결과 표시
```

### 개선된 파이프라인 (To-Be)

```
이미지 촬영
    ↓
[전처리] 크롭 + 기울기 보정 + 이진화
    ↓
[1단계] ML Kit - 숫자 추출 (바코드, 유효기간)
    ↓
    ├── 텍스트 신뢰도 < 70%? → "재촬영 요청"
    ↓
[2단계] GPT-4o-mini Vision - 맥락 분석
    ↓
[3단계] Post-OCR 보정 (오타 수정)
    ↓
[4단계] 사용자 확인 UI (Human-in-the-Loop)
```

### ML Kit 역할 (로컬, 무료, 빠름)

```typescript
// 강점: 정형화된 숫자 데이터
- 바코드 번호 (12-16자리)
- 유효기간 (YYYY.MM.DD)
- 금액 (숫자만)

// 한계: 피해야 할 케이스
- 청첩장 흘림체 폰트
- 세로 쓰기 텍스트
- 복잡한 디자인 레이아웃
```

### GPT-4o-mini Vision 역할 (클라우드, 유료, 정확)

```typescript
// 강점: 문맥 이해 필요한 정보
- 신랑/신부 이름 구분
- 경조사 종류 분류 (결혼/장례/생일)
- 장소 및 시간 추출
- 추천 금액 계산

// CoT Prompting 예시
"이미지를 분석하여:
1. 먼저 문서 유형을 판단하라 (결혼식/장례식/기프티콘)
2. 그 다음 JSON 형식으로 정보를 추출하라
3. 불확실한 필드는 confidence 점수와 함께 반환하라"
```

---

## 3. Post-OCR 보정

ML Kit가 자주 오인식하는 패턴을 LLM으로 교정:

| ML Kit 오인식 | 실제 의도 |
|---------------|-----------|
| `l` (소문자 L) | `1` |
| `O` (대문자 O) | `0` |
| `S` | `5` |
| `ㅇ` | `0` |

```typescript
// 추가 프롬프트 예시
"다음 OCR 텍스트에서 숫자 오타를 교정하라:
바코드: l234 567O 9Ol2 → 1234 5670 9012"
```

---

## 4. Confidence Score 활용 (Human-in-the-Loop)

```typescript
interface OCRResult {
  text: string;
  confidence: number; // 0.0 ~ 1.0
}

// 분기 로직
if (confidence >= 0.9) {
  // ✅ 자동 저장
} else if (confidence >= 0.7) {
  // ⚠️ 사용자 확인 요청 (하이라이트 표시)
} else {
  // ❌ 재촬영 또는 직접 입력 유도
}
```

### UI 가이드라인

- 신뢰도 낮은 필드: **주황색 하이라이트** + 물음표 아이콘
- 금액/계좌번호 같은 민감 정보: 항상 사용자 확인 요청
- "직접 입력" 버튼 항상 노출

---

## 5. 한국어 특화 OCR 옵션 (성장 시 고려)

| 서비스 | 강점 | 비용 |
|--------|------|------|
| **Naver CLOVA OCR** | 한국어 최고 성능, 영수증/청첩장 특화 | 유료 |
| **Upstage Document AI** | 손글씨, 구겨진 문서 처리 탁월 | 유료 |
| **Google Vision API** | 범용, 안정적 | 유료 |

---

## 6. 개발 로드맵

### 📌 MVP (현재)

- [x] ML Kit 로컬 OCR 연동
- [x] GPT-4o-mini 분류 파이프라인
- [x] Regex 폴백 로직
- [x] 사용자 수정 UI (TextInput)

### 📌 v1.5 (전처리 강화) ✅ DONE

- [x] `expo-image-manipulator` 크롭/리사이즈 기능
- [x] Post-OCR 오타 교정 (l→1, O→0)
- [ ] 스캔 가이드 UI 오버레이 적용
- [ ] 이미지 품질 검증 (블러 감지)
- [ ] "재촬영" 버튼 추가

### 📌 v2.0 (정확도 고도화)

- [ ] Post-OCR 오타 교정 단계 추가
- [ ] Confidence Score 기반 UI 분기
- [ ] 템플릿별 Few-shot Prompting
  - 청첩장 템플릿
  - 부고장 템플릿
  - 기프티콘 브랜드별

### 📌 v3.0 (고급)

- [ ] Naver CLOVA OCR 통합 검토
- [ ] A/B 테스트 (ML Kit vs CLOVA)
- [ ] 오프라인 모드 캐싱

---

## 7. 추가 아이디어 💡

### 7.1 바코드 직접 스캔

```typescript
// ML Kit Barcode Scanning 별도 활용
import { BarcodeScanning } from '@react-native-ml-kit/barcode-scanning';

// 기프티콘 바코드를 OCR 대신 직접 스캔하면 100% 정확도
```

### 7.2 이미지 영역 분할 (Zone Detection)

- 청첩장 이미지에서 "텍스트 영역"만 크롭하여 전송
- 약도/장식 이미지 제외 → 노이즈 감소

### 7.3 사용자 피드백 학습

```typescript
// 사용자가 수정한 데이터를 수집 (익명화)
// - "AI가 틀린 부분"을 파악하여 프롬프트 개선
// - 자주 틀리는 패턴 → Few-shot 예시로 추가
```

### 7.4 캐시 및 중복 감지

```typescript
// 같은 기프티콘/청첩장 재등록 방지
// - 이미지 해시 비교
// - 바코드 번호 중복 체크
```

### 7.5 예상 처리 시간 표시

```
"AI 분석 중... (약 3초 소요)"
// 사용자가 기다리는 동안 기대치 관리
```

---

## 8. 참고 코드 수정 포인트

### `services/ocr.ts` 개선

```typescript
// 현재: 단순 텍스트 반환
return result.text;

// 개선: Confidence 포함 반환
return {
  text: result.text,
  blocks: result.blocks.map(b => ({
    text: b.text,
    confidence: b.confidence // 블록별 신뢰도
  }))
};
```

### `services/ai/OpenAIService.ts` 개선

```typescript
// Confidence 필드 추가 요청
"각 필드에 대해 confidence (0.0~1.0) 점수를 함께 반환하라"

// 응답 예시
{
  "type": "INVITATION",
  "data": {
    "event_type": { "value": "wedding", "confidence": 0.95 },
    "event_date": { "value": "2026-03-15", "confidence": 0.80 },
    "main_name": { "value": "김철수♥이영희", "confidence": 0.72 }
  }
}
```

---

## ✅ 요약

1. **전처리에 집중**: 기울기 보정 + 이진화 = 인식률 대폭 상승
2. **하이브리드 전략 유지**: ML Kit(숫자) + GPT(맥락)
3. **사용자 루프 필수**: 민감 정보는 항상 확인
4. **점진적 개선**: MVP → v1.5 → v2.0 순서로 고도화
