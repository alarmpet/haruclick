# Voice Service & Whisper Integration Walkthrough

I have implemented the Voice Service Layer and integrated it with the OpenAI Whisper API for accurate speech-to-text functionality. This feature allows users to simply speak their schedule, expenses, or other data, and have it automatically analyzed and stored.

## 1. Feature Overview

### Voice Service (`VoiceService.ts`)
- **Dual-Engine Approach**:
  - **Local STT**: Provides real-time feedback with "Listening..." animations. Used for initial detection.
  - **Whisper API**: Used when "High Accuracy" is needed or as a fallback/confirmation enhancement.
- **State Management**: managed via `VoiceState` (`IDLE`, `LISTENING_LOCAL`, `RECORDING_WHISPER`, `PROCESSING`, etc.).

### Whisper Integration (`OpenAIService.ts`)
- Added `transcribeAudio(uri)` function.
- Sends audio file (`m4a`) to OpenAI `/v1/audio/transcriptions` endpoint.
- Forces Korean language (`language: 'ko'`) for better accuracy.

### UI Integration (`universal.tsx`)
- **Auto-Start**: When navigating with `?mode=voice`, the microphone activates immediately.
- **Visual Feedback**:
  - **Listening**: Pulsing/Active microphone icon.
  - **Processing**: "整理하고 있어요..." (Organizing...) message.
  - **Error/Retry**: Options to re-record using Whisper for better clarity.

## 2. Changes Summary

### `services/voice/VoiceService.ts`
- **[NEW]** Created `VoiceService` class to handle `expo-speech-recognition` and `expo-av` recording logic.

### `services/ai/OpenAIService.ts`
- **[MODIFY]** Added `transcribeAudio` function using `FormData` upload.

### `app/scan/universal.tsx`
- **[MODIFY]** Added Voice State overlay.
- **[MODIFY]** Hijacked the initialization logic to auto-start voice session if `mode === 'voice'`.
- **[MODIFY]** Routed voice results through `maybePreprocessChatText` -> `analyzeImageText` pipeline.

### `app/scan/result.tsx`
- **[VERIFIED]** Verified that passing `'voice-input'` or `'text-input'` as the `imageUri` does not crash the result screen.
  - The screen does not attempt to display the image for voice inputs.
  - `getImageHash` fallback logic prevents crashes for non-file URIs.

## 3. Verification & Testing

### How to Test
1. **Open the App** and tap the "Voice Add" (Mic icon) button on the Tab Bar (if added) or navigate via link.
2. **Speak**: "내일 오후 2시 강남역에서 점심 약속 있어."
3. **Observe**:
   - The UI should show "듣고 있어요...".
   - After pausing, it should transition to "정리하고 있어요...".
   - If you press "완료" (Done), it should immediately process the text.
4. **Result**:
   - The app should navigate to the Result Screen.
   - You should see an **Appointment** card:
     - **Title**: 점심 약속
     - **Date**: [Tomorrow's Date] 14:00
     - **Location**: 강남역

### Manual Verification Checklist
1. **Local STT Success**: Speak clearly -> "Done" or Silence -> Result Screen.
2. **Whisper Fallback**: Speak -> Press "Re-record" (if poor quality) -> Record -> Stop -> Whisper API -> Result Screen.
3. **Network Check**: Verify Whisper request sends `multipart/form-data` correctly (boundary included).

### Edge Cases Checked
- **No Speech**: Timeout checks in `VoiceService` trigger `QUALITY_FAIL` state.
- **Garbage Input**: `analyzeImageText` returns `UNKNOWN` -> Alert "분류 실패".
- **Network Error**: Whisper API failure handled gracefully with Alert.

## 4. Next Steps
- **Deploy**: Run `eas build` to create a new development build containing the native permission changes (`NSMicrophoneUsageDescription`).
- **User Testing**: verify microphone permission prompts on physical devices.
