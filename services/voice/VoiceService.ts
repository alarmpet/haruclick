import { Audio } from 'expo-av';
import { Alert, Platform } from 'react-native';
import Voice, { SpeechResultsEvent, SpeechErrorEvent } from '@react-native-voice/voice';

export type VoiceState =
    | 'IDLE'
    | 'RECORDING_LOCAL'    // New: Local STT running
    | 'RECORDING_WHISPER'  // Fallback: Whisper running
    | 'CONFIRM_TEXT'       // New: User confirmation before analysis
    | 'PROCESSING'
    | 'ERROR'
    | 'QUALITY_FAIL';      // New: Normalized text didn't match patterns

type VoiceServiceListeners = {
    onStateChange: (state: VoiceState) => void;
    onLocalResult?: (text: string, isFinal: boolean) => void; // New: Real-time text
    onError: (message: string) => void;
};

class VoiceService {
    private state: VoiceState = 'IDLE';
    private listeners: VoiceServiceListeners | null = null;
    private startInProgress = false;
    private cleanupInProgress = false;
    private cleanupPromise: Promise<void> | null = null;
    private suppressNextError = false;
    private suppressErrorUntil = 0;
    private ignoreResultsUntil = 0;
    private localSessionId = 0;
    private activeLocalSessionId: number | null = null;

    // Whisper Recording
    private recording: Audio.Recording | null = null;

    constructor() {
        // Bind Local STT Events
        Voice.onSpeechResults = this.onSpeechResults.bind(this);
        Voice.onSpeechError = this.onSpeechError.bind(this);
        Voice.onSpeechPartialResults = this.onSpeechPartialResults.bind(this);
    }

    setListeners(listeners: VoiceServiceListeners) {
        this.listeners = listeners;
    }

    syncStateFromUI(state: VoiceState) {
        if (this.state === state) return;
        this.state = state;
    }

    // Soft cleanup: 화면 전환 시 사용 (Voice module 유지)
    async softCleanup() {
        // 이미 cleanup 중이면 기존 Promise 반환 (중복 방지)
        if (this.cleanupInProgress && this.cleanupPromise) {
            return this.cleanupPromise;
        }

        this.cleanupInProgress = true;
        this.cleanupPromise = this._doSoftCleanup();

        try {
            await this.cleanupPromise;
        } finally {
            this.cleanupInProgress = false;
            this.cleanupPromise = null;
        }
    }

    private async _doSoftCleanup() {
        this.invalidateLocalSession();
        await this.stopWhisperRecording();

        // 에러 억제 윈도우 설정
        this.suppressErrorUntil = Date.now() + 1200;

        // Voice 상태와 무관하게 항상 stop + cancel 호출 (안전한 리셋)
        try {
            await Voice.stop();
        } catch { }
        try {
            await Voice.cancel();
        } catch { }

        this.state = 'IDLE';
        this.listeners?.onStateChange('IDLE'); // ✅ UI에 상태 변경 알림
        // Voice.destroy() 호출하지 않음 - 재사용 가능하도록 유지
    }

    // Hard cleanup: 앱 종료/백그라운드 진입 시 사용
    cleanup() {
        this.invalidateLocalSession();
        this.stopWhisperRecording();
        this.stopLocalSTT();
        Voice.destroy().then(Voice.removeAllListeners);
        this.listeners = null;
    }

    // Force reset: 화면 진입 시 강제 상태 초기화
    async forceReset() {
        console.log('[VoiceService] Force reset initiated');
        this.invalidateLocalSession();
        this.startInProgress = false;
        this.cleanupInProgress = false;
        this.cleanupPromise = null;

        try { await Voice.stop(); } catch { }
        try { await Voice.cancel(); } catch { }
        await this.stopWhisperRecording();

        this.state = 'IDLE';
        this.listeners?.onStateChange('IDLE');
    }

    private invalidateLocalSession() {
        this.activeLocalSessionId = null;
        this.ignoreResultsUntil = Date.now() + 1200;
    }

    private updateState(newState: VoiceState) {
        this.state = newState;
        this.listeners?.onStateChange(newState);
    }

    private isVoiceModuleAvailable(): boolean {
        return !!(Voice && typeof (Voice as any).start === 'function' && typeof (Voice as any).stop === 'function');
    }

    // ==========================================
    // 1. Local STT Logic (Primary)
    // ==========================================
    async startLocalSTT() {
        console.log('[VoiceService] startLocalSTT initiated');
        try {
            // V3: cleanup 진행 중이면 완료 대기
            if (this.cleanupInProgress && this.cleanupPromise) {
                console.log('[VoiceService] Waiting for cleanup to complete...');
                await this.cleanupPromise;
            }

            if (this.startInProgress || this.state === 'RECORDING_LOCAL') {
                console.log('[VoiceService] startLocalSTT ignored (already running)');
                return;
            }
            this.startInProgress = true;
            this.activeLocalSessionId = ++this.localSessionId;
            this.ignoreResultsUntil = 0;
            this.suppressErrorUntil = Date.now() + 500; // 시작 시 짧은 에러 억제

            if (!this.isVoiceModuleAvailable()) {
                console.warn('[VoiceService] Native voice module missing');
                this.listeners?.onError('NATIVE_MODULE_MISSING');
                await this.startWhisperRecording();
                return;
            }

            // 이전 세션 정리
            await this.stopWhisperRecording();

            // 명시적으로 stop + cancel (충돌 방지)
            try { await Voice.stop(); } catch { }
            try { await Voice.cancel(); } catch { }

            this.updateState('RECORDING_LOCAL');

            // [Patch] P10 Defense: Check if native module is linked
            // Voice.start throws if native module is null
            try {
                await Voice.start('ko-KR');
                console.log('[VoiceService] Local STT V5 started');
            } catch (nativeError: any) {
                console.warn('[VoiceService] Native start failed:', nativeError);
                if (nativeError && typeof nativeError === 'object' && nativeError.message && nativeError.message.includes('null')) {
                    // "Cannot read property 'startSpeech' of null" -> Native Module Missing
                    throw new Error('NATIVE_MODULE_MISSING');
                }
                throw nativeError;
            }
        } catch (e: any) {
            console.error('[VoiceService] Local STT Start Error:', e);
            // Don't fail hard, just notify to let UI decide fallback
            this.listeners?.onError('로컬 음성 인식 시작 실패');
            this.updateState('ERROR');
        } finally {
            this.startInProgress = false;
        }
    }

    async stopLocalSTT() {
        if (this.state !== 'RECORDING_LOCAL') return;
        try {
            await Voice.stop();
            this.updateState('PROCESSING'); // Wait for final result event
        } catch (e) {
            console.error('[VoiceService] Local STT Stop Error:', e);
        }
    }

    async stopLocalSTTQuiet() {
        await this.stopLocalSTTForConfirm();
    }

    async stopLocalSTTForConfirm() {
        this.suppressNextError = true;
        this.suppressErrorUntil = Date.now() + 1200;
        this.invalidateLocalSession();
        this.state = 'IDLE';
        try {
            await Voice.stop();
        } catch { }
        try {
            await Voice.cancel();
        } catch { }
    }

    cancelLocalSTT() {
        this.invalidateLocalSession();
        Voice.cancel().catch(() => { });
        this.updateState('IDLE');
    }

    private onSpeechResults(e: SpeechResultsEvent) {
        console.log('[Voice] Local Final:', e.value);
        if (this.activeLocalSessionId === null || Date.now() < this.ignoreResultsUntil) return;
        if (e.value && e.value.length > 0) {
            this.listeners?.onLocalResult?.(e.value[0], true);
        }
    }

    private onSpeechPartialResults(e: SpeechResultsEvent) {
        if (this.activeLocalSessionId === null || Date.now() < this.ignoreResultsUntil) return;
        if (e.value && e.value.length > 0) {
            this.listeners?.onLocalResult?.(e.value[0], false);
        }
    }

    private onSpeechError(e: SpeechErrorEvent) {
        console.warn('[Voice] Local Error:', e.error);
        const msg = e.error?.message || '';
        const code = (e.error as any)?.code || '';
        const isClientError = msg.includes('5') || code === '5';
        const isNoMatch = msg.includes('7') || code === '7' ||
            msg.includes('11') || code === '11';

        if (this.suppressNextError && isClientError) {
            console.warn('[Voice] Suppressing transient client error');
            this.suppressNextError = false;
            return;
        }
        if (this.activeLocalSessionId === null || Date.now() < this.ignoreResultsUntil) {
            console.warn('[Voice] Suppressing error: local session inactive');
            return;
        }
        if (Date.now() < this.suppressErrorUntil && (isClientError || isNoMatch)) {
            console.warn('[Voice] Suppressing error during restart window');
            return;
        }

        // 🔧 "No Match" 특별 처리 - 에러가 아닌 입력 부족 상황
        if (this.state === 'RECORDING_LOCAL') {
            if (isNoMatch) {
                console.log('[Voice] No speech detected -> QUALITY_FAIL state');
                this.updateState('QUALITY_FAIL'); // 기존 UI 재활용: "다시 시도" 버튼 제공
                this.listeners?.onError('음성이 인식되지 않았습니다');
                return;
            }

            // 기타 실제 에러 (네트워크, 권한 등)
            this.updateState('ERROR');
            let errorMsg = '음성 인식 오류';
            if (e.error?.message?.includes('2')) errorMsg = '네트워크 오류';
            if (e.error?.message?.includes('5')) errorMsg = '클라이언트 오류';

            this.listeners?.onError(errorMsg);
        }
    }

    async safeRestartLocalSTT() {
        // Cancel/stop and restart with a short cooldown to avoid transient client-side errors
        this.suppressNextError = true;
        this.suppressErrorUntil = Date.now() + 1200;
        this.invalidateLocalSession();
        try {
            await Voice.cancel();
        } catch { }
        try {
            await Voice.stop();
        } catch { }
        this.updateState('IDLE');
        setTimeout(() => {
            this.suppressNextError = false;
            this.startLocalSTT();
        }, 250);
    }

    // ==========================================
    // 2. Whisper Recording Logic (Fallback)
    // ==========================================
    async startWhisperRecording() {
        console.log('[VoiceService] startWhisperRecording initiated');
        try {
            // Stop Local first (if available)
            if (this.isVoiceModuleAvailable()) {
                await Voice.stop();
            } else {
                console.warn('[VoiceService] Native voice module missing; continuing with Whisper');
            }

            console.log('[VoiceService] Requesting permissions...');
            const perm = await Audio.requestPermissionsAsync();
            console.log(`[VoiceService] Permission status: ${perm.status}`);

            if (perm.status !== 'granted') {
                console.warn('[VoiceService] Permission denied');
                Alert.alert('권한 필요', '마이크 권한이 필요합니다.');
                this.updateState('ERROR');
                this.listeners?.onError('마이크 권한이 거부되었습니다.');
                return;
            }

            // Cleanup previous recording
            if (this.recording) {
                try {
                    await this.recording.stopAndUnloadAsync();
                } catch (e) { }
                this.recording = null;
            }

            await Audio.setAudioModeAsync({
                allowsRecordingIOS: true,
                playsInSilentModeIOS: true,
            });

            // High Quality for Whisper
            const { recording } = await Audio.Recording.createAsync(
                Audio.RecordingOptionsPresets.HIGH_QUALITY
            );
            this.recording = recording;
            this.updateState('RECORDING_WHISPER');
            console.log('[VoiceService] Whisper Recording started successfully');
        } catch (e) {
            console.error('[VoiceService] startWhisperRecording error:', e);
            this.updateState('ERROR');
            this.listeners?.onError('녹음을 시작할 수 없습니다.');
        }
    }

    async stopWhisperRecording(): Promise<string | null> {
        console.log('[Voice] stopWhisperRecording called');
        if (!this.recording) return null;

        try {
            this.updateState('PROCESSING');
            await this.recording.stopAndUnloadAsync();
            const uri = this.recording.getURI();
            this.recording = null;
            console.log('[Voice] Recording stopped, uri:', uri);
            return uri;
        } catch (e) {
            console.error('[Voice] stopWhisperRecording error:', e);
            this.updateState('ERROR');
            return null;
        }
    }
}

export const voiceService = new VoiceService();
