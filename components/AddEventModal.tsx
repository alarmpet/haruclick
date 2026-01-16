/**
 * AddEventModal.tsx
 * 카테고리별 다른 UI 제공
 * - 경조사: 기존 방식 (관계, 금액 추천 등)
 * - 할일/일정: 구글 캘린더 스타일
 */

import { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Modal,
    TouchableOpacity,
    TextInput,
    ScrollView,
    Switch,
    Platform,
    KeyboardAvoidingView,
    Alert,
    Dimensions,
    Pressable,
} from 'react-native';
import { Colors } from '../constants/Colors';
import { Ionicons } from '@expo/vector-icons';

import SpinnerTimePicker from './SpinnerTimePicker';
// import { Colors } from '../constants/Colors'; // Removed duplicate
import { saveUnifiedEvent } from '../services/supabase';
import { RecommendationEngine, RecommendationResult } from '../services/RecommendationEngine';

const { width } = Dimensions.get('window');

interface AddEventModalProps {
    visible: boolean;
    onClose: () => void;
    onSaved?: () => void;
    initialDate?: string;
    initialCategory?: 'ceremony' | 'todo' | 'schedule';
}

// 카테고리 탭
const CATEGORY_TABS = [
    { key: 'schedule', label: '일정', icon: 'calendar' },
    { key: 'todo', label: '할 일', icon: 'checkbox' },
    { key: 'ceremony', label: '경조사', icon: 'heart' },
];

// 경조사 세부 타입
const CEREMONY_TYPES = [
    { key: 'wedding', label: '결혼식', icon: 'heart', color: '#FF6B6B' },
    { key: 'funeral', label: '장례식', icon: 'flower', color: '#9E9E9E' },
    { key: 'birthday', label: '돌잔치', icon: 'gift', color: '#FFD93D' },
    { key: 'other', label: '기타', icon: 'calendar', color: '#4ECDC4' },
];

// 관계 옵션
const RELATIONS = [
    '직계가족', '형제자매', '가족', '절친', '친한 친구',
    '직장 동료', '대학 동기', '지인', '거래처'
];

// ✅ 현재 시간 기준 가장 가까운 정시 계산
const getNearestHour = () => {
    const now = new Date();
    const minutes = now.getMinutes();
    let hour = now.getHours();
    // 30분 이후면 다음 정시로
    if (minutes >= 30) hour += 1;
    if (hour >= 24) hour = 0;
    return hour.toString().padStart(2, '0') + ':00';
};

const getEndHour = (startTime: string) => {
    const [h] = startTime.split(':');
    const nextHour = (parseInt(h, 10) + 1) % 24;
    return nextHour.toString().padStart(2, '0') + ':00';
};

export function AddEventModal({ visible, onClose, onSaved, initialDate, initialCategory = 'schedule' }: AddEventModalProps) {
    const [category, setCategory] = useState<'ceremony' | 'todo' | 'schedule'>(initialCategory);
    const [title, setTitle] = useState('');
    const [date, setDate] = useState(initialDate || new Date().toISOString().split('T')[0]);
    const [isAllDay, setIsAllDay] = useState(false); // ✅ 기본값 OFF (구글 캘린더처럼)

    // ✅ 현재 시간 기준 가장 가까운 정시로 초기화
    const defaultStart = getNearestHour();
    const [startTime, setStartTime] = useState(defaultStart);
    const [endTime, setEndTime] = useState(getEndHour(defaultStart));
    const [location, setLocation] = useState('');
    const [memo, setMemo] = useState('');
    const [saving, setSaving] = useState(false);

    // 시간 선택 모달
    const [showTimePicker, setShowTimePicker] = useState(false);
    const [activeTab, setActiveTab] = useState<'start' | 'end'>('start'); // ✅ 현재 편집 중인 탭

    // 임시 저장용 State (모달에서 취소/확인)
    const [tempStartHour, setTempStartHour] = useState('09');
    const [tempStartMinute, setTempStartMinute] = useState('00');
    const [tempEndHour, setTempEndHour] = useState('10');
    const [tempEndMinute, setTempEndMinute] = useState('00');
    const [isEndTimeManuallySet, setIsEndTimeManuallySet] = useState(false);

    // 경조사 전용
    const [ceremonyType, setCeremonyType] = useState('wedding');

    const [relation, setRelation] = useState('친한 친구');
    const [amount, setAmount] = useState('100000');
    // New states
    const [recurrence, setRecurrence] = useState<'none' | 'daily' | 'weekly' | 'monthly' | 'yearly'>('none');
    const [selectedAlarm, setSelectedAlarm] = useState<number | null>(null);

    // ✅ 커스텀 모달 상태 (Android Alert 제한 해결)
    const [showRecurrenceModal, setShowRecurrenceModal] = useState(false);

    // Theme Colors
    const THEME_NAVY = Colors.navy;
    const THEME_ORANGE = Colors.orange;
    const [showAlarmModal, setShowAlarmModal] = useState(false);

    const recurrenceOptions = [
        { label: '반복 안함', value: 'none' },
        { label: '매일', value: 'daily' },
        { label: '매주', value: 'weekly' },
        { label: '매월', value: 'monthly' },
        { label: '매년', value: 'yearly' },
    ];

    const alarmOptions = [
        { label: '알림 없음', value: null },
        { label: '정시', value: 0 },
        { label: '10분 전', value: 10 },
        { label: '30분 전', value: 30 },
        { label: '1시간 전', value: 60 },
        { label: '1일 전', value: 1440 },
    ];
    const [recommendation, setRecommendation] = useState<RecommendationResult | null>(null);

    useEffect(() => {
        if (initialDate) setDate(initialDate);
        if (initialCategory) setCategory(initialCategory);
    }, [initialDate, initialCategory, visible]);

    // 경조사: 관계/타입 변경 시 추천 금액
    useEffect(() => {
        if (category === 'ceremony') {
            const rec = RecommendationEngine.recommend(ceremonyType, relation, true, location);
            setRecommendation(rec);
        }
    }, [ceremonyType, relation, location, category]);

    const applyRecommendation = () => {
        if (recommendation) {
            setAmount(recommendation.recommendedAmount.toString());
        }
    };

    const handleSave = async () => {
        if (!title.trim()) {
            Alert.alert('입력 오류', '제목을 입력해주세요.');
            return;
        }

        setSaving(true);
        try {
            if (category === 'ceremony') {
                await saveUnifiedEvent({
                    type: 'INVITATION',
                    eventType: ceremonyType as 'wedding' | 'funeral' | 'birthday' | 'other',
                    eventDate: date,
                    eventLocation: location || undefined,
                    mainName: title,
                    senderName: title,
                    recommendedAmount: parseInt(amount) || 100000,
                    recommendationReason: `${relation} 관계`,
                });
            } else {
                await saveUnifiedEvent({
                    type: 'INVITATION',
                    eventType: 'other',
                    eventDate: date,
                    eventLocation: location || undefined,
                    mainName: title,
                    senderName: title,
                    recommendedAmount: 0,
                    recommendationReason: category === 'todo' ? '할일' : '일정',
                }, undefined, {
                    recurrence: recurrence,
                    alarmMinutes: selectedAlarm !== null ? selectedAlarm : undefined,
                    startTime: isAllDay ? undefined : startTime,
                    endTime: isAllDay ? undefined : endTime,
                    isAllDay: isAllDay
                });
            }

            Alert.alert('저장 완료', '저장되었습니다.', [{
                text: '확인',
                onPress: () => {
                    resetForm();
                    onClose();
                    onSaved?.();
                }
            }]);
        } catch (error) {
            Alert.alert('오류', '저장 중 문제가 발생했습니다.');
        } finally {
            setSaving(false);
        }
    };

    const resetForm = () => {
        setTitle('');
        setCategory('schedule');
        setCeremonyType('wedding');
        setDate(new Date().toISOString().split('T')[0]);
        setIsAllDay(false); // ✅ 기본값 OFF
        const newStart = getNearestHour();
        setStartTime(newStart);
        setEndTime(getEndHour(newStart));
        setLocation('');
        setMemo('');
        setRelation('친한 친구');
        setAmount('100000');
        setRecurrence('none');
        setSelectedAlarm(null);
        setIsEndTimeManuallySet(false);
    };


    // ✅ 커스텀 모달로 변경 (Android Alert 제한 해결)
    const handleRecurrencePress = () => setShowRecurrenceModal(true);
    const handleAlarmPress = () => setShowAlarmModal(true);

    const formatDate = (dateStr: string) => {
        const d = new Date(dateStr);
        const days = ['일', '월', '화', '수', '목', '금', '토'];
        return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 (${days[d.getDay()]})`;
    };

    // 시간 선택 모달 열기 (시작/종료 통합)
    const openTimePicker = (initialTab: 'start' | 'end' = 'start') => {
        setActiveTab(initialTab);

        const [sH, sM] = startTime.split(':');
        setTempStartHour(sH);
        setTempStartMinute(sM);

        const [eH, eM] = endTime.split(':');
        setTempEndHour(eH);
        setTempEndMinute(eM);

        setShowTimePicker(true);
    };

    // 시간 적용 (통합)
    const applyTime = () => {
        const newStart = `${tempStartHour.padStart(2, '0')}:${tempStartMinute.padStart(2, '0')}`;
        const newEnd = `${tempEndHour.padStart(2, '0')}:${tempEndMinute.padStart(2, '0')}`;

        // 유효성 검사는 일단 느슨하게 (종료가 시작보다 빨라도 단순 저장 허용할지, 아니면 경고할지 -> 경고 없이 자동 보정 안 함, 유저 자율)
        setStartTime(newStart);
        setEndTime(newEnd);
        setShowTimePicker(false);
    };

    // 현재 탭의 값을 변경하는 헬퍼
    const setSampleHour = (h: string) => {
        if (activeTab === 'start') setTempStartHour(h);
        else setTempEndHour(h);
    };

    const setSampleMinute = (m: string) => {
        if (activeTab === 'start') setTempStartMinute(m);
        else setTempEndMinute(m);
    };

    const getActiveHour = () => activeTab === 'start' ? tempStartHour : tempEndHour;
    const getActiveMinute = () => activeTab === 'start' ? tempStartMinute : tempEndMinute;

    // ==================== 경조사 UI ====================
    const renderCeremonyUI = () => (
        <>
            {/* 경조사 종류 */}
            <Text style={styles.label}>📋 경조사 종류</Text>
            <View style={styles.ceremonyTypes}>
                {CEREMONY_TYPES.map((type) => (
                    <TouchableOpacity
                        key={type.key}
                        style={[
                            styles.ceremonyType,
                            ceremonyType === type.key && { backgroundColor: type.color, borderColor: type.color },
                        ]}
                        onPress={() => setCeremonyType(type.key)}
                    >
                        <Ionicons
                            name={type.icon as any}
                            size={16}
                            color={ceremonyType === type.key ? '#fff' : type.color}
                        />
                        <Text style={[
                            styles.ceremonyTypeText,
                            ceremonyType === type.key && { color: '#fff' },
                        ]}>
                            {type.label}
                        </Text>
                    </TouchableOpacity>
                ))}
            </View>

            {/* 이름 */}
            <Text style={styles.label}>👤 이름 (주인공)</Text>
            <TextInput
                style={styles.input}
                placeholder="예: 홍길동"
                placeholderTextColor="#666"
                value={title}
                onChangeText={setTitle}
            />

            {/* 날짜 */}
            <Text style={styles.label}>📅 날짜</Text>
            <TouchableOpacity style={styles.dateButton}>
                <Text style={styles.dateText}>{formatDate(date)}</Text>
            </TouchableOpacity>

            {/* 장소 */}
            <Text style={styles.label}>📍 장소</Text>
            <TextInput
                style={styles.input}
                placeholder="예: 더파티움 웨딩홀"
                placeholderTextColor="#666"
                value={location}
                onChangeText={setLocation}
            />

            {/* 관계 */}
            <Text style={styles.label}>👥 관계</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.relationScroll}>
                {RELATIONS.map((rel) => (
                    <TouchableOpacity
                        key={rel}
                        style={[
                            styles.relationChip,
                            relation === rel && styles.relationChipActive,
                        ]}
                        onPress={() => setRelation(rel)}
                    >
                        <Text style={[
                            styles.relationChipText,
                            relation === rel && styles.relationChipTextActive,
                        ]}>
                            {rel}
                        </Text>
                    </TouchableOpacity>
                ))}
            </ScrollView>

            {/* AI 추천 금액 */}
            {recommendation && (
                <View style={styles.recommendationBox}>
                    <Text style={styles.recommendationTitle}>💡 AI 추천 금액</Text>
                    <Text style={styles.recommendationAmount}>
                        {recommendation.recommendedAmount.toLocaleString()}원
                    </Text>
                    <Text style={styles.recommendationReason}>{recommendation.reason}</Text>
                    <TouchableOpacity style={styles.applyButton} onPress={applyRecommendation}>
                        <Text style={styles.applyButtonText}>적용</Text>
                    </TouchableOpacity>
                </View>
            )}

            {/* 금액 입력 */}
            <Text style={styles.label}>💰 금액</Text>
            <View style={styles.amountRow}>
                <TextInput
                    style={styles.amountInput}
                    value={amount}
                    onChangeText={setAmount}
                    keyboardType="number-pad"
                    placeholder="100000"
                    placeholderTextColor="#666"
                />
                <Text style={styles.wonText}>원</Text>
            </View>

            {/* 메모 */}
            <Text style={styles.label}>📝 메모</Text>
            <TextInput
                style={[styles.input, { height: 80 }]}
                placeholder="추가 메모..."
                placeholderTextColor="#666"
                value={memo}
                onChangeText={setMemo}
                multiline
            />
        </>
    );

    // ==================== 일정/할일 UI (구글 캘린더 스타일) ====================
    const renderScheduleUI = () => (
        <>
            {/* 제목 */}
            <TextInput
                style={styles.titleInput}
                placeholder="제목 추가"
                placeholderTextColor="#888"
                value={title}
                onChangeText={setTitle}
            />

            {/* 종일 토글 */}
            <View style={styles.row}>
                <Ionicons name="time-outline" size={24} color="#888" />
                <Text style={styles.rowText}>종일</Text>
                <Switch
                    value={isAllDay}
                    onValueChange={setIsAllDay}
                    trackColor={{ false: '#444', true: '#5B7FBF' }}
                    thumbColor={isAllDay ? '#fff' : '#ccc'}
                />
            </View>

            {/* 날짜/시간 */}
            <TouchableOpacity style={styles.row} onPress={() => !isAllDay && openTimePicker('start')}>
                <View style={{ width: 24 }} />
                <Text style={styles.rowText}>{formatDate(date)}</Text>
                {!isAllDay && <Text style={styles.timeText}>{startTime}</Text>}
            </TouchableOpacity>

            {!isAllDay && (
                <TouchableOpacity style={styles.row} onPress={() => openTimePicker('end')}>
                    <View style={{ width: 24 }} />
                    <Text style={styles.rowText}>{formatDate(date)}</Text>
                    <Text style={styles.timeText}>{endTime}</Text>
                </TouchableOpacity>
            )}

            {/* 반복 */}
            <TouchableOpacity style={styles.row} onPress={handleRecurrencePress}>
                <Ionicons name="repeat-outline" size={24} color={recurrence !== 'none' ? "#5B7FBF" : "#888"} />
                <Text style={[styles.rowText, recurrence !== 'none' && { color: '#5B7FBF' }]}>
                    {recurrenceOptions.find(r => r.value === recurrence)?.label || '반복 안함'}
                </Text>
            </TouchableOpacity>

            {/* 할일 전용: 마감일 */}
            {category === 'todo' && (
                <TouchableOpacity style={styles.row}>
                    <Ionicons name="checkmark-circle-outline" size={24} color="#888" />
                    <Text style={styles.rowText}>마감일 추가</Text>
                </TouchableOpacity>
            )}

            {/* 위치 */}
            <View style={styles.row}>
                <Ionicons name="location-outline" size={24} color="#888" />
                <TextInput
                    style={styles.locationInput}
                    placeholder="위치 추가"
                    placeholderTextColor="#888"
                    value={location}
                    onChangeText={setLocation}
                />
            </View>

            {/* 알림 */}
            <TouchableOpacity style={styles.row} onPress={handleAlarmPress}>
                <Ionicons name="notifications-outline" size={24} color={selectedAlarm !== null ? "#5B7FBF" : "#888"} />
                <Text style={[styles.rowText, selectedAlarm !== null && { color: '#5B7FBF' }]}>
                    {alarmOptions.find(a => a.value === selectedAlarm)?.label || '알림 없음'}
                </Text>
            </TouchableOpacity>

            {/* 세부정보 */}
            <View style={styles.row}>
                <Ionicons name="menu-outline" size={24} color="#888" />
                <TextInput
                    style={styles.locationInput}
                    placeholder="세부정보 추가"
                    placeholderTextColor="#888"
                    value={memo}
                    onChangeText={setMemo}
                    multiline
                />
            </View>
        </>
    );

    return (
        <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onClose}>
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={styles.container}
            >
                {/* 헤더 */}
                <View style={styles.header}>
                    <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                        <Ionicons name="close" size={24} color="#fff" />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>
                        {category === 'ceremony' ? '경조사 추가' : category === 'todo' ? '할일 추가' : '일정 추가'}
                    </Text>
                    <TouchableOpacity
                        style={[styles.saveBtn, saving && { opacity: 0.5 }]}
                        onPress={handleSave}
                        disabled={saving}
                    >
                        <Text style={styles.saveBtnText}>저장</Text>
                    </TouchableOpacity>
                </View>

                {/* 카테고리 탭 */}
                <View style={styles.categoryTabs}>
                    {CATEGORY_TABS.map((tab) => (
                        <TouchableOpacity
                            key={tab.key}
                            style={[styles.categoryTab, category === tab.key && styles.categoryTabActive]}
                            onPress={() => setCategory(tab.key as 'ceremony' | 'todo' | 'schedule')}
                        >
                            <Ionicons
                                name={tab.icon as any}
                                size={16}
                                color={category === tab.key ? '#fff' : '#888'}
                            />
                            <Text style={[styles.categoryTabText, category === tab.key && styles.categoryTabTextActive]}>
                                {tab.label}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </View>

                <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
                    {category === 'ceremony' ? renderCeremonyUI() : renderScheduleUI()}
                    <View style={{ height: 100 }} />
                </ScrollView>
            </KeyboardAvoidingView>

            {/* ✅ 그리드 스타일 시간 선택 피커 모달 (통합) */}
            <Modal visible={showTimePicker} transparent animationType="fade">
                <View style={styles.pickerOverlay}>
                    <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowTimePicker(false)} />
                    <View style={styles.pickerContainer}>
                        {/* 헤더 (타이틀) */}
                        <View style={styles.pickerHeader}>
                            <Text style={styles.pickerTitle}>시간 설정</Text>
                        </View>

                        {/* 탭 헤더: 시작시간 / 종료시간 */}
                        <View style={styles.timeTabRow}>
                            <TouchableOpacity
                                style={[styles.timeTab, activeTab === 'start' && styles.timeTabActive]}
                                onPress={() => setActiveTab('start')}
                            >
                                <Text style={[styles.timeTabLabel, activeTab === 'start' && styles.timeTabLabelActive]}>시작 시간</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.timeTab, activeTab === 'end' && styles.timeTabActive]}
                                onPress={() => setActiveTab('end')}
                            >
                                <Text style={[styles.timeTabLabel, activeTab === 'end' && styles.timeTabLabelActive]}>종료 시간</Text>
                            </TouchableOpacity>
                        </View>

                        {/* ✅ 통합 아날로그 시계 (Start/End 탭은 유지, 중앙 시계 교체) */}
                        <View style={styles.pickerContentContainer}>
                            <SpinnerTimePicker
                                hour={activeTab === 'start' ? parseInt(tempStartHour) : parseInt(tempEndHour)}
                                minute={activeTab === 'start' ? parseInt(tempStartMinute) : parseInt(tempEndMinute)}
                                onChange={(h, m) => {
                                    const hStr = h.toString().padStart(2, '0');
                                    const mStr = m.toString().padStart(2, '0');

                                    if (activeTab === 'start') {
                                        setTempStartHour(hStr);
                                        setTempStartMinute(mStr);

                                        // ✅ [자동 로직] 사용자가 종료 시간을 수동으로 설정하지 않았다면, 종료 시간 = 시작 시간 + 1시간
                                        if (!isEndTimeManuallySet) {
                                            const nextHour = (h + 1) % 24;
                                            setTempEndHour(nextHour.toString().padStart(2, '0'));
                                            setTempEndMinute(mStr);
                                        }
                                    } else {
                                        // 종료 시간을 직접 변경함 -> 수동 플래그 True
                                        setTempEndHour(hStr);
                                        setTempEndMinute(mStr);
                                        setIsEndTimeManuallySet(true);
                                    }
                                }}
                            />
                        </View>

                        {/* 버튼 */}
                        <View style={styles.pickerButtons}>
                            <TouchableOpacity style={styles.pickerCancel} onPress={() => setShowTimePicker(false)}>
                                <Text style={styles.pickerCancelText}>취소</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.pickerConfirm} onPress={applyTime}>
                                <Text style={styles.pickerConfirmText}>확인</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* ✅ 반복 설정 모달 */}
            <Modal visible={showRecurrenceModal} transparent animationType="fade">
                <TouchableOpacity
                    style={styles.pickerOverlay}
                    activeOpacity={1}
                    onPress={() => setShowRecurrenceModal(false)}
                >
                    <View style={styles.optionModalContainer} onStartShouldSetResponder={() => true}>
                        <Text style={styles.optionModalTitle}>반복 설정</Text>
                        {recurrenceOptions.map((opt) => (
                            <TouchableOpacity
                                key={opt.value}
                                style={[styles.optionItem, recurrence === opt.value && styles.optionItemActive]}
                                onPress={() => {
                                    setRecurrence(opt.value as any);
                                    setShowRecurrenceModal(false);
                                }}
                            >
                                <Ionicons
                                    name={recurrence === opt.value ? 'radio-button-on' : 'radio-button-off'}
                                    size={20}
                                    color={recurrence === opt.value ? '#5B7FBF' : '#888'}
                                />
                                <Text style={[styles.optionItemText, recurrence === opt.value && styles.optionItemTextActive]}>
                                    {opt.label}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                </TouchableOpacity>
            </Modal>

            {/* ✅ 알림 설정 모달 */}
            <Modal visible={showAlarmModal} transparent animationType="fade">
                <TouchableOpacity
                    style={styles.pickerOverlay}
                    activeOpacity={1}
                    onPress={() => setShowAlarmModal(false)}
                >
                    <View style={styles.optionModalContainer} onStartShouldSetResponder={() => true}>
                        <Text style={styles.optionModalTitle}>알림 설정</Text>
                        {alarmOptions.map((opt, index) => (
                            <TouchableOpacity
                                key={index}
                                style={[styles.optionItem, selectedAlarm === opt.value && styles.optionItemActive]}
                                onPress={() => {
                                    setSelectedAlarm(opt.value);
                                    setShowAlarmModal(false);
                                }}
                            >
                                <Ionicons
                                    name={selectedAlarm === opt.value ? 'radio-button-on' : 'radio-button-off'}
                                    size={20}
                                    color={selectedAlarm === opt.value ? '#5B7FBF' : '#888'}
                                />
                                <Text style={[styles.optionItemText, selectedAlarm === opt.value && styles.optionItemTextActive]}>
                                    {opt.label}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                </TouchableOpacity>
            </Modal>
        </Modal>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#1a1a2e' },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingTop: 50,
        paddingBottom: 16,
    },
    closeBtn: { padding: 8 },
    headerTitle: { fontFamily: 'Pretendard-Bold', fontSize: 18, color: '#fff' },
    saveBtn: { backgroundColor: '#5B7FBF', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20 },
    saveBtnText: { color: '#fff', fontFamily: 'Pretendard-Medium', fontSize: 14 },
    categoryTabs: { flexDirection: 'row', justifyContent: 'center', paddingVertical: 12, gap: 8 },
    categoryTab: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: '#444',
        gap: 6,
    },
    categoryTabActive: { backgroundColor: '#5B7FBF', borderColor: '#5B7FBF' },
    categoryTabText: { fontFamily: 'Pretendard-Medium', fontSize: 14, color: '#888' },
    categoryTabTextActive: { color: '#fff' },
    content: { flex: 1, paddingHorizontal: 20 },

    // 경조사 UI 스타일
    label: { fontFamily: 'Pretendard-Medium', fontSize: 14, color: '#ccc', marginTop: 20, marginBottom: 8 },
    input: {
        backgroundColor: '#2a2a4e',
        borderRadius: 12,
        padding: 14,
        fontFamily: 'Pretendard-Regular',
        fontSize: 16,
        color: '#fff',
    },
    dateButton: { backgroundColor: '#2a2a4e', borderRadius: 12, padding: 14 },
    dateText: { fontFamily: 'Pretendard-Regular', fontSize: 16, color: '#fff' },
    ceremonyTypes: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    ceremonyType: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: '#444',
        gap: 6,
    },
    ceremonyTypeText: { fontFamily: 'Pretendard-Medium', fontSize: 13, color: '#888' },
    relationScroll: { marginBottom: 8 },
    relationChip: {
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: '#444',
        marginRight: 8,
    },
    relationChipActive: { backgroundColor: '#5B7FBF', borderColor: '#5B7FBF' },
    relationChipText: { fontFamily: 'Pretendard-Medium', fontSize: 13, color: '#888' },
    relationChipTextActive: { color: '#fff' },
    recommendationBox: {
        backgroundColor: '#2a2a4e',
        borderRadius: 12,
        padding: 16,
        marginTop: 16,
        alignItems: 'center',
    },
    recommendationTitle: { fontFamily: 'Pretendard-Medium', fontSize: 14, color: '#FFD93D' },
    recommendationAmount: { fontFamily: 'Pretendard-Bold', fontSize: 28, color: '#fff', marginVertical: 8 },
    recommendationReason: { fontFamily: 'Pretendard-Regular', fontSize: 12, color: '#888', textAlign: 'center' },
    applyButton: { backgroundColor: '#5B7FBF', paddingHorizontal: 24, paddingVertical: 10, borderRadius: 20, marginTop: 12 },
    applyButtonText: { fontFamily: 'Pretendard-Medium', fontSize: 14, color: '#fff' },
    amountRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    amountInput: {
        flex: 1,
        backgroundColor: '#2a2a4e',
        borderRadius: 12,
        padding: 14,
        fontFamily: 'Pretendard-Medium',
        fontSize: 18,
        color: '#fff',
        textAlign: 'right',
    },
    wonText: { fontFamily: 'Pretendard-Medium', fontSize: 18, color: '#888' },

    // 일정/할일 UI 스타일
    titleInput: {
        fontSize: 24,
        fontFamily: 'Pretendard-Medium',
        color: '#fff',
        paddingVertical: 20,
        borderBottomWidth: 1,
        borderBottomColor: '#333',
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 16,
        borderBottomWidth: 0.5,
        borderBottomColor: '#333',
        gap: 16,
    },
    rowText: { flex: 1, fontFamily: 'Pretendard-Regular', fontSize: 16, color: '#fff' },
    timeText: { fontFamily: 'Pretendard-Regular', fontSize: 16, color: '#5B7FBF' },
    locationInput: { flex: 1, fontFamily: 'Pretendard-Regular', fontSize: 16, color: '#fff' },

    // 시간 피커 스타일
    pickerOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.7)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    pickerContainer: {
        backgroundColor: Colors.navy, // Unified Navy Background
        borderRadius: 24,
        padding: 20,
        width: '90%',
        maxWidth: 360,
    },
    pickerHeader: {
        marginBottom: 20,
        alignItems: 'center',
    },
    pickerContentContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        marginBottom: 20,
    },
    pickerTitle: {
        fontFamily: 'Pretendard-Bold',
        fontSize: 16,
        color: '#fff',
        marginBottom: 10,
    },
    timeTabRow: {
        flexDirection: 'row',
        backgroundColor: '#1E293B', // Slate 800 (Lighter Navy for tab background)
        borderRadius: 12,
        padding: 4,
        marginBottom: 20,
        width: '100%',
    },
    timeTab: {
        flex: 1,
        alignItems: 'center',
        paddingVertical: 8,
        borderRadius: 10,
    },
    timeTabActive: {
        backgroundColor: Colors.orange, // Orange Accent
    },
    timeTabLabel: {
        fontFamily: 'Pretendard-Bold',
        fontSize: 14,
        color: '#94A3B8', // Slate 400
    },
    timeTabLabelActive: {
        color: '#fff',
    },
    timeTabText: {
        display: 'none', // 탭 내부의 작은 텍스트는 숨김 (중앙 대형 시계 사용)
    },
    timeTabTextActive: {
        display: 'none',
    },

    // ✅ 대형 디지털 시계 스타일
    bigClockContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 10,
        marginBottom: 20,
        backgroundColor: '#1E293B',
        borderRadius: 20,
        width: '100%',
    },
    bigClockText: {
        fontFamily: 'Pretendard-Bold',
        fontSize: 64, // ⚡ 초대형 폰트
        color: '#5B7FBF',
        letterSpacing: 2,
    },

    pickerButtons: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginTop: 20,
        gap: 12,
    },
    pickerCancel: {
        flex: 1,
        paddingVertical: 14,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#334155', // Subtle Border
    },
    pickerCancelText: {
        fontFamily: 'Pretendard-Medium',
        fontSize: 14,
        color: '#94A3B8',
        textAlign: 'center',
    },
    pickerConfirm: {
        flex: 1,
        paddingVertical: 14,
        borderRadius: 12,
        backgroundColor: Colors.orange, // Primary Orange
    },
    pickerConfirmText: {
        fontFamily: 'Pretendard-Medium',
        fontSize: 14,
        color: '#fff',
        textAlign: 'center',
    },
    // ✅ 옵션 모달 스타일 (반복/알림)
    optionModalContainer: {
        backgroundColor: '#2a2a4e',
        borderRadius: 20,
        padding: 20,
        width: '80%',
        maxWidth: 320,
    },
    optionModalTitle: {
        fontFamily: 'Pretendard-Bold',
        fontSize: 18,
        color: '#fff',
        textAlign: 'center',
        marginBottom: 16,
        paddingBottom: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#3a3a5e',
    },
    optionItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 14,
        paddingHorizontal: 16,
        borderRadius: 12,
        gap: 12,
    },
    optionItemActive: {
        backgroundColor: 'rgba(91, 127, 191, 0.2)',
    },
    optionItemText: {
        fontFamily: 'Pretendard-Medium',
        fontSize: 16,
        color: '#ccc',
    },
    optionItemTextActive: {
        color: '#5B7FBF',
        fontFamily: 'Pretendard-Bold',
    },
});
