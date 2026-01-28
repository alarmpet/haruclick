import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Alert,
    TextInput,
    ScrollView,
    AppState,
    Platform,
    Linking
} from 'react-native';
import { useRouter, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Audio } from 'expo-av';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { Colors } from '../../constants/Colors';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { extractTextFromImage, maybePreprocessChatText, extractTextWithGoogleVision } from '../../services/ocr';
import { analyzeImageText, analyzeImageVisual, ScannedData, transcribeAudio } from '../../services/ai/OpenAIService';
import { fetchUrlContent } from '../../services/WebScraperService';
import { DataStore } from '../../services/DataStore';
import { ScanSettingsModal } from '../../components/ScanSettingsModal';
import { useLoading } from '../../components/LoadingOverlay';
import { useTheme } from '../../contexts/ThemeContext';
import { setPreprocessEnabled, isPreprocessEnabled } from '../../services/ocrSettings';
import { common } from '../../styles/common';
import { showError } from '../../services/errorHandler';
import { getCurrentOcrLogger, createOcrLogger, FallbackReason } from '../../services/OcrLogger';
import { voiceService, VoiceState } from '../../services/voice/VoiceService';
import { VoiceNormalizer } from '../../services/voice/VoiceNormalizer';

async function readImageAsBase64(uri: string): Promise<string> {
    try {
        return await FileSystem.readAsStringAsync(uri, {
            encoding: FileSystem.EncodingType.Base64,
        });
    } catch (error) {
        console.warn('[Scan] readAsStringAsync failed, falling back:', error);
    }

    const response = await fetch(uri);
    const blob = await response.blob();
    const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            const dataUrl = reader.result as string;
            const payload = dataUrl.split(',')[1] || dataUrl;
            resolve(payload);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
    return base64;
}

export default function UniversalScannerScreen() {
    const router = useRouter();
    const params = useLocalSearchParams();
    const isVoiceMode = params.mode === 'voice';
    const isVoiceModeRef = useRef(isVoiceMode);

    const loading = useLoading();
    const { colors } = useTheme();
    const [selectedImage, setSelectedImage] = useState<string | null>(null);
    const [url, setUrl] = useState('');
    const [inputHeight, setInputHeight] = useState(56);
    const [settingsVisible, setSettingsVisible] = useState(false);
    const [preprocessEnabled, setPreprocessEnabledState] = useState(isPreprocessEnabled());

    // Voice State
    const [voiceState, setVoiceState] = useState<VoiceState>('IDLE');
    const [voiceText, setVoiceText] = useState('');
    const [confirmText, setConfirmText] = useState('');
    const [confirmOriginalText, setConfirmOriginalText] = useState('');
    const appState = useRef(AppState.currentState);
    const voiceStateRef = useRef<VoiceState>('IDLE');
    const finalizeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const pendingFinalTextRef = useRef<string>('');
    const localSessionTokenRef = useRef(0);
    const finalizeLocalTextRef = useRef<(text: string) => void>(() => { });
    const initVoiceSessionRef = useRef<() => void>(() => { });
    const MIN_CONFIRM_TEXT_LENGTH = 2;
    const confirmTextTrimmed = confirmText.trim();
    const isConfirmTextValid = confirmTextTrimmed.length >= MIN_CONFIRM_TEXT_LENGTH;
    const setVoiceStateSync = useCallback((state: VoiceState) => {
        setVoiceState(state);
        voiceService.syncStateFromUI(state);
    }, []);

    useEffect(() => {
        voiceStateRef.current = voiceState;
    }, [voiceState]);

    useEffect(() => {
        isVoiceModeRef.current = isVoiceMode;
    }, [isVoiceMode]);

    const clearFinalizeTimeout = useCallback(() => {
        if (finalizeTimeoutRef.current) {
            clearTimeout(finalizeTimeoutRef.current);
            finalizeTimeoutRef.current = null;
        }
    }, []);

    const finalizeLocalText = (text: string) => {
        clearFinalizeTimeout();
        void voiceService.stopLocalSTTForConfirm();
        validateAndFinishLocal(text);
    };
    finalizeLocalTextRef.current = finalizeLocalText;

    const bumpLocalSessionToken = () => {
        localSessionTokenRef.current += 1;
        return localSessionTokenRef.current;
    };

    useFocusEffect(
        useCallback(() => {
            setSelectedImage(null);
            if (!isVoiceMode) {
                setUrl('');
                setVoiceStateSync('IDLE');
                setVoiceText('');
                setConfirmText('');
                setConfirmOriginalText('');
            }
            DataStore.clear();

            // Auto-start Voice if in Voice Mode
            if (isVoiceMode) {
                initVoiceSessionRef.current();
            }

            return () => {
                clearFinalizeTimeout();
                // Soft cleanup: 화면 전환 시 Voice 모듈 유지 (재사용 가능)
                // Note: cleanup 함수는 async 불가하므로 fire-and-forget
                voiceService.softCleanup().catch(() => { });
            };
        }, [clearFinalizeTimeout, isVoiceMode, setVoiceStateSync])
    );

    useEffect(() => {
        const subscription = AppState.addEventListener('change', nextAppState => {
            const wasBackground = appState.current.match(/inactive|background/);
            const isBackground = nextAppState.match(/inactive|background/);

            if (isBackground) {
                clearFinalizeTimeout();
                voiceService.cleanup();
                setVoiceStateSync('IDLE');
                setVoiceText('');
                setConfirmText('');
                setConfirmOriginalText('');
            } else if (wasBackground && nextAppState === 'active') {
                if (isVoiceModeRef.current && voiceStateRef.current === 'IDLE') {
                    initVoiceSessionRef.current();
                }
            }
            appState.current = nextAppState;
        });
        return () => subscription.remove();
    }, [clearFinalizeTimeout, setVoiceStateSync]);

    const initVoiceSession = async () => {
        bumpLocalSessionToken();
        setVoiceText('');
        setConfirmText('');
        setConfirmOriginalText('');
        setVoiceStateSync('IDLE');
        clearFinalizeTimeout();
        pendingFinalTextRef.current = '';

        // [Patch] Start Logging Session (Safe Mode)
        let logger = getCurrentOcrLogger();
        if (!logger) {
            console.log('[Voice] Logger was null, creating new one.');
            logger = createOcrLogger();
        }

        // Use a unique ID for voice, mocking an "image hash"
        const voiceSessionId = `voice-${Date.now()}`;
        await logger?.startSession(voiceSessionId);

        voiceService.setListeners({
            onStateChange: (state) => setVoiceState(state),
            onLocalResult: (text, isFinal) => {
                setVoiceText(text);
                clearFinalizeTimeout();
                if (isFinal) {
                    // Stop local STT after final to prevent stray errors
                    voiceService.stopLocalSTTForConfirm();
                    // Allow brief pause before finalizing (user might continue speaking)
                    const sessionToken = localSessionTokenRef.current;
                    pendingFinalTextRef.current = text;
                    finalizeTimeoutRef.current = setTimeout(() => {
                        if (localSessionTokenRef.current !== sessionToken) return;
                        if (voiceStateRef.current === 'RECORDING_LOCAL') {
                            finalizeLocalTextRef.current(pendingFinalTextRef.current || text);
                        }
                    }, 1200);
                }
            },
            onError: (msg) => {
                if (voiceStateRef.current === 'CONFIRM_TEXT' || voiceStateRef.current === 'PROCESSING') {
                    console.warn('[Voice] Suppressed error during confirm/processing:', msg);
                    return;
                }
                console.warn('[Voice] Error:', msg);
                setVoiceStateSync('ERROR');

                // 🔧 에러 타입 세분화 - 데이터 분석을 위한 구체적 분류
                let reason: FallbackReason = 'voice_error';
                if (msg.includes('음성이 인식되지 않았습니다')) reason = 'voice_no_match';
                else if (msg.includes('권한')) reason = 'permission_denied';
                else if (msg.includes('네트워크')) reason = 'voice_network_error';

                // Log Failure
                logger?.logVoiceLocal(false, 0, reason, { error: msg });
                logger?.flush(); // Async flush (no await here to avoid blocking UI excessively)
            }
        });

        // 1. Request Permissions Directly (Force System Dialog)
        const { status } = await Audio.requestPermissionsAsync();

        if (status === 'granted') {
            setTimeout(() => voiceService.startLocalSTT(), 200);
        } else {
            Alert.alert(
                '권한 필요',
                '음성 인식을 위해 마이크 권한이 필요합니다.\n설정에서 권한을 허용해주세요.',
                [
                    { text: '취소', style: 'cancel' },
                    { text: '설정으로 이동', onPress: () => Linking.openSettings() }
                ]
            );
            setVoiceStateSync('IDLE');

            // Log Failure
            logger?.logVoiceLocal(false, 0, 'permission_denied', { type: 'user_denied_or_permanent' });
            await logger?.flush();
        }
    };
    initVoiceSessionRef.current = initVoiceSession;

    const validateAndFinishLocal = async (text: string) => {
        const logger = getCurrentOcrLogger();

        // 1. Check Confidence/Length (Simple)
        if (text.length < 2) {
            console.log('[Voice] Too short -> Wait for user or Whisper');
            logger?.logVoiceLocal(false, text.length, 'short_text', { text });
            await logger?.flush(); // [Patch] P4 Checkpoint
            setVoiceStateSync('QUALITY_FAIL'); // [Patch] P2 Fallback State
            return;
        }

        // 2. Normalize First!
        const normalized = VoiceNormalizer.normalize(text);
        console.log(`[Voice] Normalized: "${text}" -> "${normalized}"`);
        const normalizedChanged = normalized !== text;
        const highConfidence = VoiceNormalizer.isHighConfidence(normalized);

        if (highConfidence) {
            console.log('[Voice] High confidence -> Auto analysis');
            logger?.logVoiceLocal(true, text.length, 'auto_analysis', {
                text: normalized,
                original: text,
                auto_analysis: true,
                normalized_changed: normalizedChanged
            });
            await logger?.flush();
            setVoiceStateSync('PROCESSING');
            await processVoiceText(normalized, 'local');
            return;
        }

        // 3. Entity Check (Rule-based) using VoiceNormalizer (P3)
        if (VoiceNormalizer.isEntityLike(normalized)) {
            if (normalizedChanged) {
                console.log('[Voice] Normalization changed -> Force confirmation');
            }
            console.log('[Voice] Needs confirmation -> User intervention');
            setConfirmOriginalText(text);
            setConfirmText(normalized);
            logger?.logVoiceLocal(true, text.length, 'needs_confirmation', { text: normalized, original: text, normalized_changed: normalizedChanged });
            await logger?.flush();
            setVoiceStateSync('CONFIRM_TEXT');
        } else {
            console.log('[Voice] Ambiguous result -> User intervention needed');
            logger?.logVoiceLocal(false, text.length, 'no_entity', { text: normalized, original: text });
            await logger?.flush(); // [Patch] P4 Checkpoint
            setVoiceStateSync('QUALITY_FAIL'); // [Patch] P2 Fallback State
        }
    };

    const restartLocalSTT = () => {
        // Reset UI state before restarting to avoid transient Voice errors
        clearFinalizeTimeout();
        bumpLocalSessionToken();
        setVoiceText('');
        setConfirmText('');
        setConfirmOriginalText('');
        setVoiceStateSync('IDLE');
        voiceService.safeRestartLocalSTT();
    };

    const handleConfirmAnalysis = async () => {
        const text = confirmTextTrimmed;
        if (text.length < MIN_CONFIRM_TEXT_LENGTH) {
            Alert.alert('알림', '텍스트를 2자 이상 입력해주세요.');
            return;
        }
        const logger = getCurrentOcrLogger();
        logger?.logVoiceConfirm(confirmOriginalText || text, text);
        await logger?.flush();
        setVoiceStateSync('PROCESSING');
        await processVoiceText(text, 'local');
    };

    const handleStopWhisper = async () => {
        const logger = getCurrentOcrLogger();
        const uri = await voiceService.stopWhisperRecording();

        if (!uri) {
            Alert.alert('인식 실패', '녹음 파일을 찾을 수 없습니다. 다시 시도해주세요.');
            setVoiceStateSync('QUALITY_FAIL');
            logger?.logVoiceWhisper(false, 0, 'missing_uri', { error: 'missing_uri' });
            await logger?.flush();
            return;
        }

        setVoiceStateSync('PROCESSING');
        try {
            const text = await transcribeAudio(uri);
            const trimmed = text.trim();
            setVoiceText(text);

            if (trimmed.length < MIN_CONFIRM_TEXT_LENGTH) {
                logger?.logVoiceWhisper(false, trimmed.length, 'short_text', { text });
                await logger?.flush();
                Alert.alert('인식 실패', '텍스트가 너무 짧습니다. 다시 말해주세요.');
                setVoiceStateSync('QUALITY_FAIL');
                return;
            }

            logger?.logVoiceWhisper(true, trimmed.length, undefined, { text });
            await processVoiceText(text, 'whisper');
        } catch (e: any) {
            console.error('Whisper Transcribe Error:', e);
            Alert.alert('인식 실패', '다시 시도해주세요.');
            setVoiceStateSync('QUALITY_FAIL');
            logger?.logVoiceWhisper(false, 0, 'api_error', { error: e.message });
            await logger?.flush(); // [Patch] P4 Checkpoint
        }
    };

    const processVoiceText = async (rawText: string, source: 'local' | 'whisper') => {
        if (!rawText || rawText.trim().length === 0) {
            Alert.alert('알림', '인식된 내용이 없습니다.');
            setVoiceStateSync('IDLE');
            return;
        }

        if (source === 'local') await voiceService.stopLocalSTT();

        loading.show('내용 분석 중...');
        try {
            // 0. Voice Specific Normalization (If not already done in validateAndFinishLocal)
            // But handleStopWhisper calls this too, so we should normalize here as well.
            // (Normalization is idempotent mostly, but let's be safe)
            const normalized = VoiceNormalizer.normalize(rawText);
            const resolved = VoiceNormalizer.normalizeRelativeWeekdays(normalized, new Date());

            // 1. Text Preprocessing (Date Normalization like Chat)
            const preprocessed = maybePreprocessChatText(resolved);
            console.log(`[Voice] Processing (${source}):`, rawText, '->', resolved);

            // 2. OpenAI Analysis
            const results = await analyzeImageText(preprocessed, { isVoiceInput: true });
            const valid = results.filter(r => r.type !== 'UNKNOWN');

            if (valid.length > 0) {
                // Success -> Result Screen
                // Should flush logs here or in handleScanResult? 
                // handleScanResult navigates away, so flush before navigation might be good, 
                // but handleScanResult is complex. usually the next screen might flush or just keep session?
                // For now, let's flush here for safety
                await getCurrentOcrLogger()?.flush();

                handleScanResult(valid, 'voice-input', preprocessed);
            } else {
                Alert.alert('분류 실패', '인식된 내용에서 일정을 찾지 못했습니다.');
                getCurrentOcrLogger()?.logStage({
                    stage: source === 'local' ? 'voice_local' : 'voice_whisper',
                    stageOrder: 3,
                    success: false,
                    fallbackReason: 'analysis_unknown',
                    metadata: {
                        source,
                        original_text: rawText,
                        normalized_text: resolved
                    }
                });
                // [Patch] P6: Flush for analysis_unknown
                await getCurrentOcrLogger()?.flush();
                setVoiceStateSync('IDLE');
            }
        } catch (e: any) {
            console.error('[Voice] Analysis Error:', e);
            showError(e.message || '분석 중 오류가 발생했습니다.');
            setVoiceStateSync('ERROR');
            await getCurrentOcrLogger()?.flush(); // [Patch] P4 Checkpoint
        } finally {
            loading.hide();
        }
    };

    const handleTogglePreprocess = (enabled: boolean) => {
        setPreprocessEnabledState(enabled);
        setPreprocessEnabled(enabled);
    };

    const pickImage = async () => {
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            allowsEditing: false,
            quality: 1,
        });
        if (!result.canceled) {
            setSelectedImage(result.assets[0].uri);
            processImage(result.assets[0].uri);
        }
    };

    const takePhoto = async () => {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (permission.status !== 'granted') {
            Alert.alert('권한 필요', '카메라 접근 권한이 필요합니다.');
            return;
        }
        const result = await ImagePicker.launchCameraAsync({
            allowsEditing: false,
            quality: 1,
        });
        if (!result.canceled) {
            setSelectedImage(result.assets[0].uri);
            processImage(result.assets[0].uri);
        }
    };

    const isVirtualAccountPaymentText = (input: string) => {
        const compact = (input || '').replace(/\s+/g, '');
        const hasPaymentIntent = /(납입|납부|보험료|보험금|청구|납입할)/.test(compact);
        const hasVirtualAccount = /(가상계좌|입금가상계좌|가상계좌번호)/.test(compact);
        return hasPaymentIntent && hasVirtualAccount;
    };

    // Helper for Timeout
    const timeoutPromise = <T,>(ms: number, promise: Promise<T>, errorMessage = "Time Limit Exceeded"): Promise<T> => {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                reject(new Error(errorMessage));
            }, ms);
            promise
                .then(res => {
                    clearTimeout(timer);
                    resolve(res);
                })
                .catch(err => {
                    clearTimeout(timer);
                    reject(err);
                });
        });
    };

    const processImage = async (uri: string) => {
        loading.show('이미지 분석 중...');
        console.log('[Scan] Starting image analysis...');
        try {
            // Stage 1: OCR Text Extraction
            console.log('[Scan] Stage 1: Extracting text from image...');
            const ocrResult = await timeoutPromise(30000, extractTextFromImage(uri), 'OCR 추출 시간 초과');
            const ocrText = typeof ocrResult === 'string' ? ocrResult : ocrResult?.text || '';
            const normalizedText = ocrText.trim();
            const textLength = normalizedText.length;
            console.log(`[Scan] OCR extracted ${textLength} characters`);

            // Stage 2: Text Analysis (if sufficient text)
            if (textLength > 5) {
                const stage2Start = Date.now();
                console.log('[Scan] Stage 2: Analyzing text with OpenAI...');
                console.log('[Scan] Raw OCR text:', normalizedText.substring(0, 300));
                try {
                    console.log('[Scan] Running Stage 1 Chat Preprocessing (if needed)...');
                    const preprocessed = maybePreprocessChatText(normalizedText);
                    console.log('[Scan] Preprocessed Structure:\n', preprocessed.substring(0, 500) + '...');

                    const ocrScore = (typeof ocrResult === 'object' && ocrResult?.score) ? ocrResult.score : 0;
                    const results = await timeoutPromise(60000, analyzeImageText(preprocessed, { ocrScore }), 'OpenAI 텍스트 분석 시간 초과');
                    console.log(`[Scan] Stage 2 Duration: ${Date.now() - stage2Start}ms`);
                    const valid = results.filter(r => r.type !== 'UNKNOWN');

                    // Vision Fallback: 금액 누락 감지 (Columnar OCR 대응)
                    const storePayments = valid.filter(r => r.type === 'STORE_PAYMENT');
                    if (storePayments.length > 0) {
                        const missingAmountCount = storePayments.filter(r => !(r as any).amount).length;
                        const amountDetectedCount = storePayments.filter(r => (r as any).amount).length;

                        if (missingAmountCount > storePayments.length * 0.5 || amountDetectedCount <= 1) {
                            console.log(`[Scan] Too many missing amounts (${missingAmountCount}/${storePayments.length}) -> Vision fallback`);
                            throw new Error('Missing amounts - Vision fallback');
                        }
                    }

                    if (valid.length > 0) {
                        console.log(`[Scan] Text analysis success: ${valid.length} result(s)`);
                        handleScanResult(valid, uri, preprocessed);
                        return;
                    }
                    console.log('[Scan] Text analysis returned UNKNOWN, trying vision...');
                } catch (textError: any) {
                    console.warn('[Scan] Text analysis failed:', textError?.message);

                    // Stage 3: Retry with Google Vision (if not already used)
                    // 기존 ocrResult가 Google Vision이 아니었거나, 점수가 낮았다면 시도
                    console.log('[Scan] Stage 3 Retry: Trying Google Vision before Vision fallback...');
                    try {
                        const googleOcr = await extractTextWithGoogleVision(uri);
                        if (googleOcr && googleOcr.length > 5) {
                            console.log(`[Scan] Google Vision Retry success (${googleOcr.length} chars). Re-analyzing...`);

                            // 재전처리 및 분석
                            const preprocessedRetry = maybePreprocessChatText(googleOcr);
                            const retryResults = await timeoutPromise(60000, analyzeImageText(preprocessedRetry, { ocrScore: 90 }), 'OpenAI 텍스트 재분석 시간 초과');
                            const validRetry = retryResults.filter(r => r.type !== 'UNKNOWN');

                            if (validRetry.length > 0) {
                                console.log(`[Scan] Text analysis (Retry) success: ${validRetry.length} result(s)`);
                                handleScanResult(validRetry, uri, preprocessedRetry);
                                return;
                            }
                        }
                    } catch (retryError) {
                        console.warn('[Scan] Google Vision Retry failed:', retryError);
                    }

                    // Continue to vision fallback (Stage 4)
                }
            }

            // Stage 4: Vision Analysis (fallback)
            console.log('[Scan] Stage 4: Analyzing image with OpenAI Vision...');
            const base64 = await readImageAsBase64(uri);
            const visualResults = await timeoutPromise(30000, analyzeImageVisual(base64), 'OpenAI Vision 분석 시간 초과');
            const validVisual = visualResults.filter(r => r.type !== 'UNKNOWN');
            if (validVisual.length > 0) {
                console.log(`[Scan] Vision analysis success: ${validVisual.length} result(s)`);
                // 가상계좌 결제인 경우 방향 수정
                for (const vr of validVisual) {
                    if (vr.type === 'BANK_TRANSFER' && isVirtualAccountPaymentText(normalizedText)) {
                        (vr as any).transactionType = 'withdrawal';
                    }
                }
                handleScanResult(validVisual, uri);
                return;
            }
            console.log('[Scan] Both text and vision analysis failed');
            Alert.alert('분석 실패', '문서 내용을 인식할 수 없습니다.');
        } catch (e: any) {
            console.error('[Scan] Error:', e?.message || e);
            showError(e.message ?? '이미지 처리 중 오류가 발생했습니다.');
        } finally {
            const logger = getCurrentOcrLogger();
            if (logger) {
                await logger.flush();
            }
            loading.hide();
        }
    };

    const handleScanResult = (dataList: ScannedData[], uri: string, rawText?: string) => {
        const sessionId = getCurrentOcrLogger()?.getSessionId();
        DataStore.setScanResult(uri, dataList, sessionId, rawText);
        router.push({ pathname: '/scan/result', params: { imageUri: uri } });
    };


    const handleUrlSubmit = async () => {
        if (!url || !url.trim()) {
            Alert.alert('알림', '텍스트 또는 URL을 입력해주세요.');
            return;
        }

        const trimmedInput = url.trim();
        const isUrl = trimmedInput.startsWith('http://') || trimmedInput.startsWith('https://');

        loading.show(isUrl ? 'URL 분석 중...' : '텍스트 분석 중...');
        console.log('[Scan] Starting URL/text analysis...');
        try {
            let textToAnalyze: string;

            if (isUrl) {
                // URL인 경우: 웹페이지 크롤링
                console.log('[Scan] Fetching URL content...');
                textToAnalyze = await timeoutPromise(10000, fetchUrlContent(trimmedInput), 'URL 가져오기 시간 초과');
            } else {
                // 일반 텍스트인 경우: 직접 분석 (OpenAI가 날짜 해석)
                textToAnalyze = trimmedInput;
            }

            console.log('[Scan] Analyzing text with OpenAI...');
            const results = await timeoutPromise(60000, analyzeImageText(textToAnalyze), 'OpenAI 분석 시간 초과');
            const valid = results.filter(r => r.type !== 'UNKNOWN');
            if (valid.length > 0) {
                console.log(`[Scan] Analysis success: ${valid.length} result(s)`);
                handleScanResult(valid, isUrl ? trimmedInput : 'text-input');
            } else {
                Alert.alert('분석 실패', '내용을 분석할 수 없습니다. 다른 형식으로 시도해주세요.');
            }
        } catch (e: any) {
            console.error('[Scan] Error:', e?.message || e);
            showError(e.message ?? '분석 중 오류가 발생했습니다.');
        } finally {
            loading.hide();
        }
    };

    return (
        <View style={[common.container, { backgroundColor: colors.background }]}>
            <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
                {/* Header */}
                <View style={styles.header}>
                    <Text style={[styles.title, { color: colors.text }]}>
                        {isVoiceMode ? '음성으로 간편 등록' : 'AI 문서 스캔'}
                    </Text>
                    <Text style={[styles.description, { color: colors.subText }]}>
                        {isVoiceMode
                            ? '말한 내용을 입력하면 일정/경조사/가계부로\n자동 분류해 저장합니다.'
                            : '영수증, 청첩장, 송금내역 등을\n자동으로 분류하여 저장합니다.'}
                    </Text>
                </View>

                {/* Voice Status Overlay Area */}
                {/* Voice Status Overlay Area */}
                {isVoiceMode && (
                    <LinearGradient
                        colors={['#E0F2FE', '#DDD6FE', '#FCE7F3']}
                        style={styles.gradientBackground}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                    >
                        <View style={styles.glassCard}>
                            <View style={styles.voiceIconContainer}>
                                <Ionicons name={voiceState.includes('RECORDING') ? "mic" : "mic-outline"} size={24} color={getColorForState(voiceState, colors)} />
                                {voiceState.includes('RECORDING') && (
                                    <View style={styles.recordingDot} />
                                )}
                            </View>
                            <Text style={[styles.voiceStatusText, { color: colors.text }]}>
                                {getMessageForState(voiceState)}
                            </Text>

                            {/* Real-time Text Preview (For Local STT) */}
                            {voiceState === 'RECORDING_LOCAL' && voiceText.length > 0 && (
                                <Text style={styles.previewText}>"{voiceText}"</Text>
                            )}

                            {/* IDLE State - Mixed Control (P1) */}
                            {voiceState === 'IDLE' && (
                                <View style={{ alignItems: 'center', gap: 12 }}>
                                    <TouchableOpacity onPress={restartLocalSTT} style={[styles.stopButton, { backgroundColor: colors.primary }]}>
                                        <Text style={styles.stopButtonText}>🎙 다시 말하기 (Local)</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity onPress={() => voiceService.startWhisperRecording()} style={{ padding: 8 }}>
                                        <Text style={{ color: colors.subText, fontSize: 13, textDecorationLine: 'underline' }}>정밀 인식(Whisper)으로 전환</Text>
                                    </TouchableOpacity>
                                </View>
                            )}

                            {/* CONFIRM_TEXT State (P16) */}
                            {voiceState === 'CONFIRM_TEXT' && (
                                <View style={{ gap: 12, width: '100%' }}>
                                    <Text style={[styles.voiceStatusText, { color: colors.subText }]}>인식 결과 확인</Text>
                                    <TextInput
                                        value={confirmText}
                                        onChangeText={setConfirmText}
                                        multiline
                                        editable
                                        style={[
                                            styles.confirmInput,
                                            {
                                                color: colors.text,
                                                borderColor: colors.border,
                                                backgroundColor: colors.card
                                            }
                                        ]}
                                        placeholder="인식된 텍스트를 확인/수정하세요"
                                        placeholderTextColor={colors.subText}
                                    />
                                    {!isConfirmTextValid && (
                                        <Text style={[styles.confirmHint, { color: colors.subText }]}>텍스트를 2자 이상 입력해주세요.</Text>
                                    )}
                                    <TouchableOpacity
                                        onPress={handleConfirmAnalysis}
                                        disabled={!isConfirmTextValid}
                                        style={[
                                            styles.stopButton,
                                            { backgroundColor: colors.primary, opacity: isConfirmTextValid ? 1 : 0.5 }
                                        ]}
                                    >
                                        <Text style={styles.stopButtonText}>✅ 승인하고 분석</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity onPress={restartLocalSTT} style={[styles.stopButton, { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }]}>
                                        <Text style={[styles.stopButtonText, { color: colors.text }]}>🎤 다시 말하기 (Local)</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity onPress={() => voiceService.startWhisperRecording()} style={{ padding: 8, alignSelf: 'center' }}>
                                        <Text style={{ color: colors.subText, fontSize: 13, textDecorationLine: 'underline' }}>정밀 인식(Whisper)으로 전환</Text>
                                    </TouchableOpacity>
                                </View>
                            )}

                            {/* QUALITY_FAIL State (P2) */}
                            {voiceState === 'QUALITY_FAIL' && (
                                <View style={{ gap: 12 }}>
                                    <TouchableOpacity onPress={restartLocalSTT} style={[styles.stopButton, { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }]}>
                                        <Text style={[styles.stopButtonText, { color: colors.text }]}>다시 시도 (빠름)</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity onPress={() => voiceService.startWhisperRecording()} style={[styles.stopButton, { backgroundColor: colors.primary }]}>
                                        <Text style={styles.stopButtonText}>🎙 정확하게 다시 말하기 (Whisper)</Text>
                                    </TouchableOpacity>
                                </View>
                            )}

                            {/* ERROR State - System Error */}
                            {voiceState === 'ERROR' && (
                                <View style={{ gap: 12 }}>
                                    <TouchableOpacity onPress={restartLocalSTT} style={[styles.stopButton, { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }]}>
                                        <Text style={[styles.stopButtonText, { color: colors.text }]}>다시 시도</Text>
                                    </TouchableOpacity>
                                </View>
                            )}

                            {/* Active Recording State (Local) */}
                            {voiceState === 'RECORDING_LOCAL' && (
                                <View style={{ gap: 12 }}>
                                    <TouchableOpacity onPress={() => finalizeLocalText(voiceText)} style={styles.stopButton}>
                                        <Text style={styles.stopButtonText}>완료</Text>
                                    </TouchableOpacity>
                                    {/* Allow switching to Whisper if local is bad */}
                                    <TouchableOpacity onPress={() => voiceService.startWhisperRecording()} style={{ padding: 10 }}>
                                        <Text style={{ color: colors.subText, textDecorationLine: 'underline' }}>잘 안되나요? 정밀 인식으로 전환</Text>
                                    </TouchableOpacity>
                                </View>
                            )}

                            {/* Active Recording State (Whisper) */}
                            {voiceState === 'RECORDING_WHISPER' && (
                                <TouchableOpacity onPress={handleStopWhisper} style={styles.stopButton}>
                                    <Text style={styles.stopButtonText}>완료</Text>
                                </TouchableOpacity>
                            )}
                        </View>
                    </LinearGradient>
                )}

                {/* Input Section (Hidden in Voice Mode unless needed fallback) */}
                {!isVoiceMode && (
                    <View style={styles.urlSection}>
                        <View
                            style={[
                                styles.inputContainer,
                                {
                                    backgroundColor: colors.card,
                                    borderColor: colors.border,
                                    height: inputHeight,
                                    borderWidth: 1,
                                },
                            ]}
                        >
                            <Ionicons name="link-outline" size={20} color={colors.subText} style={{ marginRight: 8, marginTop: 4 }} />
                            <TextInput
                                style={[styles.input, { color: colors.text, height: Math.max(36, inputHeight - 24) }]}
                                placeholder="URL 또는 문자 내용 붙여넣기"
                                placeholderTextColor={colors.subText}
                                value={url}
                                onChangeText={setUrl}
                                autoCapitalize="none"
                                multiline={true}
                                numberOfLines={3}
                                onContentSizeChange={(event) => {
                                    const height = event.nativeEvent.contentSize.height;
                                    const nextHeight = Math.min(Math.max(56, height + 24), 150);
                                    setInputHeight(nextHeight);
                                }}
                                textAlignVertical="top"
                                accessibilityLabel="URL 또는 텍스트 입력창"
                            />
                        </View>
                        <TouchableOpacity
                            style={[styles.urlButton, { backgroundColor: colors.primary }]}
                            onPress={handleUrlSubmit}
                            accessibilityLabel="링크 분석 버튼"
                        >
                            <Text style={styles.urlButtonText}>분석</Text>
                        </TouchableOpacity>
                    </View>
                )}

                {/* Divider (Hidden in Voice Mode) */}
                {!isVoiceMode && (
                    <View style={styles.divider}>
                        <View style={[styles.line, { backgroundColor: colors.border }]} />
                        <Text style={[styles.orText, { color: colors.subText }]}>또는 이미지 스캔</Text>
                        <View style={[styles.line, { backgroundColor: colors.border }]} />
                    </View>
                )}

                {/* Image Actions (Hidden in Voice Mode) */}
                {!isVoiceMode && (
                    <View style={styles.imageActions}>
                        <TouchableOpacity
                            style={[styles.largeCard, { backgroundColor: colors.card, shadowColor: colors.shadow }]}
                            onPress={pickImage}
                            accessibilityLabel="앨범에서 이미지 선택"
                        >
                            <View style={[styles.largeIconBox, { backgroundColor: '#E0F2FE' }]}>
                                <Ionicons name="images" size={48} color={Colors.navy} />
                            </View>
                            <View style={styles.largeCardContent}>
                                <Text style={[styles.largeCardTitle, { color: colors.text }]}>이미지 업로드</Text>
                                <Text style={[styles.largeCardDesc, { color: colors.subText }]}>앨범에서 선택하기</Text>
                            </View>
                            <Ionicons name="chevron-forward" size={24} color={colors.subText} />
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={[styles.largeCard, { backgroundColor: colors.card, shadowColor: colors.shadow }]}
                            onPress={takePhoto}
                            accessibilityLabel="직접 촬영하기"
                        >
                            <View style={[styles.largeIconBox, { backgroundColor: '#FEF3C7' }]}>
                                <Ionicons name="camera" size={48} color={Colors.orange} />
                            </View>
                            <View style={styles.largeCardContent}>
                                <Text style={[styles.largeCardTitle, { color: colors.text }]}>직접 촬영하기</Text>
                                <Text style={[styles.largeCardDesc, { color: colors.subText }]}>카메라로 찍기</Text>
                            </View>
                            <Ionicons name="chevron-forward" size={24} color={colors.subText} />
                        </TouchableOpacity>
                    </View>
                )}

                {/* OCR Settings Button (Hidden in Voice Mode) */}
                {!isVoiceMode && (
                    <TouchableOpacity
                        onPress={() => setSettingsVisible(true)}
                        style={{ marginTop: 24, alignSelf: 'center' }}
                        accessibilityLabel="OCR 전처리 설정"
                    >
                        <Text style={{ color: colors.subText, fontSize: 14, textDecorationLine: 'underline' }}>OCR 전처리 설정</Text>
                    </TouchableOpacity>
                )}

                {/* Voice Mode Hints */}
                {isVoiceMode && (
                    <View style={styles.hintContainer}>
                        <Text style={[styles.hintTitle, { color: colors.subText }]}>이렇게 말해보세요</Text>
                        <View style={styles.hintList}>
                            <Text style={styles.hintItem}>"내일 점심 12시 강남역 약속"</Text>
                            <Text style={styles.hintItem}>"스타벅스 5000원 결제"</Text>
                            <Text style={styles.hintItem}>"이번 주 토요일 친구 결혼식"</Text>
                        </View>
                    </View>
                )}

                {/* Scan Settings Modal */}
                <ScanSettingsModal
                    visible={settingsVisible}
                    onClose={() => setSettingsVisible(false)}
                    isEnabled={preprocessEnabled}
                    onToggle={handleTogglePreprocess}
                />
            </ScrollView>
        </View>
    );
}

// Helpers for UI
function getColorForState(state: VoiceState, colors: any) {
    switch (state) {
        case 'RECORDING_WHISPER': return Colors.red;
        case 'RECORDING_LOCAL': return Colors.primary;
        case 'PROCESSING': return Colors.green;
        case 'QUALITY_FAIL': return Colors.orange; // P2
        case 'CONFIRM_TEXT': return Colors.primary;
        default: return colors.subText;
    }
}

function getBgForState(state: VoiceState, colors: any) {
    if (state === 'RECORDING_WHISPER') return 'rgba(239, 68, 68, 0.05)';
    if (state === 'RECORDING_LOCAL') return 'rgba(59, 130, 246, 0.05)';
    if (state === 'QUALITY_FAIL') return 'rgba(255, 165, 0, 0.05)'; // P2
    if (state === 'CONFIRM_TEXT') return 'rgba(59, 130, 246, 0.03)';
    return 'transparent';
}

function getMessageForState(state: VoiceState) {
    switch (state) {
        case 'IDLE': return "준비 중...";
        case 'PROCESSING': return "잠시만요, 정리하고 있어요...";
        case 'RECORDING_WHISPER': return "듣고 있어요... (정밀 모드)";
        case 'RECORDING_LOCAL': return "말씀해주세요...";
        case 'QUALITY_FAIL': return "잘 못 들었어요. 다시 말씀해주세요.";
        case 'CONFIRM_TEXT': return "인식 결과를 확인해주세요.";
        case 'ERROR': return "오류가 발생했습니다.";
        default: return "";
    }
}

const styles = StyleSheet.create({
    header: { marginBottom: 40, alignItems: 'center' },
    title: {
        fontFamily: 'Pretendard-Bold',
        fontSize: 28,
        marginBottom: 10,
    },
    description: {
        fontFamily: 'Pretendard-Regular',
        fontSize: 16,
        textAlign: 'center',
        lineHeight: 24,
    },
    urlSection: { flexDirection: 'row', marginBottom: 24, gap: 12, alignItems: 'flex-start' },
    inputContainer: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'flex-start',
        borderRadius: 16,
        paddingHorizontal: 16,
        paddingVertical: 12,
        minHeight: 56,
        maxHeight: 150,
        borderWidth: 1,
    },
    input: {
        flex: 1,
        fontFamily: 'Pretendard-Medium',
        fontSize: 16,
    },
    confirmInput: {
        minHeight: 96,
        borderWidth: 1,
        borderRadius: 12,
        padding: 12,
        textAlignVertical: 'top',
        fontFamily: 'Pretendard-Regular',
        fontSize: 16,
    },
    confirmHint: {
        fontFamily: 'Pretendard-Regular',
        fontSize: 13,
        textAlign: 'center',
    },
    urlButton: {
        borderRadius: 16,
        paddingHorizontal: 20,
        justifyContent: 'center',
        height: 56,
    },
    urlButtonText: {
        fontFamily: 'Pretendard-Bold',
        color: Colors.white,
        fontSize: 16,
    },
    divider: { flexDirection: 'row', alignItems: 'center', marginBottom: 24 },
    line: { flex: 1, height: 1 },
    orText: {
        marginHorizontal: 16,
        fontFamily: 'Pretendard-Regular',
        fontSize: 14,
    },
    imageActions: { gap: 16 },
    largeCard: {
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: 24,
        padding: 20,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 12,
        elevation: 5,
        height: 100,
    },
    largeIconBox: {
        width: 60,
        height: 60,
        borderRadius: 30,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 20,
    },
    largeCardContent: { flex: 1 },
    largeCardTitle: {
        fontFamily: 'Pretendard-Bold',
        fontSize: 18,
        marginBottom: 4,
    },
    largeCardDesc: {
        fontFamily: 'Pretendard-Regular',
        fontSize: 14,
    },
    // Voice Mode Styles
    gradientBackground: {
        width: '100%',
        minHeight: 280,
        borderRadius: 24,
        marginBottom: 32,
        overflow: 'hidden',
    },
    glassCard: {
        flex: 1,
        alignItems: 'center',
        padding: 24,
        margin: 16,
        borderRadius: 20,
        backgroundColor: 'rgba(255, 255, 255, 0.85)',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 12,
        elevation: 8,
    },
    voiceStatusContainer: {
        alignItems: 'center',
        padding: 24,
        borderRadius: 24,
        borderWidth: 2,
        marginBottom: 32,
        borderStyle: 'dashed'
    },
    voiceIconContainer: {
        marginBottom: 12,
        position: 'relative'
    },
    recordingDot: {
        position: 'absolute',
        top: 0,
        right: -4,
        width: 10,
        height: 10,
        borderRadius: 5,
        backgroundColor: Colors.red
    },
    voiceStatusText: {
        fontFamily: 'Pretendard-Bold',
        fontSize: 14,
        textAlign: 'center',
        marginBottom: 20
    },
    previewText: {
        fontFamily: 'Pretendard-Bold',
        fontSize: 26,
        fontWeight: '600',
        color: '#1E3A8A',
        textAlign: 'center',
        marginTop: 16,
    },
    stopButton: {
        paddingHorizontal: 24,
        paddingVertical: 12,
        backgroundColor: Colors.navy,
        borderRadius: 30,
    },
    stopButtonText: {
        color: 'white',
        fontFamily: 'Pretendard-Bold',
        fontSize: 16
    },
    retryButton: {
        paddingHorizontal: 24,
        paddingVertical: 12,
        borderRadius: 30,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        shadowColor: Colors.orange,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 4
    },
    retryButtonText: {
        color: 'white',
        fontFamily: 'Pretendard-Bold',
        fontSize: 16
    },
    hintContainer: {
        marginTop: 20,
        paddingHorizontal: 20,
        alignItems: 'center'
    },
    hintTitle: {
        fontFamily: 'Pretendard-Medium',
        fontSize: 14,
        marginBottom: 12
    },
    hintList: {
        gap: 8,
        alignItems: 'center'
    },
    hintItem: {
        fontFamily: 'Pretendard-Regular',
        fontSize: 15,
        color: Colors.subText,
        backgroundColor: 'rgba(0,0,0,0.03)',
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 12,
        overflow: 'hidden'
    }
});
