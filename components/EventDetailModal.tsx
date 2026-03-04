import { Modal, View, Text, StyleSheet, TouchableOpacity, Linking, Alert } from 'react-native';
import { Colors } from '../constants/Colors';
import Ionicons from '@expo/vector-icons/Ionicons';
import { BlurView } from 'expo-blur';
import { addToCalendar } from '../services/calendar';
import { useRouter } from 'expo-router';
import { CommentThread } from './CommentThread';

interface EventDetailModalProps {
    visible: boolean;
    event: any; // Using any for flexibility with mock data
    onClose: () => void;
    onDelete?: (event: any) => void;
    onEdit?: (event: any) => void; // New prop for edit
}

// 한국 주요 페이 앱 정보
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

export function EventDetailModal({ visible, event, onClose, onDelete, onEdit }: EventDetailModalProps) {
    const router = useRouter();

    if (!event) return null;

    // derived state for demo
    const isPaid = false;
    // ✅ 금액이 없으면 0으로 처리 (기존에는 100000원 기본값이었음)
    const amount = event.amount || 0;

    // ✅ 경조사 여부 확인
    const isCeremony = (event.category === 'ceremony' || event.type === 'INVITATION' || ['wedding', 'funeral', 'birthday'].includes(event.type)) && event.type !== 'APPOINTMENT';

    // 날짜 포맷 함수
    const formatDate = (dateStr: string) => {
        if (!dateStr) return '날짜 없음';
        const d = new Date(dateStr);
        const days = ['일', '월', '화', '수', '목', '금', '토'];
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        const dayOfWeek = days[d.getDay()];
        return `${year}.${month}.${day} (${dayOfWeek})`;
    };

    // ... (keep handlePayment function as is) ...
    // 페이 앱 실행
    const handlePayment = async (payApp: typeof PAY_APPS[0]) => {
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
                            // 각 앱스토어 링크 (iOS 기준, Android는 market:// 사용)
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

    const handleAnalysis = () => {
        onClose();
        router.push({
            pathname: '/scan/result', params: {
                result: JSON.stringify({
                    recommendedAmount: amount,
                    minAmount: 50000,
                    maxAmount: 150000,
                    estimatedMealCost: 60000,
                    reasoning: "이전에 저장된 분석 결과입니다.",
                    closenessScore: 3
                })
            }
        });
    };

    const handleCalendarSync = async () => {
        await addToCalendar({
            title: `${event.name || event.topText} ${event.type === 'wedding' ? '결혼식' : '행사'}`,
            startDate: event.date || '2026-01-14',
            location: event.location || '위치 정보 없음',
            notes: `하루클릭 추천 금액: ${amount.toLocaleString()}원`
        });
    };

    return (
        <Modal
            animationType="slide"
            transparent={true}
            visible={visible}
            onRequestClose={onClose}
        >
            <View style={styles.overlay}>
                <TouchableOpacity style={styles.backdrop} onPress={onClose} activeOpacity={1} />

                <View style={styles.modalContent}>
                    {/* Header */}
                    <View style={styles.header}>
                        <View>
                            <Text style={styles.modalDate}>{formatDate(event.date)}</Text>
                            <Text style={styles.modalTitle}>{event.name || event.topText}</Text>
                        </View>
                        <View style={styles.headerRight}>
                            {onEdit && (
                                <TouchableOpacity onPress={() => onEdit(event)} style={styles.iconButton}>
                                    <Ionicons name="pencil-outline" size={24} color={Colors.text} />
                                </TouchableOpacity>
                            )}
                            {onDelete && event.source !== 'external' && (
                                <TouchableOpacity onPress={() => {
                                    Alert.alert(
                                        '내역 삭제',
                                        '정말로 이 내역을 삭제하시겠습니까? 삭제된 데이터는 복구할 수 없습니다.',
                                        [
                                            { text: '취소', style: 'cancel' },
                                            {
                                                text: '삭제',
                                                style: 'destructive',
                                                onPress: () => onDelete(event)
                                            }
                                        ]
                                    );
                                }} style={styles.iconButton}>
                                    <Ionicons name="trash-outline" size={24} color={Colors.red} />
                                </TouchableOpacity>
                            )}
                            <TouchableOpacity onPress={onClose} style={styles.iconButton}>
                                <Ionicons name="close" size={24} color={Colors.text} />
                            </TouchableOpacity>
                        </View>
                    </View>

                    {/* Body */}
                    <View style={styles.body}>
                        {/* 1. 가계부/지출 내역인 경우 (심플 뷰) */}
                        {event.category === 'expense' || event.type === 'receipt' || event.type === 'transfer' ? (
                            <>
                                <View style={styles.expenseBox}>
                                    <Text style={styles.expenseLabel}>
                                        {event.isReceived ? '입금 (수입)' : '결제/송금 (지출)'}
                                    </Text>
                                    <Text style={[styles.expenseAmount, event.isReceived ? { color: '#0064FF' } : { color: Colors.text }]}>
                                        {event.isReceived ? '+' : '-'}{amount.toLocaleString()}원
                                    </Text>
                                    <View style={styles.categoryBadge}>
                                        <Text style={styles.categoryText}>{event.relation || event.type}</Text>
                                    </View>
                                </View>

                                {event.memo ? (
                                    <View style={styles.memoBox}>
                                        <Ionicons name="document-text-outline" size={20} color={Colors.subText} />
                                        <Text style={styles.memoText}>{event.memo}</Text>
                                    </View>
                                ) : null}

                                <View style={styles.checkRow}>
                                    <Ionicons name="checkmark-circle" size={24} color={Colors.green} />
                                    <Text style={[styles.checkText, { color: Colors.green }]}>
                                        처리 완료됨
                                    </Text>
                                </View>
                            </>
                        ) : (
                            /* 2. 경조사/일정인 경우 */
                            <>
                                {/* Pay Buttons - Only for CEREMONY type events (Removed duplicate from top) */}

                                {/* Event Details Section */}
                                <View style={styles.section}>
                                    <Text style={styles.sectionTitle}>상세 정보</Text>

                                    {/* Source Indicator */}
                                    <View style={styles.row}>
                                        <Ionicons name="information-circle-outline" size={20} color="#888" />
                                        <Text style={styles.rowText}>
                                            {event.source === 'ledger' ? '가계부 내역' :
                                                event.source === 'bank_transactions' ? '은행 내역' :
                                                    isCeremony ? '경조사/초대장' : '캘린더 일정'}
                                        </Text>
                                    </View>

                                    {/* Amount - Show for all if non-zero */}
                                    {event.amount !== 0 && event.amount !== undefined && (
                                        <View style={styles.row}>
                                            <Ionicons name="cash-outline" size={20} color="#888" />
                                            <Text style={styles.rowText}>
                                                {event.amount?.toLocaleString()}원
                                                {event.isReceived !== undefined ? (event.isReceived ? ' (수입)' : ' (지출)') : ''}
                                            </Text>
                                        </View>
                                    )}

                                    {/* Location */}
                                    {event.location && (
                                        <View style={styles.row}>
                                            <Ionicons name="location-outline" size={20} color="#888" />
                                            <Text style={styles.rowText}>{event.location}</Text>
                                        </View>
                                    )}

                                    {/* Memo / Reason */}
                                    {(event.memo || event.recommendationReason) && (
                                        <View style={styles.row}>
                                            <Ionicons name="document-text-outline" size={20} color="#888" />
                                            <Text style={styles.rowText}>{event.memo || event.recommendationReason}</Text>
                                        </View>
                                    )}
                                </View>

                                {/* AI Recommendation - Only for Ceremony */}
                                {isCeremony && (
                                    <View style={styles.recommendationBox}>
                                        <View style={styles.aiHeader}>
                                            <Ionicons name="sparkles" size={16} color={Colors.orange} />
                                            <Text style={styles.aiTitle}>하루클릭 분석 결과</Text>
                                        </View>
                                        <Text style={styles.aiAmount}>{amount.toLocaleString()}원</Text>
                                        <Text style={styles.aiReason}>
                                            {event.memo?.includes('[AI 스캔]') ? "AI가 청첩장을 분석하여 추천한 금액입니다." : "관계와 행사 종류를 고려한 추천 금액입니다."}
                                        </Text>
                                    </View>
                                )}

                                {/* Location Link */}
                                {event.location && (
                                    <TouchableOpacity style={styles.locationRow} onPress={() => event.location && Linking.openURL(`https://map.naver.com/v5/search/${encodeURIComponent(event.location)}`)}>
                                        <Ionicons name="location-outline" size={20} color={Colors.navy} />
                                        <Text style={styles.locationText}>{event.location}</Text>
                                        <Ionicons name="chevron-forward" size={16} color="#BDC5CC" />
                                    </TouchableOpacity>
                                )}

                                {/* Payment Checkbox - Only for Ceremony */}
                                {isCeremony && (
                                    <TouchableOpacity style={styles.checkRow}>
                                        <Ionicons name={event.isPaid ? "checkbox" : "square-outline"} size={24} color={event.isPaid ? Colors.navy : '#BDC5CC'} />
                                        <Text style={[styles.checkText, event.isPaid && styles.checkedText]}>
                                            {event.isPaid ? '송금 완료' : '아직 송금하지 않았어요'}
                                        </Text>
                                    </TouchableOpacity>
                                )}
                            </>
                        )}
                    </View>

                    {/* Footer Actions (경조사일 때만 표시) */}
                    {isCeremony && !isPaid && (
                        <View style={styles.footer}>
                            <View style={styles.actionRow}>
                                <TouchableOpacity style={styles.secondaryButton} onPress={handleCalendarSync}>
                                    <Text style={styles.secondaryButtonText}>캘린더 저장</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={styles.secondaryButton} onPress={handleAnalysis}>
                                    <Text style={styles.secondaryButtonText}>분석 보기</Text>
                                </TouchableOpacity>
                            </View>

                            {/* 페이 앱 버튼들 */}
                            <Text style={styles.payTitle}>💳 간편 송금</Text>
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
                        </View>
                    )}

                    {/* 커뮤니티 피드 (관심사 일정 전용) */}
                    {event.source === 'interest' && (
                        <View style={styles.commentSection}>
                            <CommentThread eventId={event.id} />
                        </View>
                    )}
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        justifyContent: 'flex-end',
        backgroundColor: 'rgba(0,0,0,0.5)',
    },
    backdrop: {
        ...StyleSheet.absoluteFillObject,
    },
    modalContent: {
        backgroundColor: Colors.white,
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        padding: 24,
        paddingBottom: 40,
        minHeight: 450,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 24,
    },
    modalDate: {
        fontFamily: 'Pretendard-Medium',
        fontSize: 14,
        color: Colors.subText,
        marginBottom: 4,
    },
    modalTitle: {
        fontFamily: 'Pretendard-Bold',
        fontSize: 22,
        color: Colors.text,
    },
    headerRight: {
        flexDirection: 'row',
        gap: 8,
    },
    iconButton: {
        padding: 4,
    },
    body: {
        gap: 20,
    },
    infoRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    labelBadge: {
        backgroundColor: '#F2F4F6',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 6,
    },
    labelText: {
        fontFamily: 'Pretendard-Medium',
        fontSize: 12,
        color: Colors.subText,
    },
    valueText: {
        fontFamily: 'Pretendard-Bold',
        fontSize: 16,
        color: Colors.text,
    },
    recommendationBox: {
        backgroundColor: '#FFF8F0',
        padding: 16,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: '#FFE4C4',
    },
    aiHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginBottom: 8,
    },
    aiTitle: {
        fontFamily: 'Pretendard-Bold',
        fontSize: 13,
        color: Colors.orange,
    },
    aiAmount: {
        fontFamily: 'Pretendard-Bold',
        fontSize: 24,
        color: Colors.text,
        marginBottom: 4,
    },
    aiReason: {
        fontFamily: 'Pretendard-Medium',
        fontSize: 13,
        color: Colors.subText,
        lineHeight: 18,
    },
    locationRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#F2F4F6',
        gap: 8,
    },
    locationText: {
        flex: 1,
        fontFamily: 'Pretendard-Medium',
        fontSize: 16,
        color: Colors.text,
        textDecorationLine: 'underline',
    },
    checkRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        marginTop: 8,
    },
    checkText: {
        fontFamily: 'Pretendard-Medium',
        fontSize: 16,
        color: Colors.text,
    },
    checkedText: {
        color: Colors.subText,
        textDecorationLine: 'line-through',
    },
    footer: {
        marginTop: 24,
        gap: 12,
    },
    actionRow: {
        flexDirection: 'row',
        gap: 12,
    },
    secondaryButton: {
        flex: 1,
        paddingVertical: 14,
        borderRadius: 12,
        backgroundColor: '#F2F4F6',
        alignItems: 'center',
    },
    secondaryButtonText: {
        fontFamily: 'Pretendard-Bold',
        fontSize: 14,
        color: Colors.subText,
    },
    primaryButton: {
        flex: 1,
        paddingVertical: 16,
        borderRadius: 12,
        backgroundColor: '#0064FF',
        alignItems: 'center',
    },
    primaryButtonText: {
        fontFamily: 'Pretendard-Bold',
        fontSize: 16,
        color: Colors.white,
    },
    // 간편 송금 스타일
    payTitle: {
        fontFamily: 'Pretendard-Bold',
        fontSize: 14,
        color: Colors.text,
        marginTop: 8,
        marginBottom: 4,
    },
    payContainer: {
        flexDirection: 'row',
        gap: 8,
        marginTop: 8,
        marginBottom: 16,
    },
    payIcon: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: '#fff',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 4,
    },
    payIconText: {
        fontSize: 18,
    },
    payText: {
        fontFamily: 'Pretendard-Medium',
        fontSize: 12,
        color: '#fff',
    },
    section: {
        marginTop: 16,
        gap: 12,
    },
    sectionTitle: {
        fontFamily: 'Pretendard-Bold',
        fontSize: 14,
        color: Colors.text,
        marginBottom: 4,
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    rowText: {
        flex: 1,
        fontFamily: 'Pretendard-Regular',
        fontSize: 15,
        color: Colors.text,
        lineHeight: 20,
    },
    payRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    payButton: {
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderRadius: 12,
        minWidth: 100,
        alignItems: 'center',
    },
    payButtonText: {
        fontFamily: 'Pretendard-Bold',
        fontSize: 13,
    },
    // 가계부 스타일
    expenseBox: {
        alignItems: 'center',
        paddingVertical: 20,
    },
    expenseLabel: {
        fontFamily: 'Pretendard-Medium',
        fontSize: 14,
        color: Colors.subText,
        marginBottom: 8,
    },
    expenseAmount: {
        fontFamily: 'Pretendard-Bold',
        fontSize: 32,
        marginBottom: 12,
    },
    categoryBadge: {
        backgroundColor: '#F2F4F6',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 16,
    },
    categoryText: {
        fontFamily: 'Pretendard-Medium',
        fontSize: 14,
        color: Colors.text,
    },
    memoBox: {
        flexDirection: 'row',
        backgroundColor: '#F9FAFB',
        padding: 16,
        borderRadius: 12,
        gap: 12,
        alignItems: 'flex-start',
    },
    memoText: {
        flex: 1,
        fontFamily: 'Pretendard-Regular',
        fontSize: 15,
        color: Colors.text,
        lineHeight: 22,
    },
    commentSection: {
        flex: 1,
        marginTop: 20,
        minHeight: 250, // 키보드 등 공간 확보용 최소 높이
    }
});
