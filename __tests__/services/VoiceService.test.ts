/** @jest-environment node */

jest.mock('@react-native-voice/voice', () => ({
    __esModule: true,
    default: {
        start: jest.fn(() => Promise.resolve()),
        stop: jest.fn(() => Promise.resolve()),
        cancel: jest.fn(() => Promise.resolve()),
        destroy: jest.fn(() => Promise.resolve()),
        removeAllListeners: jest.fn(),
        onSpeechResults: undefined as unknown,
        onSpeechPartialResults: undefined as unknown,
        onSpeechError: undefined as unknown
    }
}));

jest.mock('expo-av', () => ({
    Audio: {
        requestPermissionsAsync: jest.fn(() => Promise.resolve({ status: 'granted' })),
        setAudioModeAsync: jest.fn(() => Promise.resolve()),
        Recording: { createAsync: jest.fn(() => Promise.resolve({ recording: { stopAndUnloadAsync: jest.fn(), getURI: jest.fn() } })) },
        RecordingOptionsPresets: { HIGH_QUALITY: {} }
    }
}));

jest.mock('react-native', () => ({
    Alert: { alert: jest.fn() },
    Platform: {}
}));

import { voiceService, VoiceState } from '../../services/voice/VoiceService';

describe('VoiceService (local STT)', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        voiceService.syncStateFromUI('IDLE');
    });

    it('starts local STT and emits RECORDING_LOCAL', async () => {
        const states: VoiceState[] = [];
        voiceService.setListeners({
            onStateChange: (state) => states.push(state),
            onError: jest.fn()
        });

        await voiceService.startLocalSTT();

        const Voice = require('@react-native-voice/voice').default;
        expect(Voice.start).toHaveBeenCalledWith('ko-KR');
        expect(states).toContain('RECORDING_LOCAL');
    });

    it('emits final result when session is active', async () => {
        const onLocalResult = jest.fn();
        voiceService.setListeners({
            onStateChange: jest.fn(),
            onError: jest.fn(),
            onLocalResult
        });

        await voiceService.startLocalSTT();
        const Voice = require('@react-native-voice/voice').default;
        (Voice.onSpeechResults as any)?.({ value: ['hello'] });

        expect(onLocalResult).toHaveBeenCalledWith('hello', true);
    });

    it('suppresses results after stopLocalSTTForConfirm', async () => {
        const onLocalResult = jest.fn();
        voiceService.setListeners({
            onStateChange: jest.fn(),
            onError: jest.fn(),
            onLocalResult
        });

        await voiceService.startLocalSTT();
        onLocalResult.mockClear();
        await voiceService.stopLocalSTTForConfirm();
        const Voice = require('@react-native-voice/voice').default;
        (Voice.onSpeechResults as any)?.({ value: ['late'] });

        expect(onLocalResult).not.toHaveBeenCalled();
    });
});
