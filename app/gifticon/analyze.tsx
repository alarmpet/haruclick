import { View, Text, StyleSheet, Image, ActivityIndicator, TouchableOpacity, Alert, TextInput, ScrollView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Colors } from '../../constants/Colors';
import { GifticonAnalysisService } from '../../services/GifticonAnalysis';
import { saveGifticon, saveUnifiedEvent, findPeopleByName, getAllPeople } from '../../services/supabase';
import { ScannedData } from '../../services/ai/OpenAIService';
import { extractTextFromImage } from '../../services/ocr';
import { getCurrentOcrLogger } from '../../services/OcrLogger';
import { SenderSelectModal } from '../../components/SenderSelectModal';
import { Ionicons } from '@expo/vector-icons';
import { PollService } from '../../services/PollService';

import { DataStore } from '../../services/DataStore';

export default function AnalyzeGifticonScreen() {
    const params = useLocalSearchParams();
    const router = useRouter();
    const [analyzing, setAnalyzing] = useState(true);
    const [result, setResult] = useState<any>(null);
    const [imageUri, setImageUri] = useState<string | null>(null);

    // Sender Selection State
    const [senderModalVisible, setSenderModalVisible] = useState(false);
    const [candidateNames, setCandidateNames] = useState<string[]>([]);
    const [isSenderConfirmed, setIsSenderConfirmed] = useState(false);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        // 1. Check DataStore (Preferred)
        const session = DataStore.getScanResult();

        // 2. Fallback to params (Legacy/Direct navigation)
        const uri = session.imageUri || (params.imageUri as string);
        const dataList = session.scannedDataList; // Fixed: was scannedData

        if (!uri) {
            Alert.alert('오류', '이미지 정보를 불러올 수 없습니다.');
            router.back();
            return;
        }

        setImageUri(uri);

        // Get first valid data from array
        const data = dataList && dataList.length > 0 ? dataList[0] : null;

        if (data) {
            // Data passed via DataStore
            setResult(data);
            setAnalyzing(false);
            if (data.senderName && data.senderName !== "Unknown") {
                checkSenderName(data.senderName);
            }
        } else if (params.scannedData) {
            // Data passed via params (JSON string)
            try {
                const parsed = JSON.parse(params.scannedData as string);
                setResult(parsed);
                setAnalyzing(false);
                if (parsed.senderName && parsed.senderName !== "Unknown") {
                    checkSenderName(parsed.senderName);
                }
            } catch (e) {
                console.error("Param Parse Error", e);
                // Fallback to Re-analysis
                performLocalAnalysis(uri);
            }
        } else {
            // No data, perform local analysis
            performLocalAnalysis(uri);
        }
    };

    const performLocalAnalysis = async (uri: string) => {
        setAnalyzing(true);
        console.log('[Analyze] state: analyzing=true');
        try {
            console.log('[Analyze] Starting Local OCR Analysis...', uri);
            const rawText = await extractTextFromImage(uri);
            console.log('[Analyze] OCR Finished. Text length:', rawText.length);

            const service = new GifticonAnalysisService();
            console.log('[Analyze] Calling analyzeWithAI...');
            const data = await service.analyzeWithAI(rawText);
            console.log('[Analyze] analyzeWithAI Returned:', JSON.stringify(data).substring(0, 100)); // Log first 100 chars

            setResult(data);
            console.log('[Analyze] Result state set.');

            if (data.senderName && data.senderName !== "Unknown") {
                checkSenderName(data.senderName);
            }
        } catch (e) {
            console.error('[Analyze] Analysis failed:', e);
            Alert.alert('분석 실패', '내용을 자동으로 인식하지 못했습니다.\n직접 입력하시겠습니까?', [
                {
                    text: '직접 입력',
                    onPress: () => {
                        setResult({
                            productName: "상품명 입력",
                            senderName: "보낸이 입력",
                            expiryDate: new Date().toISOString().split('T')[0],
                            estimatedPrice: 0,
                        });
                    }
                },
                {
                    text: '취소',
                    style: 'cancel',
                    onPress: () => router.back()
                }
            ]);
        } finally {
            console.log('[Analyze] Entering finally block');
            const logger = getCurrentOcrLogger();
            if (logger) {
                await logger.flush();
            }
            setAnalyzing(false);
            console.log('[Analyze] Finally: setAnalyzing(false) executed');
        }
    };

    const checkSenderName = async (name: string) => {
        const found = await findPeopleByName(name);
        if (found.length > 0) {
            // Check for exact match
            if (found.includes(name)) {
                // Exact match found. Auto-confirm but allow change. 
                // Currently just setting it, but marking confirmed makes UI cleaner
                setIsSenderConfirmed(true);
            } else {
                // Similar names found, but not exact.
                setCandidateNames(found);
                // We don't auto-show modal, let user click to clarify if needed, 
                // OR we can suggest it. For now, we trust AI unless user clicks edit.
            }
        }
        // If not found, it's a new name.
    };

    const handleOpenSenderModal = async () => {
        // Prepare candidates
        if (result?.senderName) {
            const found = await findPeopleByName(result.senderName);
            setCandidateNames(found);
        } else {
            const all = await getAllPeople();
            setCandidateNames(all.slice(0, 10)); // Show recent 10?
        }
        setSenderModalVisible(true);
    };

    const handleSearchPeople = async (text: string) => {
        if (!text) return await getAllPeople();
        return await findPeopleByName(text);
    };

    const handleSelectSender = (name: string) => {
        setResult({ ...result, senderName: name });
        setSenderModalVisible(false);
        setIsSenderConfirmed(true);
    };

    const handleConfirm = async () => {
        if (!result) return;
        try {
            console.log('[handleConfirm] 저장 시도:', JSON.stringify(result, null, 2));
            await saveUnifiedEvent(result, imageUri as string);
            console.log('[handleConfirm] 저장 성공!');
            Alert.alert('저장 완료', '내역이 저장되었습니다.', [
                { text: '확인', onPress: () => router.replace('/calendar') }
            ]);
        } catch (e: any) {
            console.error('[handleConfirm] 저장 실패:', e);
            Alert.alert('저장 실패', `오류: ${e?.message || '알 수 없는 오류'}`);
        }
    };

    const handleCreatePoll = async () => {
        if (!result) return;

        try {
            // Create poll summary based on analysis
            const summary = `${result.senderName ? `${result.senderName}님께` : '누군가'} ${result.productName}${result.productName?.endsWith('권') ? '을' : '를'} 받았어요. 답례로 얼마가 적당할까요?`;

            const poll = await PollService.createPoll({
                situationSummary: summary,
                context: {
                    productName: result.productName,
                    senderName: '익명', // Don't expose sender name for privacy
                    estimatedPrice: result.estimatedPrice,
                    occasion: '기프티콘 답례',
                },
            });

            if (poll) {
                Alert.alert(
                    '투표 생성 완료',
                    '다른 사람들의 의견을 들어보세요!',
                    [
                        { text: '하루 광장 보기', onPress: () => router.push('/community') },
                        { text: '확인' }
                    ]
                );
            } else {
                Alert.alert('오류', '투표 생성에 실패했습니다.');
            }
        } catch (e) {
            console.error('Poll creation error:', e);
            Alert.alert('오류', '투표 생성 중 문제가 발생했습니다.');
        }
    };

    const updateRecommendation = (relationship: string, attendance: string) => {
        let baseAmount = 50000; // Default

        // 1. Relationship Logic
        if (relationship === '가족') baseAmount = 200000;
        else if (relationship === '절친') baseAmount = 150000;
        else if (relationship === '친구') baseAmount = 100000;
        else if (relationship === '직장동료') baseAmount = 50000;
        else if (relationship === '지인') baseAmount = 30000;

        // 2. Attendance Logic
        if (attendance === '참석') {
            baseAmount += 50000; // Add meal cost
            if (baseAmount === 80000) baseAmount = 100000; // Round up quirks
        }

        setResult({
            ...result,
            relationship,
            attendance,
            estimatedPrice: baseAmount
        });
    };

    if (analyzing) {
        return (
            <View style={styles.container}>
                <ActivityIndicator size="large" color={Colors.orange} />
                <Text style={styles.loadingText}>AI가 기프티콘 정보를 분석하고 있습니다...</Text>
            </View>
        );
    }

    // Safety check: If not analyzing but no result, don't render content (likely navigating back)
    if (!result) return <View style={styles.container} />;

    return (
        <View style={styles.container}>
            <Image source={{ uri: imageUri as string }} style={styles.previewImage} resizeMode="contain" />

            <ScrollView style={styles.resultContainerContent}>
                <View style={styles.resultContainer}>
                    <Text style={styles.title}>
                        {result?.type === 'INVITATION' ? '경조사 분석' : '분석 결과'}
                    </Text>

                    {result?.type === 'INVITATION' ? (
                        /* INVITATION UI */
                        <>
                            <View style={styles.row}>
                                <Text style={styles.label}>경조사 종류</Text>
                                <TextInput
                                    style={styles.input}
                                    value={result?.productName || "결혼식"}
                                    onChangeText={(text) => setResult({ ...result, productName: text })}
                                />
                            </View>

                            <View style={styles.row}>
                                <Text style={styles.label}>초대받은 사람</Text>
                                <TextInput
                                    style={styles.input}
                                    value={result?.senderName || "Unknown"}
                                    onChangeText={(text) => setResult({ ...result, senderName: text })}
                                />
                            </View>

                            {/* Relationship Selector */}
                            <View style={styles.row}>
                                <Text style={styles.label}>나와의 관계</Text>
                                <View style={styles.chipContainer}>
                                    {['가족', '절친', '친구', '직장동료', '지인'].map((rel) => (
                                        <TouchableOpacity
                                            key={rel}
                                            style={[styles.chip, result?.relationship === rel && styles.activeChip]}
                                            onPress={() => updateRecommendation(rel, result?.attendance)}
                                        >
                                            <Text style={[styles.chipText, result?.relationship === rel && styles.activeChipText]}>{rel}</Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            </View>

                            {/* Attendance Selector */}
                            <View style={styles.row}>
                                <Text style={styles.label}>참석 여부</Text>
                                <View style={styles.chipContainer}>
                                    {['참석', '불참'].map((att) => (
                                        <TouchableOpacity
                                            key={att}
                                            style={[styles.chip, result?.attendance === att && styles.activeChip]}
                                            onPress={() => updateRecommendation(result?.relationship, att)}
                                        >
                                            <Text style={[styles.chipText, result?.attendance === att && styles.activeChipText]}>{att}</Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            </View>

                            <View style={styles.row}>
                                <Text style={styles.label}>추천 경조사비</Text>
                                <Text style={[styles.value, { color: Colors.orange, fontSize: 24 }]}>
                                    {(result?.estimatedPrice ?? 0).toLocaleString()}원
                                </Text>
                            </View>
                        </>
                    ) : result?.type === 'BANK_TRANSFER' ? (
                        /* BANK TRANSFER UI */
                        <>
                            <View style={styles.row}>
                                <Text style={styles.label}>거래 유형</Text>
                                <Text style={styles.value}>
                                    {result.transactionType === 'deposit' ? '입금' : '출금'}
                                </Text>
                            </View>

                            <View style={styles.row}>
                                <Text style={styles.label}>{result.transactionType === 'deposit' ? '보낸 분' : '받는 분'}</Text>
                                <TextInput
                                    style={styles.input}
                                    value={result.targetName || ""}
                                    onChangeText={(text) => setResult({ ...result, targetName: text })}
                                />
                            </View>

                            <View style={styles.row}>
                                <Text style={styles.label}>금액</Text>
                                <TextInput
                                    style={styles.input}
                                    value={String(result.amount)}
                                    keyboardType="numeric"
                                    onChangeText={(text) => setResult({ ...result, amount: parseInt(text) || 0 })}
                                />
                                <Text style={styles.value}>원</Text>
                            </View>

                            <View style={styles.row}>
                                <Text style={styles.label}>메모</Text>
                                <TextInput
                                    style={styles.input}
                                    value={result.memo || ""}
                                    placeholder="메모 입력"
                                    onChangeText={(text) => setResult({ ...result, memo: text })}
                                />
                            </View>
                        </>

                    ) : result?.type === 'STORE_PAYMENT' || result?.type === 'RECEIPT' ? (
                        /* STORE PAYMENT / RECEIPT UI */
                        <>
                            <View style={styles.row}>
                                <Text style={styles.label}>상호명</Text>
                                <TextInput
                                    style={styles.input}
                                    value={result.merchant || ""}
                                    onChangeText={(text) => setResult({ ...result, merchant: text })}
                                />
                            </View>

                            <View style={styles.row}>
                                <Text style={styles.label}>카테고리</Text>
                                <Text style={styles.value}>{result.category} {result.subCategory ? `> ${result.subCategory}` : ''}</Text>
                            </View>

                            <View style={styles.row}>
                                <Text style={styles.label}>결제 금액</Text>
                                <TextInput
                                    style={styles.input}
                                    value={String(result.amount)}
                                    keyboardType="numeric"
                                    onChangeText={(text) => setResult({ ...result, amount: parseInt(text) || 0 })}
                                />
                                <Text style={styles.value}>원</Text>
                            </View>

                            <View style={styles.row}>
                                <Text style={styles.label}>날짜</Text>
                                <Text style={styles.value}>{result.date}</Text>
                            </View>
                        </>

                    ) : (
                        /* GIFTICON UI (Existing) */
                        <>
                            <View style={styles.row}>
                                <Text style={styles.label}>상품명</Text>
                                <TextInput
                                    style={styles.input}
                                    value={result?.productName || ""}
                                    onChangeText={(text) => setResult({ ...result, productName: text })}
                                />
                            </View>
                            {result?.brandName && (
                                <View style={styles.row}>
                                    <Text style={styles.label}>브랜드</Text>
                                    <Text style={styles.value}>{result?.brandName}</Text>
                                </View>
                            )}

                            <View style={styles.row}>
                                <Text style={styles.label}>보낸 사람</Text>
                                <TouchableOpacity style={styles.senderSelector} onPress={handleOpenSenderModal}>
                                    <Text style={[styles.senderName, isSenderConfirmed && styles.confirmedText]}>
                                        {result?.senderName || "이름 없음"}
                                    </Text>
                                    <Ionicons name="create-outline" size={20} color={isSenderConfirmed ? Colors.green : Colors.orange} />
                                </TouchableOpacity>
                            </View>
                            <Text style={styles.helperText}>
                                {isSenderConfirmed ? "✓ 인맥 장부와 연결되었습니다." : "* 터치하여 인맥 장부에서 찾아보세요."}
                            </Text>

                            <View style={styles.row}>
                                <Text style={styles.label}>유효기간</Text>
                                <Text style={styles.value}>{result?.expiryDate}</Text>
                            </View>

                            <View style={styles.row}>
                                <Text style={styles.label}>바코드 번호</Text>
                                <TextInput
                                    style={styles.input}
                                    value={result?.barcodeNumber || ""}
                                    placeholder="0000 0000 0000"
                                    placeholderTextColor={Colors.subText}
                                    onChangeText={(text) => setResult({ ...result, barcodeNumber: text })}
                                />
                            </View>

                            <View style={styles.row}>
                                <Text style={styles.label}>예상 금액</Text>
                                <Text style={styles.value}>{(result?.estimatedPrice ?? 0).toLocaleString()}원</Text>
                            </View>
                        </>
                    )}

                    {/* AI 면책 문구 */}
                    <View style={styles.disclaimerContainer}>
                        <Ionicons name="information-circle-outline" size={14} color={Colors.subText} />
                        <Text style={styles.disclaimerText}>
                            AI 분석은 100% 정확하지 않을 수 있습니다. 저장 전 내용을 확인해주세요.
                        </Text>
                    </View>

                    <TouchableOpacity style={styles.button} onPress={handleConfirm}>
                        <Text style={styles.buttonText}>저장하기</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.pollButton} onPress={handleCreatePoll}>
                        <Ionicons name="people" size={20} color={Colors.white} style={{ marginRight: 8 }} />
                        <Text style={styles.pollButtonText}>익명으로 의견 물어보기</Text>
                    </TouchableOpacity>
                </View>
            </ScrollView>

            <SenderSelectModal
                visible={senderModalVisible}
                onClose={() => setSenderModalVisible(false)}
                onSelect={handleSelectSender}
                initialQuery={result?.senderName || ""}
                candidates={candidateNames}
                onSearch={handleSearchPeople}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.background,
    },
    loadingText: {
        color: Colors.text,
        marginTop: 20,
        fontFamily: 'Pretendard-Bold',
        fontSize: 18,
        textAlign: 'center',
    },
    heroContainer: {
        width: '100%',
        height: 350,
        backgroundColor: Colors.navy,
        borderBottomLeftRadius: 32,
        borderBottomRightRadius: 32,
        overflow: 'hidden',
        elevation: 10,
        shadowColor: Colors.shadow,
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.3,
        shadowRadius: 20,
    },
    previewImage: {
        width: '100%',
        height: '45%', // Reduced from 100% to allow space for content
        backgroundColor: Colors.navy, // Fallback background
    },
    resultContainerContent: {
        flex: 1,
        marginTop: -24, // Slight overlap for design effect
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
    },
    resultContainer: {
        backgroundColor: Colors.background, // Changed to solid background to cover image
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        padding: 24,
        paddingBottom: 100, // Extra padding for scrolling
        minHeight: 500,
        shadowColor: Colors.shadow,
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.1,
        shadowRadius: 12,
        elevation: 8,
    },
    title: {
        fontFamily: 'Pretendard-Bold',
        fontSize: 24,
        color: Colors.text,
        marginBottom: 24,
        textAlign: 'center',
    },
    row: {
        marginBottom: 20,
        borderBottomWidth: 1,
        borderBottomColor: Colors.border,
        paddingBottom: 16,
    },
    label: {
        fontFamily: 'Pretendard-Medium',
        color: Colors.subText,
        fontSize: 13,
        marginBottom: 8,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    value: {
        fontFamily: 'Pretendard-Bold',
        color: Colors.text,
        fontSize: 18,
    },
    input: {
        fontFamily: 'Pretendard-Bold',
        color: Colors.text,
        fontSize: 18,
        padding: 0,
    },
    senderSelector: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    senderName: {
        fontFamily: 'Pretendard-Bold',
        color: Colors.text,
        fontSize: 18,
    },
    confirmedText: {
        color: Colors.green,
    },
    helperText: {
        fontFamily: 'Pretendard-Regular',
        fontSize: 12,
        color: Colors.orange,
        marginTop: 8,
    },
    button: {
        backgroundColor: Colors.navy,
        borderRadius: 16,
        paddingVertical: 18,
        alignItems: 'center',
        marginTop: 32,
        shadowColor: Colors.orange,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 12,
        elevation: 8,
    },
    buttonText: {
        color: Colors.white,
        fontFamily: 'Pretendard-Bold',
        fontSize: 18,
    },
    pollButton: {
        backgroundColor: Colors.orange,
        borderRadius: 16,
        paddingVertical: 16,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 12,
        shadowColor: Colors.navy,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 12,
        elevation: 6,
    },
    pollButtonText: {
        color: Colors.white,
        fontFamily: 'Pretendard-Bold',
        fontSize: 16,
    },
    chipContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    chip: {
        backgroundColor: Colors.card,
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: Colors.border,
    },
    activeChip: {
        backgroundColor: Colors.navy,
        borderColor: Colors.navy,
    },
    chipText: {
        fontFamily: 'Pretendard-Medium',
        color: Colors.subText,
        fontSize: 14,
    },
    activeChipText: {
        color: Colors.white,
        fontFamily: 'Pretendard-Bold',
    },
    disclaimerContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 24,
        marginBottom: 8,
        paddingHorizontal: 16,
        gap: 6,
    },
    disclaimerText: {
        fontFamily: 'Pretendard-Regular',
        fontSize: 12,
        color: Colors.subText,
        textAlign: 'center',
    },
    // Missing inputContainer kept just in case but ideally removed
    inputContainer: {

    },
});
