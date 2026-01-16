import React, { useState, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Alert,
    TextInput,
    ScrollView
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import { Colors } from '../../constants/Colors';
import { Ionicons } from '@expo/vector-icons';
import { extractTextFromImage, preprocessRelativeDates } from '../../services/ocr';
import { analyzeImageText, analyzeImageVisual, ScannedData } from '../../services/ai/OpenAIService';
import { fetchUrlContent } from '../../services/WebScraperService';
import { DataStore } from '../../services/DataStore';
import { ScanSettingsModal } from '../../components/ScanSettingsModal';
import { useLoading } from '../../components/LoadingOverlay';
import { useTheme } from '../../contexts/ThemeContext';
import { setPreprocessEnabled, isPreprocessEnabled } from '../../services/ocrSettings';
import { common } from '../../styles/common';
import { showError } from '../../services/errorHandler';
import { getCurrentOcrLogger } from '../../services/OcrLogger';

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
    const loading = useLoading();
    const { colors } = useTheme();
    const [selectedImage, setSelectedImage] = useState<string | null>(null);
    const [url, setUrl] = useState('');
    const [settingsVisible, setSettingsVisible] = useState(false);
    const [preprocessEnabled, setPreprocessEnabledState] = useState(isPreprocessEnabled());

    useFocusEffect(
        useCallback(() => {
            setSelectedImage(null);
            setUrl('');
            DataStore.clear();
        }, [])
    );

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

    const processImage = async (uri: string) => {
        loading.show('Analyzing...');
        try {
            const text = await extractTextFromImage(uri);
            const textLength = text?.trim().length || 0;
            if (textLength > 5) {
                const preprocessed = preprocessRelativeDates(text);
                const results = await analyzeImageText(preprocessed);
                const valid = results.filter(r => r.type !== 'UNKNOWN');
                if (valid.length > 0) {
                    handleScanResult(valid, uri);
                    return;
                }
            }
            const base64 = await readImageAsBase64(uri);
            const visualResult = await analyzeImageVisual(base64);
            if (visualResult && visualResult.type !== 'UNKNOWN') {
                handleScanResult([visualResult], uri);
                return;
            }
            Alert.alert('분석 실패', '문서 내용을 인식할 수 없습니다.');
        } catch (e: any) {
            console.error(e);
            showError(e.message ?? '이미지 처리 중 오류가 발생했습니다.');
        } finally {
            const logger = getCurrentOcrLogger();
            if (logger) {
                await logger.flush();
            }
            loading.hide();
        }
    };

    const handleScanResult = (dataList: ScannedData[], uri: string) => {
        const sessionId = getCurrentOcrLogger()?.getSessionId();
        DataStore.setScanResult(uri, dataList, sessionId);
        router.push({ pathname: '/scan/result', params: { imageUri: uri } });
    };

    const handleUrlSubmit = async () => {
        if (!url) {
            Alert.alert('알림', 'URL을 입력해주세요.');
            return;
        }
        if (!url.startsWith('http')) {
            Alert.alert('오류', '올바른 URL 형식이 아닙니다 (http:// 또는 https:// 포함).');
            return;
        }
        loading.show('Analyzing URL...');
        try {
            const html = await fetchUrlContent(url);
            const results = await analyzeImageText(html);
            const valid = results.filter(r => r.type !== 'UNKNOWN');
            if (valid.length > 0) {
                handleScanResult(valid, url);
            } else {
                Alert.alert('분석 실패', 'URL 내용을 분석할 수 없습니다.');
            }
        } catch (e: any) {
            console.error(e);
            showError(e.message ?? 'URL을 분석할 수 없습니다.');
        } finally {
            loading.hide();
        }
    };

    const handleTestConnection = async () => {
        Alert.alert("테스트", "기능이 준비중입니다.");
    }

    return (
        <View style={[common.container, { backgroundColor: colors.background }]}>
            <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
                {/* Header */}
                <View style={styles.header}>
                    <Text style={[styles.title, { color: colors.text }]}>AI 문서 스캔</Text>
                    <Text style={[styles.description, { color: colors.subText }]}>
                        청첩장, 기프티콘, 송금내역을{'\n'}자동으로 분류하여 저장합니다.
                    </Text>
                    <TouchableOpacity
                        onPress={handleTestConnection}
                        style={{ marginTop: 10, padding: 8, backgroundColor: colors.card, borderRadius: 8 }}
                        accessibilityLabel="API 연결 테스트"
                    >
                        <Text style={{ fontSize: 12, color: colors.subText }}>⚡ API 연결 테스트</Text>
                    </TouchableOpacity>
                </View>

                {/* URL Input */}
                <View style={styles.urlSection}>
                    <View style={[styles.inputContainer, { backgroundColor: colors.card, borderColor: colors.border }]}>
                        <Ionicons name="link-outline" size={20} color={colors.subText} style={{ marginRight: 8 }} />
                        <TextInput
                            style={[styles.input, { color: colors.text }]}
                            placeholder="모바일 청첩장/부고 링크 붙여넣기"
                            placeholderTextColor={colors.subText}
                            value={url}
                            onChangeText={setUrl}
                            autoCapitalize="none"
                            accessibilityLabel="링크 입력창"
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

                {/* Divider */}
                <View style={styles.divider}>
                    <View style={[styles.line, { backgroundColor: colors.border }]} />
                    <Text style={[styles.orText, { color: colors.subText }]}>또는 이미지 스캔</Text>
                    <View style={[styles.line, { backgroundColor: colors.border }]} />
                </View>

                {/* Image Actions */}
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

                {/* OCR Settings Button */}
                <TouchableOpacity
                    onPress={() => setSettingsVisible(true)}
                    style={{ marginTop: 24, alignSelf: 'center' }}
                    accessibilityLabel="OCR 전처리 설정"
                >
                    <Text style={{ color: colors.subText, fontSize: 14, textDecorationLine: 'underline' }}>OCR 전처리 설정</Text>
                </TouchableOpacity>

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
    urlSection: { flexDirection: 'row', marginBottom: 24, gap: 12 },
    inputContainer: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: 16,
        paddingHorizontal: 16,
        height: 56,
        borderWidth: 1,
    },
    input: {
        flex: 1,
        fontFamily: 'Pretendard-Medium',
        fontSize: 16,
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
});
