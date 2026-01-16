---
description: 새 개발 빌드 시 필수 체크리스트
---

# 새 개발 빌드 체크리스트

## 빌드 전 확인사항

### 1. expo-image-manipulator 활성화 (OCR 인식률 향상)
// turbo
```bash
# 1. services/ocr.ts에서 이미지 전처리 코드 활성화
# 아래 내용을 ocr.ts 상단에 추가:
```

**추가할 코드** (`services/ocr.ts` 상단):
```typescript
import * as ImageManipulator from 'expo-image-manipulator';

async function preprocessImage(uri: string): Promise<string> {
    try {
        const result = await ImageManipulator.manipulateAsync(
            uri,
            [{ resize: { width: 1280 } }],
            { compress: 0.9, format: ImageManipulator.SaveFormat.JPEG }
        );
        return result.uri;
    } catch (error) {
        return uri;
    }
}
```

**수정할 코드** (`extractTextFromImage` 함수 내):
```typescript
// 기존:
const result = await TextRecognition.recognize(uri, ...);

// 변경:
const processedUri = await preprocessImage(uri);
const result = await TextRecognition.recognize(processedUri, ...);
```

### 2. 빌드 명령어
// turbo
```bash
npx expo prebuild --clean
npx expo run:android
```

### 3. 빌드 후 테스트
- [ ] OCR 스캔 테스트
- [ ] 고해상도 이미지 테스트
- [ ] 어두운 이미지 테스트
