import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, ActivityIndicator, Switch, Modal, TextInput, KeyboardAvoidingView, Platform as RNPlatform, Linking } from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { Colors } from '../../constants/Colors';
import { Ionicons } from '@expo/vector-icons';
import { ScannedData, InvitationResult, ReceiptResult, TransferResult, BillResult, SocialResult, BankTransactionResult, StorePaymentResult, GifticonResult } from '../../services/ai/OpenAIService';
import { useState, useEffect, useCallback, useRef } from 'react';
import { saveUnifiedEvent } from '../../services/supabase';
import { logOcrCorrections } from '../../services/ocrCorrections';
import { getImageHash } from '../../services/imageHash';


import { PollService } from '../../services/PollService';
import { RecommendationEngine, RecommendationResult, HOTEL_MEAL_COSTS, CONVENTION_MEAL_COSTS } from '../../services/RecommendationEngine';
import { RecommendationTable } from '../../components/RecommendationTable'; // ✅ 테이블 컴포넌트 추가

import { DataStore } from '../../services/DataStore';
import { FeedbackModal } from '../../components/FeedbackModal';
import { SuccessModal } from '../../components/SuccessModal';

// ✅ 카테고리 상수 (대분류 -> 소분류 매핑)
const CATEGORIES: Record<string, string[]> = {
    '식비': ['식료품', '외식/배달', '카페/베이커리'],
    '주거/통신/광열': ['주거/관리비', '통신비', '전기/가스/수도'],
    '교통/차량': ['대중교통', '자차/유지', '주유', '택시'],
    '문화/여가': ['OTT/구독', '여행', '문화생활', '게임'],
    '쇼핑/생활': ['온라인', '오프라인', '생활용품'],
    '의료/건강': ['병원', '약국', '건강식품'],
    '교육': ['학원/과외', '서적', '온라인강의'],
    '비소비지출/금융': ['이자/세금', '보험', '경조사', '기부'],
    '인맥': ['경조사', '선물', '모임'],
    '기타': ['기타', '미분류'],
};

// ✅ 날짜 유효성 체크 헬퍼 함수
const isValidDate = (dateStr: string | undefined | null): boolean => {
    if (!dateStr || dateStr.trim() === '' || dateStr === '날짜 없음') {
        return false;
    }
    // YYYY-MM-DD 또는 MM/DD HH:mm 형식 체크
    const hasYear = /\d{4}-\d{2}-\d{2}/.test(dateStr);
    const hasMonthDay = /\d{1,2}\/\d{1,2}/.test(dateStr);
    return hasYear || hasMonthDay;
};

const formatDisplayDateTime = (value?: string): string => {
    if (!value) return '';
    const text = value.trim();
    const match = text.match(/(\d{4}-\d{2}-\d{2})[ Tt\-]*(\d{1,2}:\d{2})?/);
    if (!match) return value;
    return match[2] ? `${match[1]}-${match[2]}` : match[1];
};

const normalizeDateInput = (value: string): string => {
    const text = value.trim();
    const match = text.match(/(\d{4}-\d{2}-\d{2})[ Tt\-]*(\d{1,2}:\d{2})?/);
    if (!match) return text;
    if (match[2]) return `${match[1]} ${match[2]}`;
    return match[1];
};

const CATEGORY_LIST = Object.keys(CATEGORIES);

// ✅ 관계 선택 상수 (확장)
const RELATIONS = ['직계가족', '형제자매', '가족', '절친', '친한 친구', '직장 동료', '대학 동기', '지인', '거래처'];

// 💳 간편 송금 앱 정보
const PAY_APPS = [
    {
        key: 'toss',
        label: '토스',
        color: '#0064FF',
        url: (amount: number) => `toss://send?amount=${amount}`,
        icon: '💙'
    },
    {
        key: 'kakaopay',
        label: '카카오페이',
        color: '#FEE500',
        textColor: '#3C1E1E',
        url: (amount: number) => `kakaopay://send?amount=${amount}`,
        icon: '💛'
    },
    {
        key: 'naverpay',
        label: '네이버페이',
        color: '#03C75A',
        url: (amount: number) => `naversearchapp://pay?amount=${amount}`,
        icon: '💚'
    },
    {
        key: 'samsungpay',
        label: '삼성페이',
        color: '#1428A0',
        url: (amount: number) => `samsungpay://send?amount=${amount}`,
        icon: '💜'
    },
];

const stableStringify = (value: any): string => {
    if (Array.isArray(value)) {
        return `[${value.map(stableStringify).join(',')}]`;
    }
    if (value && typeof value === 'object') {
        const keys = Object.keys(value).sort();
        return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
    }
    return JSON.stringify(value);
};

export default function SmartScanResultScreen() {
    const params = useLocalSearchParams();
    const router = useRouter();

    // ✅ 배열 지원: 여러 거래 리스트
    const [dataList, setDataList] = useState<ScannedData[]>([]);
    const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
    const [imageUri, setImageUri] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const originalDataRef = useRef<ScannedData[] | null>(null);
    const ocrSessionIdRef = useRef<string | null>(null);

    // ✅ 개별 항목 편집 모드 (null이면 리스트 뷰, 숫자면 해당 인덱스 편집 중)
    const [editingIndex, setEditingIndex] = useState<number | null>(null);

    // 단일 항목 편집용 (INVITATION 등)
    const [selectedRelation, setSelectedRelation] = useState<string | null>(null);
    const [isAttending, setIsAttending] = useState(true);
    const [recommendation, setRecommendation] = useState<RecommendationResult | null>(null);

    // 민심 물어보기 Modal 상태
    const [pollModalVisible, setPollModalVisible] = useState(false);
    const [pollStory, setPollStory] = useState('');
    const [creatingPoll, setCreatingPoll] = useState(false);

    // ✅ 카테고리 선택 모달 상태
    const [categoryModalVisible, setCategoryModalVisible] = useState(false);
    const [categoryModalType, setCategoryModalType] = useState<'category' | 'subCategory'>('category');
    const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

    // ✅ 날짜 피커 모달 상태
    const [datePickerVisible, setDatePickerVisible] = useState(false);
    const [datePickerTargetIndex, setDatePickerTargetIndex] = useState<number | null>(null);
    const today = new Date();
    const [pickerYear, setPickerYear] = useState(today.getFullYear());
    const [pickerMonth, setPickerMonth] = useState(today.getMonth() + 1);
    const [pickerDay, setPickerDay] = useState(today.getDate());

    // ✅ OCR 피드백 모달 상태
    const [ocrFeedbackVisible, setOcrFeedbackVisible] = useState(false);

    // ✅ 성공 모달 상태
    const [successModalVisible, setSuccessModalVisible] = useState(false);
    const [successMessage, setSuccessMessage] = useState('');

    useFocusEffect(
        useCallback(() => {
            const loadData = async () => {
                const session = DataStore.getScanResult();
                const sessionUri = session.imageUri;
                const paramsUri = params.imageUri as string;

                const uri = sessionUri || paramsUri;
                setImageUri(uri);
                ocrSessionIdRef.current = session.ocrSessionId ?? null;

                console.log("Loading Data... Store:", !!session.scannedDataList);

                let loadedList: ScannedData[] = [];

                if (session.scannedDataList && session.scannedDataList.length > 0) {
                    loadedList = session.scannedDataList;
                } else if (params.scannedData) {
                    // 구버전 호환: 단일 데이터도 지원
                    try {
                        const single = JSON.parse(params.scannedData as string);
                        loadedList = [single];
                    } catch (e) {
                        console.error("JSON Parse Error:", e);
                    }
                }

                if (loadedList.length > 0) {
                    setDataList(loadedList);
                    originalDataRef.current = loadedList.map((item) => JSON.parse(JSON.stringify(item)));
                    // ✅ 날짜가 있는 항목만 기본 선택
                    const validIndices = loadedList
                        .map((item, i) => ({ item, i }))
                        .filter(({ item }) => isValidDate((item as any).date || (item as any).eventDate))
                        .map(({ i }) => i);
                    setSelectedIndices(new Set(validIndices));

                    // 첫 번째가 INVITATION이면 추천 로직 실행
                    const firstItem = loadedList[0];
                    if (firstItem.type === 'INVITATION') {
                        const invite = firstItem as InvitationResult;
                        const result = RecommendationEngine.recommend(
                            invite.eventType || 'wedding',
                            '친한 친구',
                            true,
                            invite.eventLocation
                        );
                        setRecommendation(result);
                    }
                }
            };

            loadData();
        }, [params.imageUri])
    );

    // ✅ 편집 중인 항목 또는 첫 번째 항목 참조
    const data = editingIndex !== null ? dataList[editingIndex] : (dataList[0] || null);

    // ✅ 개별 항목 편집 모드 진입
    const openEditMode = (index: number) => {
        setEditingIndex(index);
    };

    // ✅ 편집 완료 후 리스트로 돌아가기
    const closeEditMode = () => {
        setEditingIndex(null);
    };

    // ✅ 편집 중인 항목 업데이트
    const updateEditingItem = (field: string, value: any) => {
        if (editingIndex === null) return;

        setDataList(prev => {
            const newList = [...prev];
            newList[editingIndex] = {
                ...newList[editingIndex],
                [field]: value
            } as ScannedData;
            return newList;
        });
    };

    const buildCorrections = () => {
        const originalList = originalDataRef.current;
        if (!originalList || originalList.length === 0) return [];

        const corrections: Array<{
            itemIndex: number;
            originalData: ScannedData | null;
            correctedData: ScannedData;
            wasSelected: boolean;
        }> = [];

        const max = Math.max(originalList.length, dataList.length);
        for (let i = 0; i < max; i += 1) {
            const original = originalList[i] ?? null;
            const updated = dataList[i];
            if (!updated) continue;
            if (!original || stableStringify(original) !== stableStringify(updated)) {
                corrections.push({
                    itemIndex: i,
                    originalData: original,
                    correctedData: updated,
                    wasSelected: selectedIndices.has(i)
                });
            }
        }

        return corrections;
    };

    // ✅ 카테고리 선택 모달 열기
    const openCategoryModal = (type: 'category' | 'subCategory', currentCategory?: string) => {
        setCategoryModalType(type);
        setSelectedCategory(currentCategory || null);
        setCategoryModalVisible(true);
    };

    // ✅ 날짜 피커 모달 열기
    const openDatePicker = (index: number) => {
        setDatePickerTargetIndex(index);
        // 기존 날짜가 있으면 그 날짜로 초기화
        const item = dataList[index];
        const existingDate = (item as any).date || (item as any).eventDate;
        if (existingDate && isValidDate(existingDate)) {
            const [datePart] = existingDate.split(' ');
            const parts = datePart.split('-');
            if (parts.length === 3) {
                setPickerYear(parseInt(parts[0], 10));
                setPickerMonth(parseInt(parts[1], 10));
                setPickerDay(parseInt(parts[2], 10));
            }
        } else {
            // 오늘 날짜로 초기화
            const today = new Date();
            setPickerYear(today.getFullYear());
            setPickerMonth(today.getMonth() + 1);
            setPickerDay(today.getDate());
        }
        setDatePickerVisible(true);
    };

    // ✅ 날짜 피커 선택 완료
    const handleDatePickerConfirm = () => {
        if (datePickerTargetIndex === null) return;

        const dateStr = `${pickerYear}-${String(pickerMonth).padStart(2, '0')}-${String(pickerDay).padStart(2, '0')}`;

        setDataList(prev => {
            const newList = [...prev];
            const target = newList[datePickerTargetIndex];

            // GIFTICON checks
            if (target.type === 'GIFTICON') {
                newList[datePickerTargetIndex] = {
                    ...target,
                    expiryDate: dateStr
                } as ScannedData;
            } else {
                newList[datePickerTargetIndex] = {
                    ...target,
                    date: dateStr
                } as ScannedData;
            }
            return newList;
        });

        // 날짜가 입력되면 자동 선택
        setSelectedIndices(prev => {
            const newSet = new Set(prev);
            newSet.add(datePickerTargetIndex);
            return newSet;
        });

        setDatePickerVisible(false);
        setDatePickerTargetIndex(null);
    };

    // ✅ 카테고리 선택 핸들러 (대분류/소분류 독립 선택)
    const handleCategorySelect = (value: string) => {
        if (categoryModalType === 'category') {
            // 편집 모드인지 확인
            if (editingIndex !== null) {
                updateEditingItem('category', value);
            } else {
                handleUpdateData('category', value);
            }
            setSelectedCategory(value);
        } else {
            if (editingIndex !== null) {
                updateEditingItem('subCategory', value);
            } else {
                handleUpdateData('subCategory', value);
            }
        }
        setCategoryModalVisible(false);
    };

    // ✅ 체크박스 토글 핸들러
    const toggleSelect = (index: number) => {
        setSelectedIndices(prev => {
            const newSet = new Set(prev);
            if (newSet.has(index)) {
                newSet.delete(index);
            } else {
                newSet.add(index);
            }
            return newSet;
        });
    };

    // ✅ 전체 선택/해제
    const toggleSelectAll = () => {
        if (selectedIndices.size === dataList.length) {
            setSelectedIndices(new Set());
        } else {
            setSelectedIndices(new Set(dataList.map((_, i) => i)));
        }
    };

    // ✅ 관계 변경 핸들러
    const handleRelationChange = (relation: string) => {
        setSelectedRelation(relation);
        if (data?.type === 'INVITATION') {
            const invite = data as InvitationResult;
            const result = RecommendationEngine.recommend(
                invite.eventType || 'wedding',
                relation,
                isAttending,
                invite.eventLocation
            );
            setRecommendation(result);
        }
    };

    // ✅ 참석 여부 변경 핸들러
    const handleAttendanceChange = (attending: boolean) => {
        setIsAttending(attending);
        if (data?.type === 'INVITATION' && selectedRelation) {
            const invite = data as InvitationResult;
            const result = RecommendationEngine.recommend(
                invite.eventType || 'wedding',
                selectedRelation,
                attending,
                invite.eventLocation
            );
            setRecommendation(result);
        }
    };

    // ✅ 송금 입/출금 변경 핸들러 (단일 항목용)
    const handleTransferTypeChange = (received: boolean) => {
        if (dataList.length === 1 && data?.type === 'TRANSFER') {
            const transfer = data as TransferResult;
            setDataList([{ ...transfer, isReceived: received }]);
        }
    };

    // ✅ 은행 이체 타입 변경 핸들러 (단일 항목용)
    const handleBankTransactionTypeChange = (isDeposit: boolean) => {
        if (dataList.length === 1 && data?.type === 'BANK_TRANSFER') {
            const trans = data as BankTransactionResult;
            setDataList([{ ...trans, transactionType: isDeposit ? 'deposit' : 'withdrawal' } as ScannedData]);
        }
    };

    // ✅ 영수증/이체 데이터 수정 핸들러 (단일 항목용)
    const handleUpdateData = (field: string, value: any) => {
        if (dataList.length !== 1 || !data) return;

        setDataList([{
            ...data,
            [field]: value
        } as ScannedData]);
    };

    if (dataList.length === 0) return <View style={styles.container}><ActivityIndicator /></View>;

    // ✅ 일괄 저장 (선택된 항목만)
    const handleSave = async () => {
        if (selectedIndices.size === 0) {
            Alert.alert('선택 필요', '저장할 항목을 선택해주세요.');
            return;
        }

        setSaving(true);
        try {
            const selectedItems = dataList.filter((_, i) => selectedIndices.has(i));

            // ✅ 날짜 없는 항목 체크
            // ✅ 날짜 없는 항목 체크
            const itemsWithoutDate = selectedItems.filter(item => !isValidDate((item as any).date || (item as any).eventDate || (item as any).expiryDate));
            if (itemsWithoutDate.length > 0) {
                Alert.alert(
                    '날짜 필요',
                    `선택한 항목 중 ${itemsWithoutDate.length}건에 날짜 정보가 없습니다.\n날짜가 없는 항목은 저장할 수 없습니다.\n\n해당 항목을 터치하여 날짜를 직접 입력해주세요.`
                );
                setSaving(false);
                return;
            }

            console.log(`[일괄 저장] ${selectedItems.length}건 저장 시작`);

            for (const item of selectedItems) {
                // INVITATION인 경우 사용자 선택 정보 반영
                if (item.type === 'INVITATION' && selectedRelation) {
                    const invite = item as InvitationResult;
                    invite.relation = selectedRelation;
                    if (recommendation) {
                        invite.recommendedAmount = recommendation.recommendedAmount;
                        invite.recommendationReason = recommendation.reason;
                    }
                }
                await saveUnifiedEvent(item, imageUri as string);
            }

            const corrections = buildCorrections();
            if (corrections.length > 0) {
                try {
                    const imageHash = imageUri ? await getImageHash(imageUri) : undefined;
                    await logOcrCorrections({
                        sessionId: ocrSessionIdRef.current,
                        imageHash,
                        source: 'scan_result',
                        corrections
                    });
                } catch (logError) {
                    console.warn('Failed to log OCR corrections:', logError);
                }
            }

            setSuccessMessage(`${selectedItems.length}건이 저장되었습니다`);
            setSuccessModalVisible(true);
        } catch (e: any) {
            const errorMessage = e?.message || e?.toString() || '알 수 없는 오류';
            Alert.alert('저장 실패', `저장 중 오류가 발생했습니다.\n\n상세: ${errorMessage}`);
            console.error('[handleSave] Error:', e);
        } finally {
            setSaving(false);
        }
    };

    // ✅ 민심 물어보기 Modal 열기
    const openPollModal = () => {
        if (!data || data.type !== 'INVITATION') return;
        const invite = data as InvitationResult;
        // 기본 사연 템플릿 제공 (사용자가 수정 가능)
        const defaultStory = `${invite.eventType === 'wedding' ? '결혼식' : invite.eventType === 'funeral' ? '장례식' : '돌잔치'} 초대를 받았는데, 얼마를 내야 할지 고민됩니다.\n\n관계: ${selectedRelation || '친한 친구'}\n참석 여부: ${isAttending ? '참석 예정' : '불참'}`;
        setPollStory(defaultStory);
        setPollModalVisible(true);
    };

    // ✅ 민심 투표 생성 핸들러
    const handleCreatePoll = async () => {
        if (!data || data.type !== 'INVITATION' || !pollStory.trim()) {
            Alert.alert('오류', '사연을 입력해주세요.');
            return;
        }

        const invite = data as InvitationResult;
        setCreatingPoll(true);

        try {
            const poll = await PollService.createPoll({
                situationSummary: pollStory.trim(),
                context: {
                    productName: invite.eventType,
                    senderName: '익명',
                    estimatedPrice: recommendation?.recommendedAmount || 100000,
                    occasion: invite.eventType,
                },
            });

            if (poll) {
                setPollModalVisible(false);
                setPollStory('');
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
        } finally {
            setCreatingPoll(false);
        }
    };

    // ✅ 간편 송금 앱 실행 핸들러
    const handlePayment = async (payApp: typeof PAY_APPS[0]) => {
        const amount = recommendation?.recommendedAmount || 100000;
        const url = payApp.url(amount);
        try {
            // Android 11+ 패키지 가시성 제한으로 인해 canOpenURL 체크 없이 바로 실행 시도
            await Linking.openURL(url);
        } catch (error) {
            console.log('Payment app open error:', error);
            // 앱이 없거나 실행 실패 시 스토어로 안내
            Alert.alert(
                `${payApp.label} 앱 없음`,
                `${payApp.label} 앱이 설치되어 있지 않거나 실행할 수 없습니다. 설치 페이지로 이동하시겠습니까?`,
                [
                    { text: '취소', style: 'cancel' },
                    {
                        text: '앱스토어 열기', onPress: () => {
                            const storeLinks: Record<string, string> = {
                                toss: 'https://apps.apple.com/kr/app/toss/id839333328',
                                kakaopay: 'https://apps.apple.com/kr/app/kakaopay/id1464496236',
                                naverpay: 'https://apps.apple.com/kr/app/naver/id393499958',
                                samsungpay: 'https://apps.apple.com/kr/app/samsung-pay/id1112847109',
                            };
                            Linking.openURL(storeLinks[payApp.key]);
                        }
                    }
                ]
            );
        }
    };

    // ✅ 여러 건의 거래를 간소화된 카드 리스트로 렌더링
    const renderMultiTransactionList = () => {
        return (
            <>
                {/* 상단 요약 */}
                <View style={styles.card}>
                    <View style={styles.headerRow}>
                        <Ionicons name="list-outline" size={24} color={Colors.navy} />
                        <Text style={styles.cardTitle}>{dataList.length}건의 거래 감지됨</Text>
                    </View>
                    <TouchableOpacity onPress={toggleSelectAll} style={styles.selectAllRow}>
                        <Ionicons
                            name={selectedIndices.size === dataList.length ? "checkbox" : "square-outline"}
                            size={24}
                            color={Colors.navy}
                        />
                        <Text style={styles.selectAllText}>
                            {selectedIndices.size === dataList.length ? '전체 해제' : '전체 선택'}
                        </Text>
                    </TouchableOpacity>
                </View>

                {/* 거래 목록 */}
                {dataList.map((item, index) => {
                    const isSelected = selectedIndices.has(index);
                    const isDeposit = item.type === 'BANK_TRANSFER' && (item as BankTransactionResult).transactionType === 'deposit';
                    const dateValue = (item as any).date || (item as any).eventDate || (item as any).expiryDate;
                    const hasValidDate = isValidDate(dateValue);

                    return (
                        <View
                            key={index}
                            style={[styles.transactionCard, isSelected && styles.transactionCardSelected, !hasValidDate && styles.transactionCardWarning]}
                        >
                            {/* 체크박스 영역 - 토글 */}
                            <TouchableOpacity
                                style={styles.checkboxContainer}
                                onPress={() => {
                                    if (!hasValidDate && !isSelected) {
                                        // 날짜 없는 항목 선택 시 바로 날짜 피커 열기
                                        openDatePicker(index);
                                        return;
                                    }
                                    toggleSelect(index);
                                }}
                            >
                                <Ionicons
                                    name={isSelected ? "checkbox" : "square-outline"}
                                    size={24}
                                    color={isSelected ? Colors.orange : (!hasValidDate ? '#C62828' : Colors.subText)}
                                />
                            </TouchableOpacity>

                            {/* 내용 영역 - 편집 모드 진입 */}
                            <TouchableOpacity
                                style={styles.transactionInfo}
                                onPress={() => openEditMode(index)}
                            >
                                <View style={styles.transactionHeader}>
                                    <Text style={styles.transactionType}>
                                        {item.type === 'BANK_TRANSFER'
                                            ? (isDeposit ? '🔵 입금' : '🔴 출금')
                                            : item.type === 'STORE_PAYMENT' ? '🛒 결제'
                                                : item.type === 'GIFTICON' ? '🎁 기프티콘'
                                                    : item.type === 'APPOINTMENT' ? '📅 일정'
                                                        : item.type}
                                    </Text>
                                    <Text style={[
                                        styles.transactionAmount,
                                        { color: isDeposit ? '#1565C0' : item.type === 'GIFTICON' ? Colors.text : item.type === 'APPOINTMENT' ? Colors.subText : '#C62828' }
                                    ]}>
                                        {item.type === 'GIFTICON'
                                            ? ((item as any).estimatedPrice ? `${((item as any).estimatedPrice).toLocaleString()}원` : '금액 미입력')
                                            : item.type === 'APPOINTMENT' ? ((item as any).location || '')
                                                : (isDeposit ? '+' : '-') + ((item as any).amount || 0).toLocaleString() + '원'}
                                    </Text>
                                </View>
                                <Text style={styles.transactionTarget}>
                                    {item.type === 'GIFTICON'
                                        ? ((item as any).productName || '상품명 없음')
                                        : item.type === 'APPOINTMENT'
                                            ? ((item as any).title || '일정')
                                            : ((item as any).targetName || (item as any).merchant || '알 수 없음')}
                                </Text>
                                <View style={styles.editHintRow}>
                                    {hasValidDate ? (
                                        <Text style={styles.transactionDate}>
                                            {dateValue}
                                        </Text>
                                    ) : (
                                        <View style={styles.noDateWarning}>
                                            <Ionicons name="warning" size={14} color="#C62828" />
                                            <Text style={styles.noDateText}>날짜 없음 - 직접 입력 필요</Text>
                                        </View>
                                    )}
                                    <View style={styles.editHint}>
                                        <Ionicons name="create-outline" size={14} color={Colors.subText} />
                                        <Text style={styles.editHintText}>수정</Text>
                                    </View>
                                </View>
                            </TouchableOpacity>
                        </View>
                    );
                })}

                {/* ✅ OCR 피드백 링크 */}
                <TouchableOpacity
                    style={styles.feedbackLink}
                    onPress={() => setOcrFeedbackVisible(true)}
                >
                    <Ionicons name="chatbubble-ellipses-outline" size={16} color={Colors.subText} />
                    <Text style={styles.feedbackLinkText}>AI 분류가 잘못됐나요? 의견 보내기</Text>
                </TouchableOpacity>
            </>
        );
    };

    // ✅ 개별 항목 편집 화면 렌더링
    const renderEditMode = () => {
        if (editingIndex === null || !data) return null;

        const isDeposit = data.type === 'BANK_TRANSFER' && (data as BankTransactionResult).transactionType === 'deposit';

        return (
            <>
                {/* 상단 헤더 */}
                <View style={styles.editModeHeader}>
                    <TouchableOpacity style={styles.editModeBackButton} onPress={closeEditMode}>
                        <Ionicons name="arrow-back" size={24} color={Colors.text} />
                    </TouchableOpacity>
                    <Text style={styles.editModeTitle}>거래 내역 수정</Text>
                </View>

                {/* 타입별 편집 폼 - 기존 renderContent 로직 재사용 */}
                {data.type === 'BANK_TRANSFER' && (
                    <View style={styles.card}>
                        <View style={styles.headerRow}>
                            <Ionicons name="card-outline" size={24} color={Colors.navy} />
                            <Text style={styles.cardTitle}>은행 거래 수정</Text>
                        </View>
                        <View style={styles.divider} />

                        <EditableRow
                            label="금액"
                            value={String((data as any).amount || 0)}
                            keyboardType="numeric"
                            onChangeText={(text) => updateEditingItem('amount', parseInt(text.replace(/[^0-9]/g, '') || '0', 10))}
                            isCurrency
                        />
                        <EditableRow
                            label={isDeposit ? '보낸 사람' : '받는 사람'}
                            value={(data as any).targetName || ''}
                            onChangeText={(text) => updateEditingItem('targetName', text)}
                        />
                        <View style={styles.infoRow}>
                            <Text style={styles.infoLabel}>날짜</Text>
                            <TouchableOpacity
                                style={styles.categorySelect}
                                onPress={() => openDatePicker(editingIndex!)}
                            >
                                <Text style={styles.categorySelectText}>
                                    {(data as any).date || 'YYYY-MM-DD'}
                                </Text>
                                <Ionicons name="calendar-outline" size={16} color={Colors.subText} />
                            </TouchableOpacity>
                        </View>

                        {/* 카테고리 선택 (터치) */}
                        <View style={styles.infoRow}>
                            <Text style={styles.infoLabel}>카테고리 (대분류)</Text>
                            <TouchableOpacity
                                style={styles.categorySelect}
                                onPress={() => openCategoryModal('category', (data as any).category)}
                            >
                                <Text style={styles.categorySelectText}>
                                    {(data as any).category || '선택하세요'}
                                </Text>
                                <Ionicons name="chevron-down" size={16} color={Colors.subText} />
                            </TouchableOpacity>
                        </View>

                        {/* 소분류 선택 (터치) */}
                        <View style={styles.infoRow}>
                            <Text style={styles.infoLabel}>상세 분류 (소분류)</Text>
                            <TouchableOpacity
                                style={styles.categorySelect}
                                onPress={() => openCategoryModal('subCategory', (data as any).category || '기타')}
                            >
                                <Text style={styles.categorySelectText}>
                                    {(data as any).subCategory || '선택하세요'}
                                </Text>
                                <Ionicons name="chevron-down" size={16} color={Colors.subText} />
                            </TouchableOpacity>
                        </View>

                        <EditableRow
                            label="메모"
                            value={(data as any).memo || ''}
                            onChangeText={(text) => updateEditingItem('memo', text)}
                            placeholder="메모 입력"
                        />
                    </View>
                )}

                {data.type === 'STORE_PAYMENT' && (
                    <View style={styles.card}>
                        <View style={styles.headerRow}>
                            <Ionicons name="cart-outline" size={24} color={Colors.navy} />
                            <Text style={styles.cardTitle}>결제 내역 수정</Text>
                        </View>
                        <View style={styles.divider} />

                        <EditableRow
                            label="상호명"
                            value={(data as any).merchant || ''}
                            onChangeText={(text) => updateEditingItem('merchant', text)}
                        />
                        <EditableRow
                            label="금액"
                            value={String((data as any).amount || 0)}
                            keyboardType="numeric"
                            onChangeText={(text) => updateEditingItem('amount', parseInt(text.replace(/[^0-9]/g, '') || '0', 10))}
                            isCurrency
                        />
                        <View style={styles.infoRow}>
                            <Text style={styles.infoLabel}>날짜</Text>
                            <TouchableOpacity
                                style={styles.categorySelect}
                                onPress={() => openDatePicker(editingIndex)}
                            >
                                <Text style={styles.categorySelectText}>
                                    {(data as any).date || 'YYYY-MM-DD'}
                                </Text>
                                <Ionicons name="calendar-outline" size={16} color={Colors.subText} />
                            </TouchableOpacity>
                        </View>

                        {/* 카테고리 선택 (터치) */}
                        <View style={styles.infoRow}>
                            <Text style={styles.infoLabel}>카테고리 (대분류)</Text>
                            <TouchableOpacity
                                style={styles.categorySelect}
                                onPress={() => openCategoryModal('category', (data as any).category)}
                            >
                                <Text style={styles.categorySelectText}>
                                    {(data as any).category || '선택하세요'}
                                </Text>
                                <Ionicons name="chevron-down" size={16} color={Colors.subText} />
                            </TouchableOpacity>
                        </View>

                        {/* 소분류 선택 (터치) */}
                        <View style={styles.infoRow}>
                            <Text style={styles.infoLabel}>상세 분류 (소분류)</Text>
                            <TouchableOpacity
                                style={styles.categorySelect}
                                onPress={() => openCategoryModal('subCategory', (data as any).category || '기타')}
                            >
                                <Text style={styles.categorySelectText}>
                                    {(data as any).subCategory || '선택하세요'}
                                </Text>
                                <Ionicons name="chevron-down" size={16} color={Colors.subText} />
                            </TouchableOpacity>
                        </View>

                        <EditableRow
                            label="메모"
                            value={(data as any).memo || ''}
                            onChangeText={(text) => updateEditingItem('memo', text)}
                            placeholder="메모 입력"
                        />
                    </View>
                )}

                {data.type === 'GIFTICON' && (
                    <View style={styles.card}>
                        <View style={styles.headerRow}>
                            <Ionicons name="gift-outline" size={24} color={Colors.navy} />
                            <Text style={styles.cardTitle}>기프티콘 정보 수정</Text>
                        </View>
                        <View style={styles.divider} />

                        <EditableRow
                            label="상품명"
                            value={(data as any).productName || ''}
                            onChangeText={(text) => updateEditingItem('productName', text)}
                        />
                        <EditableRow
                            label="브랜드"
                            value={(data as any).brandName || ''}
                            onChangeText={(text) => updateEditingItem('brandName', text)}
                        />
                        <EditableRow
                            label="보낸 사람"
                            value={(data as any).senderName || ''}
                            onChangeText={(text) => updateEditingItem('senderName', text)}
                        />

                        {/* 날짜 선택 (직접 구현) */}
                        <View style={styles.row}>
                            <Text style={[styles.label, { marginTop: 12 }]}>유효기간</Text>
                            <TouchableOpacity
                                style={[styles.input, { justifyContent: 'center' }]}
                                onPress={() => openDatePicker(editingIndex!)}
                            >
                                <Text style={{ fontFamily: 'Pretendard-Bold', fontSize: 16, color: Colors.text }}>
                                    {(data as any).expiryDate || 'YYYY-MM-DD'}
                                </Text>
                            </TouchableOpacity>
                        </View>

                        <EditableRow
                            label="바코드 번호"
                            value={(data as any).barcodeNumber || ''}
                            onChangeText={(text) => updateEditingItem('barcodeNumber', text)}
                            keyboardType="numeric"
                        />
                        <EditableRow
                            label="예상 금액"
                            value={String((data as any).estimatedPrice || 0)}
                            keyboardType="numeric"
                            onChangeText={(text) => updateEditingItem('estimatedPrice', parseInt(text.replace(/[^0-9]/g, '') || '0', 10))}
                            isCurrency
                        />
                    </View>
                )}

                {/* 완료 버튼 */}
                <TouchableOpacity style={styles.editModeCompleteButton} onPress={closeEditMode}>
                    <Text style={styles.editModeCompleteText}>수정 완료</Text>
                </TouchableOpacity>
            </>
        );
    };

    const renderContent = () => {
        // ✅ 편집 모드면 편집 화면 표시
        if (editingIndex !== null) {
            return renderEditMode();
        }

        // 여러 건이면 리스트 렌더링
        if (dataList.length > 1) {
            return renderMultiTransactionList();
        }

        // ✅ data가 없으면 로딩 표시
        if (!data) {
            return <ActivityIndicator />;
        }

        // 단일 건이면 기존 상세 렌더링
        switch (data.type) {
            case 'INVITATION':
                const invite = data as InvitationResult;
                return (
                    <>
                        <View style={styles.card}>
                            <View style={styles.headerRow}>
                                <Ionicons name="mail-open-outline" size={24} color={Colors.navy} />
                                <Text style={styles.cardTitle}>초대장 분석 결과</Text>
                            </View>
                            <View style={styles.divider} />

                            <InfoRow label="행사 종류" value={invite.eventType || '알 수 없음'} />
                            <InfoRow label="일시" value={formatDisplayDateTime(invite.eventDate) || '날짜 없음'} />
                            <InfoRow label="장소" value={invite.eventLocation || '장소 정보 없음'} />
                            <InfoRow label="주인공" value={invite.mainName || '-'} />
                            <InfoRow label="초대자" value={invite.senderName || '-'} />

                            {invite.accountNumber ? (
                                <View style={styles.accountBox}>
                                    <Text style={styles.accountLabel}>계좌번호 감지됨</Text>
                                    <Text style={styles.accountValue}>{invite.accountNumber}</Text>
                                </View>
                            ) : null}
                        </View>

                        {/* ✅ 관계 선택 카드 */}
                        <View style={styles.card}>
                            <View style={styles.headerRow}>
                                <Ionicons name="people-outline" size={24} color={Colors.navy} />
                                <Text style={styles.cardTitle}>나와의 관계</Text>
                            </View>
                            <View style={styles.chipContainer}>
                                {RELATIONS.map((rel) => (
                                    <TouchableOpacity
                                        key={rel}
                                        style={[
                                            styles.chip,
                                            selectedRelation === rel && styles.activeChip
                                        ]}
                                        onPress={() => handleRelationChange(rel)}
                                    >
                                        <Text style={[
                                            styles.chipText,
                                            selectedRelation === rel && styles.activeChipText
                                        ]}>{rel}</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        </View>

                        {/* ✅ 참석 여부 토글 카드 */}
                        <View style={styles.card}>
                            <View style={styles.headerRow}>
                                <Ionicons name="calendar-outline" size={24} color={Colors.navy} />
                                <Text style={styles.cardTitle}>참석 여부</Text>
                            </View>
                            <View style={styles.attendanceRow}>
                                <Text style={styles.attendanceLabel}>
                                    {isAttending ? '🎉 참석 예정' : '💌 불참 (봉투만 전달)'}
                                </Text>
                                <Switch
                                    value={isAttending}
                                    onValueChange={handleAttendanceChange}
                                    trackColor={{ false: Colors.border, true: Colors.orange }}
                                    thumbColor={Colors.white}
                                />
                            </View>
                        </View>

                        {/* AI Insight Card - 새 추천 엔진 적용 */}
                        <View style={[styles.card, styles.recommendationCard]}>
                            <View style={styles.headerRow}>
                                <Ionicons name="sparkles" size={20} color={Colors.white} />
                                <Text style={[styles.cardTitle, { color: Colors.white }]}>AI 스마트 추천</Text>
                            </View>
                            <Text style={styles.recommendationAmount}>
                                {(recommendation?.recommendedAmount || 100000).toLocaleString()}원
                            </Text>
                            {recommendation?.venueMealCost && (
                                <Text style={styles.venueInfo}>
                                    📍 {recommendation.venueName || '장소'} 식대: 약 {(recommendation.venueMealCost / 10000).toFixed(0)}만원
                                </Text>
                            )}
                            <Text style={styles.recommendationReason}>
                                {recommendation?.reason || (selectedRelation
                                    ? `${selectedRelation} 관계 기준 추천 금액입니다.`
                                    : invite.recommendationReason || "관계를 선택해주세요.")}
                            </Text>
                            {recommendation && (
                                <Text style={styles.rangeInfo}>
                                    적정 범위: {(recommendation.minAmount / 10000).toFixed(0)}만원 ~ {(recommendation.maxAmount / 10000).toFixed(0)}만원
                                </Text>
                            )}
                        </View>

                        {/* ✅ 축의금 추천 테이블 */}
                        <View style={styles.tableCard}>
                            <View style={styles.headerRow}>
                                <Ionicons name="list-outline" size={20} color={Colors.navy} />
                                <Text style={styles.cardTitle}>결혼식 추천 금액 테이블</Text>
                            </View>
                            <RecommendationTable
                                eventType={invite.eventType || 'wedding'}
                                selectedRelation={selectedRelation}
                                recommendation={recommendation}
                                venueName={recommendation?.venueName || undefined}
                                isVenueInDB={recommendation?.venueType === 'hotel' || recommendation?.venueType === 'convention'}
                            />
                        </View>

                        {/* ✅ 간편 송금 섹션 */}
                        <Text style={styles.sectionTitle}>💳 간편 송금</Text>
                        <View style={styles.payRow}>
                            {PAY_APPS.map((app) => (
                                <TouchableOpacity
                                    key={app.key}
                                    style={[styles.payButton, { backgroundColor: app.color }]}
                                    onPress={() => handlePayment(app)}
                                >
                                    <Text style={[styles.payButtonText, { color: app.textColor || '#FFFFFF' }]}>
                                        {app.icon} {app.label}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                        <Text style={styles.helperText}>* 추천된 금액({(recommendation?.recommendedAmount || 0).toLocaleString()}원)이 송금 앱에 자동 입력됩니다.</Text>
                    </>
                );

            case 'GIFTICON':
                const gifticon = data as GifticonResult;
                return (
                    <View style={styles.card}>
                        <View style={styles.headerRow}>
                            <Ionicons name="gift-outline" size={24} color={Colors.navy} />
                            <Text style={styles.cardTitle}>기프티콘 정보 (수정 가능)</Text>
                        </View>
                        <View style={styles.divider} />

                        <EditableRow
                            label="상품명"
                            value={gifticon.productName || ''}
                            onChangeText={(text) => handleUpdateData('productName', text)}
                        />
                        <EditableRow
                            label="브랜드"
                            value={gifticon.brandName || ''}
                            onChangeText={(text) => handleUpdateData('brandName', text)}
                        />
                        <EditableRow
                            label="보낸 사람"
                            value={gifticon.senderName || ''}
                            onChangeText={(text) => handleUpdateData('senderName', text)}
                        />

                        {/* 날짜 선택 (직접 구현) */}
                        <View style={styles.row}>
                            <Text style={[styles.label, { marginTop: 12 }]}>유효기간</Text>
                            <TouchableOpacity
                                style={[styles.input, { justifyContent: 'center' }]}
                                onPress={() => openDatePicker(editingIndex !== null ? editingIndex : 0)}
                            >
                                <Text style={{ fontFamily: 'Pretendard-Bold', fontSize: 16, color: Colors.text }}>
                                    {gifticon.expiryDate || 'YYYY-MM-DD'}
                                </Text>
                            </TouchableOpacity>
                        </View>

                        <EditableRow
                            label="바코드 번호"
                            value={gifticon.barcodeNumber || ''}
                            onChangeText={(text) => handleUpdateData('barcodeNumber', text)}
                            keyboardType="numeric"
                        />
                        <EditableRow
                            label="예상 금액"
                            value={String(gifticon.estimatedPrice || 0)}
                            keyboardType="numeric"
                            onChangeText={(text) => handleUpdateData('estimatedPrice', parseInt(text.replace(/[^0-9]/g, '') || '0', 10))}
                            isCurrency
                        />
                    </View>
                );

            case 'RECEIPT':
                const receipt = data as ReceiptResult;
                return (
                    <View style={styles.card}>
                        <View style={styles.headerRow}>
                            <Ionicons name="receipt-outline" size={24} color={Colors.navy} />
                            <Text style={styles.cardTitle}>영수증/카드내역 (수정 가능)</Text>
                        </View>
                        <View style={styles.divider} />

                        <EditableRow
                            label="상호명"
                            value={receipt.merchant || ''}
                            onChangeText={(text) => handleUpdateData('merchant', text)}
                        />
                        <EditableRow
                            label="금액"
                            value={String(receipt.amount || 0)}
                            keyboardType="numeric"
                            onChangeText={(text) => handleUpdateData('amount', parseInt(text.replace(/[^0-9]/g, '') || '0', 10))}
                            isCurrency
                        />
                        <View style={styles.infoRow}>
                            <Text style={styles.infoLabel}>일시</Text>
                            <TouchableOpacity
                                style={styles.categorySelect}
                                onPress={() => openDatePicker(0)}
                            >
                                <Text style={styles.categorySelectText}>
                                    {formatDisplayDateTime(receipt.date || '') || 'YYYY-MM-DD HH:mm'}
                                </Text>
                                <Ionicons name="calendar-outline" size={16} color={Colors.subText} />
                            </TouchableOpacity>
                        </View>

                        <View style={styles.infoRow}>
                            <Text style={styles.infoLabel}>카테고리</Text>
                            <TouchableOpacity
                                style={styles.categorySelect}
                                onPress={() => openCategoryModal('category', receipt.category)}
                            >
                                <Text style={styles.categorySelectText}>
                                    {receipt.category || '선택하세요'}
                                </Text>
                                <Ionicons name="chevron-down" size={16} color={Colors.subText} />
                            </TouchableOpacity>
                        </View>

                        <View style={[styles.accountBox, { backgroundColor: '#FFF7ED', marginTop: 16 }]}>
                            <Text style={[styles.accountLabel, { color: Colors.orange }]}>AI 자동 분류</Text>
                            <Text style={[styles.accountValue, { color: Colors.navy }]}>{receipt.category}</Text>
                        </View>
                    </View>
                );

            case 'TRANSFER':
                const transfer = data as TransferResult;
                return (
                    <View style={styles.card}>
                        <View style={styles.headerRow}>
                            <Ionicons name="swap-horizontal-outline" size={24} color={Colors.navy} />
                            <Text style={styles.cardTitle}>송금 내역 (수정 가능)</Text>
                        </View>
                        <View style={styles.divider} />

                        <View style={styles.attendanceRow}>
                            <Text style={styles.attendanceLabel}>
                                {transfer.isReceived ? '🔵 입금 (받음)' : '🔴 출금 (보냄)'}
                            </Text>
                            <Switch
                                value={transfer.isReceived}
                                onValueChange={handleTransferTypeChange}
                                trackColor={{ false: '#FF6B6B', true: '#4D79FF' }}
                                thumbColor={Colors.white}
                            />
                        </View>

                        <View style={styles.divider} />

                        <EditableRow
                            label="금액"
                            value={String(transfer.amount || 0)}
                            keyboardType="numeric"
                            onChangeText={(text) => handleUpdateData('amount', parseInt(text.replace(/[^0-9]/g, '') || '0', 10))}
                            isCurrency
                        />
                        <EditableRow
                            label={transfer.isReceived ? '보낸 사람' : '받는 사람'}
                            value={transfer.senderName || ''}
                            onChangeText={(text) => handleUpdateData('senderName', text)}
                        />
                        <EditableRow
                            label="메모"
                            value={transfer.memo || ''}
                            onChangeText={(text) => handleUpdateData('memo', text)}
                            placeholder="내용을 입력해주세요"
                        />

                        <View style={[styles.accountBox, { backgroundColor: transfer.isReceived ? '#E3F2FD' : '#FFEBEE', marginTop: 16 }]}>
                            <Text style={[styles.accountLabel, { color: transfer.isReceived ? '#1565C0' : '#C62828' }]}>
                                {transfer.isReceived ? '나의 자산 증가 📈' : '지출 발생 💸'}
                            </Text>
                            <Text style={[styles.accountValue, { color: transfer.isReceived ? '#1565C0' : '#C62828' }]}>
                                {transfer.isReceived ? '+' : '-'}{(transfer.amount || 0).toLocaleString()}원
                            </Text>
                        </View>
                    </View>
                );


            case 'STORE_PAYMENT':
                const store = data as StorePaymentResult;
                return (
                    <View style={styles.card}>
                        <View style={styles.headerRow}>
                            <Ionicons name="cart-outline" size={24} color={Colors.navy} />
                            <Text style={styles.cardTitle}>상점 결제 (가계부)</Text>
                        </View>
                        <View style={styles.divider} />

                        <EditableRow
                            label="상호명"
                            value={store.merchant || ''}
                            onChangeText={(text) => handleUpdateData('merchant', text)}
                        />
                        <EditableRow
                            label="금액"
                            value={String(store.amount || 0)}
                            keyboardType="numeric"
                            onChangeText={(text) => handleUpdateData('amount', parseInt(text.replace(/[^0-9]/g, '') || '0', 10))}
                            isCurrency
                        />
                        <View style={styles.infoRow}>
                            <Text style={styles.infoLabel}>일시</Text>
                            <TouchableOpacity
                                style={styles.categorySelect}
                                onPress={() => openDatePicker(0)}
                            >
                                <Text style={styles.categorySelectText}>
                                    {formatDisplayDateTime(store.date || '') || 'YYYY-MM-DD HH:mm'}
                                </Text>
                                <Ionicons name="calendar-outline" size={16} color={Colors.subText} />
                            </TouchableOpacity>
                        </View>

                        <View style={styles.infoRow}>
                            <Text style={styles.infoLabel}>카테고리</Text>
                            <TouchableOpacity
                                style={styles.categorySelect}
                                onPress={() => openCategoryModal('category', store.category)}
                            >
                                <Text style={styles.categorySelectText}>
                                    {store.category || '선택하세요'}
                                </Text>
                                <Ionicons name="chevron-down" size={16} color={Colors.subText} />
                            </TouchableOpacity>
                        </View>

                        <View style={styles.infoRow}>
                            <Text style={styles.infoLabel}>상세 분류 (선택)</Text>
                            <TouchableOpacity
                                style={styles.categorySelect}
                                onPress={() => openCategoryModal('subCategory', store.category || '기타')}
                            >
                                <Text style={styles.categorySelectText}>
                                    {store.subCategory || '선택하세요'}
                                </Text>
                                <Ionicons name="chevron-down" size={16} color={Colors.subText} />
                            </TouchableOpacity>
                        </View>
                        <EditableRow
                            label="메모"
                            value={store.memo || ''}
                            onChangeText={(text) => handleUpdateData('memo', text)}
                            placeholder="내용을 입력해주세요"
                        />

                        <View style={[styles.accountBox, { backgroundColor: '#FFF7ED', marginTop: 16 }]}>
                            <Text style={[styles.accountLabel, { color: Colors.orange }]}>AI 자동 분류</Text>
                            <Text style={[styles.accountValue, { color: Colors.navy }]}>{store.category}</Text>
                        </View>
                    </View>
                );

            case 'BANK_TRANSFER':
                const bank = data as BankTransactionResult;
                const isDeposit = bank.transactionType === 'deposit';
                return (
                    <View style={styles.card}>
                        <View style={styles.headerRow}>
                            <Ionicons name="card-outline" size={24} color={Colors.navy} />
                            <Text style={styles.cardTitle}>은행 거래 (자산)</Text>
                        </View>
                        <View style={styles.divider} />

                        <View style={styles.attendanceRow}>
                            <Text style={styles.attendanceLabel}>
                                {isDeposit ? '🔵 입금 (받음)' : '🔴 출금 (보냄)'}
                            </Text>
                            <Switch
                                value={isDeposit}
                                onValueChange={handleBankTransactionTypeChange}
                                trackColor={{ false: '#FF6B6B', true: '#4D79FF' }}
                                thumbColor={Colors.white}
                            />
                        </View>

                        {bank.isUtility && (
                            <View style={[styles.accountBox, { backgroundColor: '#F3E5F5', marginTop: 8, marginBottom: 8 }]}>
                                <Text style={[styles.accountLabel, { color: '#7B1FA2' }]}>💡 공과금/고정지출 감지됨</Text>
                            </View>
                        )}

                        <View style={styles.divider} />

                        <EditableRow
                            label="금액"
                            value={String(bank.amount || 0)}
                            keyboardType="numeric"
                            onChangeText={(text) => handleUpdateData('amount', parseInt(text.replace(/[^0-9]/g, '') || '0', 10))}
                            isCurrency
                        />
                        <EditableRow
                            label={isDeposit ? '보낸 사람' : '받는 사람'}
                            value={bank.targetName || ''}
                            onChangeText={(text) => handleUpdateData('targetName', text)}
                        />
                        <EditableRow
                            label="일시"
                            value={formatDisplayDateTime(bank.date || '')}
                            onChangeText={(text) => handleUpdateData('date', normalizeDateInput(text))}
                            placeholder="YYYY-MM-DD HH:mm"
                        />
                        <EditableRow
                            label="잔액 (선택)"
                            value={String(bank.balanceAfter || '')}
                            keyboardType="numeric"
                            onChangeText={(text) => handleUpdateData('balanceAfter', parseInt(text.replace(/[^0-9]/g, '') || '0', 10))}
                            isCurrency
                        />

                        {/* 카테고리 선택 (터치) */}
                        <View style={styles.infoRow}>
                            <Text style={styles.infoLabel}>카테고리 (대분류)</Text>
                            <TouchableOpacity
                                style={styles.categorySelect}
                                onPress={() => openCategoryModal('category', bank.category)}
                            >
                                <Text style={styles.categorySelectText}>
                                    {bank.category || (bank.isUtility ? '비소비지출/금융' : '인맥')}
                                </Text>
                                <Ionicons name="chevron-down" size={16} color={Colors.subText} />
                            </TouchableOpacity>
                        </View>

                        {/* 소분류 선택 (터치) */}
                        <View style={styles.infoRow}>
                            <Text style={styles.infoLabel}>상세 분류 (소분류)</Text>
                            <TouchableOpacity
                                style={styles.categorySelect}
                                onPress={() => openCategoryModal('subCategory', bank.category || (bank.isUtility ? '비소비지출/금융' : '인맥'))}
                            >
                                <Text style={styles.categorySelectText}>
                                    {bank.subCategory || '선택하세요'}
                                </Text>
                                <Ionicons name="chevron-down" size={16} color={Colors.subText} />
                            </TouchableOpacity>
                        </View>
                        <EditableRow
                            label="메모"
                            value={bank.memo || ''}
                            onChangeText={(text) => handleUpdateData('memo', text)}
                            placeholder="내용을 입력해주세요"
                        />

                        <View style={[styles.accountBox, { backgroundColor: isDeposit ? '#E3F2FD' : '#FFEBEE', marginTop: 16 }]}>
                            <Text style={[styles.accountLabel, { color: isDeposit ? '#1565C0' : '#C62828' }]}>
                                {isDeposit ? '나의 자산 증가 📈' : '지출 발생 💸'}
                            </Text>
                            <Text style={[styles.accountValue, { color: isDeposit ? '#1565C0' : '#C62828' }]}>
                                {isDeposit ? '+' : '-'}{(bank.amount || 0).toLocaleString()}원
                            </Text>
                        </View>
                    </View>
                );

            case 'BILL':
                const bill = data as BillResult;
                return (
                    <View style={styles.card}>
                        <View style={styles.headerRow}>
                            <Ionicons name="document-text-outline" size={24} color={Colors.navy} />
                            <Text style={styles.cardTitle}>청구서/고지서 분석</Text>
                        </View>
                        <View style={styles.divider} />

                        <EditableRow
                            label="항목명"
                            value={bill.title || ''}
                            onChangeText={(text) => handleUpdateData('title', text)}
                        />
                        <EditableRow
                            label="납부 금액"
                            value={String(bill.amount || 0)}
                            keyboardType="numeric"
                            onChangeText={(text) => handleUpdateData('amount', parseInt(text.replace(/[^0-9]/g, '') || '0', 10))}
                            isCurrency
                        />
                        <View style={styles.infoRow}>
                            <Text style={styles.infoLabel}>납부 기한</Text>
                            <TouchableOpacity
                                style={styles.categorySelect}
                                onPress={() => openDatePicker(0)}
                            >
                                <Text style={styles.categorySelectText}>
                                    {formatDisplayDateTime(bill.dueDate || '') || 'YYYY-MM-DD'}
                                </Text>
                                <Ionicons name="calendar-outline" size={16} color={Colors.subText} />
                            </TouchableOpacity>
                        </View>
                        <EditableRow
                            label="가상계좌"
                            value={bill.virtualAccount || ''}
                            onChangeText={(text) => handleUpdateData('virtualAccount', text)}
                            placeholder="은행 계좌번호"
                        />
                    </View>
                );

            case 'SOCIAL':
                const social = data as SocialResult;
                return (
                    <View style={styles.card}>
                        <View style={styles.headerRow}>
                            <Ionicons name="people-circle-outline" size={24} color={Colors.navy} />
                            <Text style={styles.cardTitle}>인맥 지출 / 더치페이</Text>
                        </View>
                        <View style={styles.divider} />

                        <EditableRow
                            label="모임 장소"
                            value={social.location || ''}
                            onChangeText={(text) => handleUpdateData('location', text)}
                        />
                        <EditableRow
                            label="총 금액"
                            value={String(social.amount || 0)}
                            keyboardType="numeric"
                            onChangeText={(text) => handleUpdateData('amount', parseInt(text.replace(/[^0-9]/g, '') || '0', 10))}
                            isCurrency
                        />
                        <EditableRow
                            label="멤버 (쉼표로 구분)"
                            value={social.members ? social.members.join(', ') : ''}
                            onChangeText={(text) => handleUpdateData('members', text.split(',').map(m => m.trim()))}
                            placeholder="김철수, 이영희"
                        />
                        <View style={[styles.accountBox, { backgroundColor: '#E0F2F1', marginTop: 16 }]}>
                            <Text style={[styles.accountLabel, { color: '#00695C' }]}>💡 1인당 예상 금액</Text>
                            <Text style={[styles.accountValue, { color: '#004D40' }]}>
                                {social.members && social.members.length > 0
                                    ? Math.floor(social.amount / (social.members.length + 1)).toLocaleString()
                                    : social.amount.toLocaleString()}원 (나 포함 {social.members ? social.members.length + 1 : 1}명)
                            </Text>
                        </View>
                    </View>
                );

            case 'APPOINTMENT':
                const appointment = data as any; // AppointmentResult
                return (
                    <View style={styles.card}>
                        <View style={styles.headerRow}>
                            <Ionicons name="calendar-outline" size={24} color={Colors.navy} />
                            <Text style={styles.cardTitle}>일정 / 예약</Text>
                        </View>
                        <View style={styles.divider} />

                        <EditableRow
                            label="제목"
                            value={appointment.title || ''}
                            onChangeText={(text) => handleUpdateData('title', text)}
                        />
                        <EditableRow
                            label="장소"
                            value={appointment.location || ''}
                            onChangeText={(text) => handleUpdateData('location', text)}
                        />
                        <View style={styles.infoRow}>
                            <Text style={styles.infoLabel}>날짜</Text>
                            <TouchableOpacity
                                style={styles.categorySelect}
                                onPress={() => {
                                    // Set data for single-item view
                                    setDatePickerTargetIndex(0);
                                    const existingDate = appointment.date;
                                    if (existingDate && isValidDate(existingDate)) {
                                        const [datePart] = existingDate.split(' ');
                                        const parts = datePart.split('-');
                                        if (parts.length === 3) {
                                            setPickerYear(parseInt(parts[0], 10));
                                            setPickerMonth(parseInt(parts[1], 10));
                                            setPickerDay(parseInt(parts[2], 10));
                                        }
                                    } else {
                                        const today = new Date();
                                        setPickerYear(today.getFullYear());
                                        setPickerMonth(today.getMonth() + 1);
                                        setPickerDay(today.getDate());
                                    }
                                    setDatePickerVisible(true);
                                }}
                            >
                                <Text style={styles.categorySelectText}>
                                    {formatDisplayDateTime(appointment.date || '') || 'YYYY-MM-DD'}
                                </Text>
                                <Ionicons name="calendar-outline" size={16} color={Colors.subText} />
                            </TouchableOpacity>
                        </View>
                        <EditableRow
                            label="메모"
                            value={appointment.memo || ''}
                            onChangeText={(text) => handleUpdateData('memo', text)}
                            placeholder="메모 입력"
                        />
                    </View>
                );

            default:
                return <Text>알 수 없는 데이터입니다.</Text>;
        }
    };

    return (
        <>
            <ScrollView style={styles.container} contentContainerStyle={styles.content}>
                <Text style={styles.screenTitle}>스마트 분석 리포트</Text>

                {renderContent()}

                {/* ✅ 민심 물어보기 버튼 추가 */}
                {data.type === 'INVITATION' && (
                    <TouchableOpacity style={styles.pollButton} onPress={openPollModal}>
                        <Ionicons name="people" size={20} color={Colors.white} style={{ marginRight: 8 }} />
                        <Text style={styles.pollButtonText}>익명으로 의견 물어보기</Text>
                    </TouchableOpacity>
                )}

                {/* ✅ AI 면책 문구 */}
                <View style={styles.disclaimerContainer}>
                    <Ionicons name="information-circle-outline" size={14} color={Colors.subText} />
                    <Text style={styles.disclaimerText}>
                        AI 분석은 100% 정확하지 않을 수 있습니다. 저장 전 내용을 확인해주세요.
                    </Text>
                </View>

                <TouchableOpacity
                    style={[styles.saveButton, saving && { opacity: 0.7 }]}
                    onPress={handleSave}
                    disabled={saving}
                >
                    {saving ? (
                        <ActivityIndicator color="white" />
                    ) : (
                        <Text style={styles.saveButtonText}>확인 및 저장</Text>
                    )}
                </TouchableOpacity>

                <TouchableOpacity
                    style={styles.cancelButton}
                    onPress={() => {
                        Alert.alert('저장 취소', '저장하지 않고 홈으로 돌아가시겠습니까?', [
                            { text: '아니오', style: 'cancel' },
                            { text: '네 (삭제)', style: 'destructive', onPress: () => router.back() }
                        ]);
                    }}
                    disabled={saving}
                >
                    <Text style={styles.cancelButtonText}>저장 안 함 (삭제)</Text>
                </TouchableOpacity>
                <Text style={styles.helperText}>* 캘린더 일정과 인맥 장부가 한 번에 업데이트됩니다.</Text>
            </ScrollView>

            {/* ✅ 민심 물어보기 사연 입력 Modal - ScrollView 바깥에 배치 */}
            <Modal
                visible={pollModalVisible}
                animationType="slide"
                transparent={true}
                onRequestClose={() => setPollModalVisible(false)}
            >
                <KeyboardAvoidingView
                    behavior={RNPlatform.OS === 'ios' ? 'padding' : 'height'}
                    style={styles.modalOverlay}
                >
                    <View style={styles.modalContainer}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>💬 의견 물어보기</Text>
                            <TouchableOpacity onPress={() => setPollModalVisible(false)}>
                                <Ionicons name="close" size={24} color={Colors.text} />
                            </TouchableOpacity>
                        </View>

                        <Text style={styles.modalSubtitle}>
                            개인정보 없이 상황만 설명해주세요.{'\n'}
                            커뮤니티에 익명으로 게시됩니다.
                        </Text>

                        <TextInput
                            style={styles.storyInput}
                            multiline
                            placeholder="예: 대학 동기 결혼식인데 식대가 15만원이래요. 10만원 내면 예의 없는 건가요?"
                            placeholderTextColor={Colors.subText}
                            value={pollStory}
                            onChangeText={setPollStory}
                            maxLength={500}
                        />

                        <Text style={styles.charCount}>{pollStory.length}/500</Text>

                        <TouchableOpacity
                            style={[styles.submitButton, creatingPoll && { opacity: 0.7 }]}
                            onPress={handleCreatePoll}
                            disabled={creatingPoll || !pollStory.trim()}
                        >
                            {creatingPoll ? (
                                <ActivityIndicator color="white" />
                            ) : (
                                <Text style={styles.submitButtonText}>🗳️ 의견 물어보기</Text>
                            )}
                        </TouchableOpacity>
                    </View>
                </KeyboardAvoidingView>
            </Modal>

            {/* ✅ 카테고리 선택 모달 */}
            <Modal
                visible={categoryModalVisible}
                animationType="slide"
                transparent={true}
                onRequestClose={() => setCategoryModalVisible(false)}
            >
                <TouchableOpacity
                    style={styles.categoryModalOverlay}
                    activeOpacity={1}
                    onPress={() => setCategoryModalVisible(false)}
                >
                    <View style={styles.categoryModalContent} onStartShouldSetResponder={() => true}>
                        <Text style={styles.categoryModalTitle}>
                            {categoryModalType === 'category' ? '카테고리 선택' : '상세 분류 선택'}
                        </Text>
                        <ScrollView>
                            <View style={styles.categoryChipContainer}>
                                {(categoryModalType === 'category'
                                    ? CATEGORY_LIST
                                    : (CATEGORIES[selectedCategory || (data as any)?.category || '인맥'] || ['경조사', '선물', '모임'])
                                ).map((item) => {
                                    const currentValue = categoryModalType === 'category'
                                        ? (data as any)?.category
                                        : (data as any)?.subCategory;
                                    const isSelected = item === currentValue;

                                    return (
                                        <TouchableOpacity
                                            key={item}
                                            style={[styles.categoryChip, isSelected && styles.categoryChipSelected]}
                                            onPress={() => handleCategorySelect(item)}
                                        >
                                            <Text style={[styles.categoryChipText, isSelected && styles.categoryChipTextSelected]}>
                                                {item}
                                            </Text>
                                        </TouchableOpacity>
                                    );
                                })}
                            </View>
                        </ScrollView>
                    </View>
                </TouchableOpacity>
            </Modal>

            {/* ✅ 날짜 피커 모달 */}
            <Modal
                visible={datePickerVisible}
                animationType="slide"
                transparent={true}
                onRequestClose={() => setDatePickerVisible(false)}
            >
                <TouchableOpacity
                    style={styles.datePickerOverlay}
                    activeOpacity={1}
                    onPress={() => setDatePickerVisible(false)}
                >
                    <View style={styles.datePickerContainer} onStartShouldSetResponder={() => true}>
                        <Text style={styles.datePickerTitle}>📅 날짜 선택</Text>
                        <Text style={styles.datePickerHint}>하단의 날짜를 터치해서 선택하세요</Text>

                        <View style={styles.datePickerRow}>
                            {/* 년도 선택 */}
                            <View style={styles.datePickerColumn}>
                                <Text style={styles.datePickerLabel}>년</Text>
                                <ScrollView style={styles.datePickerScroll} showsVerticalScrollIndicator={false}>
                                    {[2024, 2025, 2026, 2027].map(year => (
                                        <TouchableOpacity
                                            key={year}
                                            style={[styles.datePickerItem, pickerYear === year && styles.datePickerItemSelected]}
                                            onPress={() => setPickerYear(year)}
                                        >
                                            <Text style={[styles.datePickerItemText, pickerYear === year && styles.datePickerItemTextSelected]}>
                                                {year}
                                            </Text>
                                        </TouchableOpacity>
                                    ))}
                                </ScrollView>
                            </View>

                            {/* 월 선택 */}
                            <View style={styles.datePickerColumn}>
                                <Text style={styles.datePickerLabel}>월</Text>
                                <ScrollView style={styles.datePickerScroll} showsVerticalScrollIndicator={false}>
                                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(month => (
                                        <TouchableOpacity
                                            key={month}
                                            style={[styles.datePickerItem, pickerMonth === month && styles.datePickerItemSelected]}
                                            onPress={() => setPickerMonth(month)}
                                        >
                                            <Text style={[styles.datePickerItemText, pickerMonth === month && styles.datePickerItemTextSelected]}>
                                                {month}
                                            </Text>
                                        </TouchableOpacity>
                                    ))}
                                </ScrollView>
                            </View>

                            {/* 일 선택 */}
                            <View style={styles.datePickerColumn}>
                                <Text style={styles.datePickerLabel}>일</Text>
                                <ScrollView style={styles.datePickerScroll} showsVerticalScrollIndicator={false}>
                                    {Array.from({ length: 31 }, (_, i) => i + 1).map(day => (
                                        <TouchableOpacity
                                            key={day}
                                            style={[styles.datePickerItem, pickerDay === day && styles.datePickerItemSelected]}
                                            onPress={() => setPickerDay(day)}
                                        >
                                            <Text style={[styles.datePickerItemText, pickerDay === day && styles.datePickerItemTextSelected]}>
                                                {day}
                                            </Text>
                                        </TouchableOpacity>
                                    ))}
                                </ScrollView>
                            </View>
                        </View>

                        {/* 선택된 날짜 미리보기 */}
                        <View style={styles.datePickerPreview}>
                            <Text style={styles.datePickerPreviewText}>
                                {pickerYear}년 {pickerMonth}월 {pickerDay}일
                            </Text>
                        </View>

                        <View style={styles.datePickerButtons}>
                            <TouchableOpacity
                                style={styles.datePickerCancelButton}
                                onPress={() => setDatePickerVisible(false)}
                            >
                                <Text style={styles.datePickerCancelText}>취소</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={styles.datePickerConfirmButton}
                                onPress={handleDatePickerConfirm}
                            >
                                <Text style={styles.datePickerConfirmText}>확인</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </TouchableOpacity>
            </Modal>

            {/* ✅ OCR 피드백 모달 */}
            <FeedbackModal
                visible={ocrFeedbackVisible}
                onClose={() => setOcrFeedbackVisible(false)}
                ocrContext={{
                    rawText: dataList.map(d => JSON.stringify(d)).join('\n---\n'),
                    classifiedType: dataList.map(d => d.type).join(', '),
                    classifiedData: dataList
                }}
            />

            {/* ✅ 저장 성공 모달 */}
            <SuccessModal
                visible={successModalVisible}
                message={successMessage}
                autoCloseDelay={1000}
                onComplete={() => {
                    setSuccessModalVisible(false);
                    router.replace('/calendar');
                }}
            />
        </>
    );
}

const InfoRow = ({ label, value }: { label: string, value: string }) => (
    <View style={styles.row}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.value}>{value}</Text>
    </View>
);

const EditableRow = ({ label, value, onChangeText, keyboardType = 'default', isCurrency = false, placeholder = '' }: {
    label: string,
    value: string,
    onChangeText: (text: string) => void,
    keyboardType?: 'default' | 'numeric',
    isCurrency?: boolean,
    placeholder?: string
}) => (
    <View style={styles.row}>
        <Text style={[styles.label, { marginTop: 12 }]}>{label}</Text>
        <TextInput
            style={[styles.input, isCurrency && styles.currencyInput]}
            value={isCurrency ? (value ? `${parseInt(value || '0').toLocaleString()}` : '') : value}
            onChangeText={onChangeText}
            keyboardType={keyboardType}
            placeholder={placeholder}
            placeholderTextColor="#999"
        />
        {isCurrency && <Text style={styles.currencySuffix}>원</Text>}
    </View>
);

const calculateDDay = (dateStr?: string) => {
    if (!dateStr) return '-';
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const target = new Date(dateStr);
    target.setHours(0, 0, 0, 0);
    const diffTime = target.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 0) return `D+${Math.abs(diffDays)}`;
    if (diffDays === 0) return 'D-Day';
    return `D-${diffDays}`;
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.background,
    },
    content: {
        padding: 20,
        paddingBottom: 40,
    },
    screenTitle: {
        fontFamily: 'Pretendard-Bold',
        fontSize: 24,
        color: Colors.text,
        marginBottom: 24,
    },
    sectionTitle: {
        fontFamily: 'Pretendard-Bold',
        fontSize: 18,
        color: Colors.text,
        marginTop: 24,
        marginBottom: 12,
    },
    payRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
        marginBottom: 8,
    },
    payButton: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderRadius: 12,
        marginBottom: 8,
    },
    payButtonText: {
        fontFamily: 'Pretendard-Bold',
        fontSize: 14,
        marginLeft: 4,
    },
    card: {
        backgroundColor: Colors.white,
        borderRadius: 20,
        padding: 20,
        marginBottom: 16,
        shadowColor: Colors.shadow,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 10,
        elevation: 4,
    },
    recommendationCard: {
        backgroundColor: Colors.navy,
    },
    headerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 16,
    },
    cardTitle: {
        fontFamily: 'Pretendard-Bold',
        fontSize: 18,
        color: Colors.text,
    },
    divider: {
        height: 1,
        backgroundColor: Colors.border,
        marginBottom: 16,
    },
    row: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 12,
    },
    label: {
        fontFamily: 'Pretendard-Medium',
        color: Colors.subText,
        fontSize: 14,
    },
    value: {
        fontFamily: 'Pretendard-Bold',
        color: Colors.text,
        fontSize: 14,
    },
    accountBox: {
        backgroundColor: '#F3F4F6',
        borderRadius: 12,
        padding: 12,
        marginTop: 8,
    },
    accountLabel: {
        fontSize: 12,
        color: Colors.subText,
        marginBottom: 4,
    },
    accountValue: {
        fontFamily: 'Pretendard-Bold',
        color: Colors.navy,
        fontSize: 16,
    },
    recommendationAmount: {
        fontFamily: 'Pretendard-Bold',
        fontSize: 32,
        color: Colors.orange,
        textAlign: 'center',
        marginBottom: 8,
    },
    recommendationReason: {
        fontFamily: 'Pretendard-Medium',
        fontSize: 14,
        color: 'rgba(255,255,255,0.8)',
        textAlign: 'center',
    },
    placeholderText: {
        textAlign: 'center',
        color: Colors.subText,
        marginVertical: 20,
    },
    saveButton: {
        backgroundColor: Colors.orange,
        borderRadius: 16,
        height: 56,
        justifyContent: 'center',
        alignItems: 'center',
        marginTop: 10,
        shadowColor: Colors.orange,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 10,
        elevation: 6,
    },
    saveButtonText: {
        fontFamily: 'Pretendard-Bold',
        color: Colors.white,
        fontSize: 18,
    },
    cancelButton: {
        height: 56,
        justifyContent: 'center',
        alignItems: 'center',
        marginTop: 12,
    },
    cancelButtonText: {
        fontFamily: 'Pretendard-Medium',
        color: Colors.subText,
        fontSize: 16,
        textDecorationLine: 'underline',
    },
    helperText: {
        textAlign: 'center',
        color: Colors.subText,
        fontSize: 12,
        marginTop: 12,
    },
    // ✅ 관계 선택 칩 스타일
    chipContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 10,
    },
    chip: {
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 20,
        backgroundColor: Colors.white,
        borderWidth: 1,
        borderColor: Colors.border,
    },
    activeChip: {
        backgroundColor: Colors.navy,
        borderColor: Colors.navy,
    },
    chipText: {
        fontFamily: 'Pretendard-Medium',
        fontSize: 14,
        color: Colors.subText,
    },
    activeChipText: {
        color: Colors.white,
        fontFamily: 'Pretendard-Bold',
    },
    // ✅ 민심 물어보기 버튼 스타일
    pollButton: {
        flexDirection: 'row',
        backgroundColor: Colors.navy,
        borderRadius: 16,
        height: 52,
        justifyContent: 'center',
        alignItems: 'center',
        marginTop: 16,
        marginBottom: 8,
        borderWidth: 2,
        borderColor: Colors.orange,
    },
    pollButtonText: {
        fontFamily: 'Pretendard-Bold',
        color: Colors.white,
        fontSize: 16,
    },
    // ✅ 참석 여부 토글 스타일
    attendanceRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 8,
    },
    attendanceLabel: {
        fontFamily: 'Pretendard-Medium',
        fontSize: 16,
        color: Colors.text,
    },
    // ✅ 식대/범위 정보 스타일
    venueInfo: {
        fontFamily: 'Pretendard-Medium',
        fontSize: 13,
        color: Colors.orange,
        textAlign: 'center',
        marginBottom: 8,
    },
    rangeInfo: {
        fontFamily: 'Pretendard-Medium',
        fontSize: 12,
        color: 'rgba(255,255,255,0.7)',
        textAlign: 'center',
        marginTop: 8,
    },
    // ✅ Input Styles
    input: {
        flex: 1,
        fontFamily: 'Pretendard-Bold',
        fontSize: 16,
        color: Colors.text,
        textAlign: 'right',
        borderWidth: 1,
        borderColor: Colors.border,
        borderRadius: 8,
        paddingVertical: 8,
        paddingHorizontal: 12,
        marginLeft: 16,
        backgroundColor: '#FAFAFA', // 입력 필드 배경색 추가
    },
    currencyInput: {
        marginRight: 4,
    },
    currencySuffix: {
        fontFamily: 'Pretendard-Bold',
        fontSize: 16,
        color: Colors.text,
        alignSelf: 'center',
        paddingVertical: 8,
    },
    // ✅ 테이블 카드 스타일
    tableCard: {
        marginBottom: 16,
    },
    // ✅ 민심 물어보기 Modal 스타일
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'flex-end',
    },
    modalContainer: {
        backgroundColor: Colors.background,
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        padding: 24,
        paddingBottom: 40,
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
    },
    modalTitle: {
        fontFamily: 'Pretendard-Bold',
        fontSize: 20,
        color: Colors.text,
    },
    modalSubtitle: {
        fontFamily: 'Pretendard-Medium',
        fontSize: 14,
        color: Colors.subText,
        marginBottom: 16,
        lineHeight: 20,
    },
    storyInput: {
        backgroundColor: '#F3F4F6',
        borderRadius: 12,
        padding: 16,
        minHeight: 150,
        fontFamily: 'Pretendard-Medium',
        fontSize: 15,
        color: Colors.text,
        textAlignVertical: 'top',
    },
    charCount: {
        fontFamily: 'Pretendard-Medium',
        fontSize: 12,
        color: Colors.subText,
        textAlign: 'right',
        marginTop: 8,
        marginBottom: 16,
    },
    submitButton: {
        backgroundColor: Colors.orange,
        borderRadius: 16,
        height: 52,
        justifyContent: 'center',
        alignItems: 'center',
    },
    submitButtonText: {
        fontFamily: 'Pretendard-Bold',
        color: Colors.white,
        fontSize: 16,
    },
    disclaimerContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 16,
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
    // ✅ 다중 거래 리스트 스타일
    selectAllRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 12,
        gap: 8,
    },
    selectAllText: {
        fontFamily: 'Pretendard-Medium',
        fontSize: 14,
        color: Colors.navy,
    },
    transactionCard: {
        flexDirection: 'row',
        backgroundColor: Colors.white,
        borderRadius: 16,
        padding: 16,
        marginBottom: 12,
        borderWidth: 2,
        borderColor: 'transparent',
    },
    transactionCardSelected: {
        borderColor: Colors.orange,
        backgroundColor: '#FFF7ED',
    },
    checkboxContainer: {
        marginRight: 12,
        justifyContent: 'center',
    },
    transactionInfo: {
        flex: 1,
    },
    transactionHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 4,
    },
    transactionType: {
        fontFamily: 'Pretendard-Bold',
        fontSize: 14,
        color: Colors.text,
    },
    transactionAmount: {
        fontFamily: 'Pretendard-Bold',
        fontSize: 18,
    },
    transactionTarget: {
        fontFamily: 'Pretendard-Medium',
        fontSize: 15,
        color: Colors.text,
        marginBottom: 2,
    },
    transactionDate: {
        fontFamily: 'Pretendard-Regular',
        fontSize: 12,
        color: Colors.subText,
    },
    editHintRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    editHint: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    editHintText: {
        fontFamily: 'Pretendard-Regular',
        fontSize: 12,
        color: Colors.subText,
    },
    // 편집 모드 상단 바
    editModeHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 16,
        gap: 8,
    },
    editModeBackButton: {
        padding: 8,
    },
    editModeTitle: {
        fontFamily: 'Pretendard-Bold',
        fontSize: 18,
        color: Colors.text,
    },
    editModeCompleteButton: {
        backgroundColor: Colors.navy,
        borderRadius: 12,
        paddingVertical: 14,
        alignItems: 'center',
        marginTop: 16,
    },
    editModeCompleteText: {
        fontFamily: 'Pretendard-Bold',
        fontSize: 16,
        color: Colors.white,
    },
    // ✅ 카테고리 선택 스타일
    infoRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: Colors.border,
    },
    infoLabel: {
        fontFamily: 'Pretendard-Medium',
        fontSize: 14,
        color: Colors.subText,
    },
    categorySelect: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#F5F5F5',
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 8,
        gap: 6,
    },
    categorySelectText: {
        fontFamily: 'Pretendard-Medium',
        fontSize: 14,
        color: Colors.text,
    },
    // 카테고리 선택 모달
    categoryModalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'flex-end',
    },
    categoryModalContent: {
        backgroundColor: Colors.white,
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        paddingTop: 20,
        paddingBottom: 40,
        maxHeight: '70%',
    },
    categoryModalTitle: {
        fontFamily: 'Pretendard-Bold',
        fontSize: 18,
        color: Colors.text,
        textAlign: 'center',
        marginBottom: 16,
    },
    categoryChipContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        paddingHorizontal: 20,
        gap: 10,
    },
    categoryChip: {
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 20,
        backgroundColor: '#F0F0F0',
        marginBottom: 8,
    },
    categoryChipSelected: {
        backgroundColor: Colors.orange,
    },
    categoryChipText: {
        fontFamily: 'Pretendard-Medium',
        fontSize: 14,
        color: Colors.text,
    },
    categoryChipTextSelected: {
        color: Colors.white,
    },
    // ✅ 날짜 없음 경고 스타일
    transactionCardWarning: {
        borderWidth: 2,
        borderColor: '#FFCDD2',
        backgroundColor: '#FFF5F5',
    },
    noDateWarning: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        backgroundColor: '#FFEBEE',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 4,
    },
    noDateText: {
        fontFamily: 'Pretendard-Medium',
        fontSize: 11,
        color: '#C62828',
    },
    // ✅ 날짜 피커 스타일
    datePickerOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'flex-end',
    },
    datePickerContainer: {
        backgroundColor: Colors.white,
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        paddingTop: 20,
        paddingBottom: 40,
        paddingHorizontal: 20,
    },
    datePickerTitle: {
        fontFamily: 'Pretendard-Bold',
        fontSize: 20,
        color: Colors.text,
        textAlign: 'center',
        marginBottom: 4,
    },
    datePickerHint: {
        fontFamily: 'Pretendard-Regular',
        fontSize: 13,
        color: Colors.subText,
        textAlign: 'center',
        marginBottom: 16,
    },
    datePickerRow: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        marginBottom: 16,
    },
    datePickerColumn: {
        flex: 1,
        alignItems: 'center',
    },
    datePickerLabel: {
        fontFamily: 'Pretendard-Bold',
        fontSize: 14,
        color: Colors.subText,
        marginBottom: 8,
    },
    datePickerScroll: {
        maxHeight: 180,
        width: '100%',
    },
    datePickerItem: {
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderRadius: 12,
        marginBottom: 4,
        alignItems: 'center',
    },
    datePickerItemSelected: {
        backgroundColor: Colors.navy,
    },
    datePickerItemText: {
        fontFamily: 'Pretendard-Medium',
        fontSize: 18,
        color: Colors.text,
    },
    datePickerItemTextSelected: {
        color: Colors.white,
        fontFamily: 'Pretendard-Bold',
    },
    datePickerPreview: {
        backgroundColor: '#F5F5F5',
        borderRadius: 12,
        paddingVertical: 16,
        alignItems: 'center',
        marginBottom: 16,
    },
    datePickerPreviewText: {
        fontFamily: 'Pretendard-Bold',
        fontSize: 22,
        color: Colors.navy,
    },
    datePickerButtons: {
        flexDirection: 'row',
        gap: 12,
    },
    datePickerCancelButton: {
        flex: 1,
        paddingVertical: 14,
        borderRadius: 12,
        backgroundColor: '#E0E0E0',
        alignItems: 'center',
    },
    datePickerCancelText: {
        fontFamily: 'Pretendard-Bold',
        fontSize: 16,
        color: Colors.text,
    },
    datePickerConfirmButton: {
        flex: 1,
        paddingVertical: 14,
        borderRadius: 12,
        backgroundColor: Colors.orange,
        alignItems: 'center',
    },
    datePickerConfirmText: {
        fontFamily: 'Pretendard-Bold',
        fontSize: 16,
        color: Colors.white,
    },
    // ✅ OCR 피드백 링크 스타일
    feedbackLink: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 16,
        gap: 6,
    },
    feedbackLinkText: {
        fontFamily: 'Pretendard-Regular',
        fontSize: 13,
        color: Colors.subText,
        textDecorationLine: 'underline',
    },
});
