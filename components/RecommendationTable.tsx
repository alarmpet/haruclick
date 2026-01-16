/**
 * RecommendationTable.tsx
 * 축의금/부조금 추천 금액 테이블
 * 사용자가 선택한 관계를 하이라이트하여 신뢰도 향상
 */

import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '../constants/Colors';
import { WEDDING_AMOUNTS, FUNERAL_AMOUNTS, RecommendationResult } from '../services/RecommendationEngine';

interface RecommendationTableProps {
    eventType: 'wedding' | 'funeral' | 'birthday' | string;
    selectedRelation: string | null;
    recommendation: RecommendationResult | null;
    venueName?: string;
    isVenueInDB?: boolean;
}

// 테이블에 표시할 관계 목록 (순서대로)
const TABLE_RELATIONS = [
    { key: '지인', label: '알고 지내는 지인' },
    { key: '직장 동료', label: '직장 동료 (협업)' },
    { key: '대학 동기', label: '대학 동기' },
    { key: '친한 친구', label: '친한 친구' },
    { key: '절친', label: '절친 (Best Friend)' },
    { key: '형제자매', label: '형제/자매' },
    { key: '직계가족', label: '직계 가족' },
];

export function RecommendationTable({
    eventType,
    selectedRelation,
    recommendation,
    venueName,
    isVenueInDB = false,
}: RecommendationTableProps) {
    const isWedding = eventType?.includes('wedding') || eventType?.includes('결혼');
    const isFuneral = eventType?.includes('funeral') || eventType?.includes('장례');

    const formatAmount = (amount: number) => {
        if (amount >= 1000000) return `${(amount / 10000).toFixed(0)}만 원+`;
        if (amount >= 100000) return `${(amount / 10000).toFixed(0)}만 원`;
        return `${(amount / 10000).toFixed(0)}만 원`;
    };

    const getNote = (key: string, attendAmount: number, notAttendAmount: number) => {
        if (key === '지인') return `참석 시 식대(${(attendAmount / 10000).toFixed(0)}만) 고려 필수`;
        if (key === '직장 동료') return `직장인 61.8%가 ${(attendAmount / 10000).toFixed(0)}만 원 적정 응답`;
        if (key === '친한 친구') return '식대+축하금, 호텔 예식은 15만 고려';
        if (key === '절친') return '축사 가능한 사이면 20만 원 이상';
        if (key === '형제자매') return '통상 50~100만 원 선';
        if (key === '직계가족') return '50만 원 이상 권장';
        return '';
    };

    return (
        <View style={styles.container}>
            {/* 헤더 */}
            <View style={styles.headerRow}>
                <Text style={[styles.headerCell, styles.relationCell]}>관계</Text>
                <Text style={[styles.headerCell, styles.amountCell]}>참석 시{'\n'}(식대 고려)</Text>
                <Text style={[styles.headerCell, styles.amountCell]}>불참 시{'\n'}(마음만)</Text>
                <Text style={[styles.headerCell, styles.noteCell]}>비고</Text>
            </View>

            {/* 데이터 행 */}
            {TABLE_RELATIONS.map((rel, index) => {
                const data = isWedding
                    ? WEDDING_AMOUNTS[rel.key]
                    : isFuneral
                        ? { attend: FUNERAL_AMOUNTS[rel.key] || 50000, notAttend: FUNERAL_AMOUNTS[rel.key] || 50000, min: 30000, max: 100000 }
                        : WEDDING_AMOUNTS[rel.key];

                if (!data) return null;

                const isSelected = selectedRelation === rel.key;
                const note = getNote(rel.key, data.attend, data.notAttend);

                // 선택된 관계에서 식대 반영으로 금액이 조정되었는지 확인
                const hasAdjustedAmount = isSelected &&
                    recommendation &&
                    recommendation.recommendedAmount > data.attend;

                return (
                    <View
                        key={rel.key}
                        style={[
                            styles.dataRow,
                            index % 2 === 0 && styles.evenRow,
                            isSelected && styles.selectedRow
                        ]}
                    >
                        <Text style={[styles.dataCell, styles.relationCell, isSelected && styles.selectedText]}>
                            {rel.label}
                        </Text>
                        <Text style={[styles.dataCell, styles.amountCell, isSelected && styles.selectedAmount]}>
                            {formatAmount(data.attend)}
                            {/* 식대 반영으로 금액 조정 시 표시 */}
                            {hasAdjustedAmount && (
                                `\n→ ${formatAmount(recommendation.recommendedAmount)}`
                            )}
                        </Text>
                        <Text style={[styles.dataCell, styles.amountCell, isSelected && styles.selectedAmount]}>
                            {formatAmount(data.notAttend)}
                        </Text>
                        <Text style={[styles.noteText, styles.noteCell, isSelected && styles.selectedText]} numberOfLines={3}>
                            {isSelected && hasAdjustedAmount
                                ? `🔺 식대(${((recommendation?.venueMealCost || 0) / 10000).toFixed(0)}만원) 반영`
                                : note}
                        </Text>
                    </View>
                );
            })}

            {/* 식대 정보 */}
            {recommendation && (
                <View style={styles.venueInfoBox}>
                    <Text style={styles.venueInfoTitle}>
                        {isVenueInDB ? '📍 예식장 DB 정보' : '📊 지역 통계 기준'}
                    </Text>
                    <Text style={styles.venueInfoText}>
                        {venueName
                            ? `${venueName} - 1인 식대 약 ${((recommendation.venueMealCost || 60000) / 10000).toFixed(0)}만원`
                            : `전국 평균 1인 식대 약 6만원 기준`}
                    </Text>
                    {!isVenueInDB && venueName && (
                        <Text style={styles.venueInfoNote}>
                            * DB에 없는 예식장입니다. 지역 평균 참고.
                        </Text>
                    )}
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        backgroundColor: '#1a1a2e',
        borderRadius: 12,
        overflow: 'hidden',
        marginVertical: 12,
    },
    headerRow: {
        flexDirection: 'row',
        backgroundColor: '#16213e',
        borderBottomWidth: 1,
        borderBottomColor: '#0f3460',
        paddingVertical: 12,
    },
    headerCell: {
        color: '#e94560',
        fontFamily: 'Pretendard-Bold',
        fontSize: 12,
        textAlign: 'center',
    },
    dataRow: {
        flexDirection: 'row',
        paddingVertical: 10,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.1)',
    },
    evenRow: {
        backgroundColor: 'rgba(255,255,255,0.03)',
    },
    selectedRow: {
        backgroundColor: Colors.orange,
    },
    dataCell: {
        color: '#ffffff',
        fontFamily: 'Pretendard-Medium',
        fontSize: 12,
        textAlign: 'center',
    },
    selectedText: {
        color: '#ffffff',
        fontFamily: 'Pretendard-Bold',
    },
    selectedAmount: {
        color: '#ffffff',
        fontFamily: 'Pretendard-Bold',
        fontSize: 13,
    },
    relationCell: {
        flex: 2,
        paddingLeft: 8,
        textAlign: 'left',
    },
    amountCell: {
        flex: 1.5,
    },
    noteCell: {
        flex: 2.5,
        paddingRight: 8,
    },
    noteText: {
        color: 'rgba(255,255,255,0.6)',
        fontFamily: 'Pretendard-Medium',
        fontSize: 10,
        textAlign: 'left',
    },
    venueInfoBox: {
        backgroundColor: '#16213e',
        padding: 12,
        borderTopWidth: 1,
        borderTopColor: '#0f3460',
    },
    venueInfoTitle: {
        color: Colors.orange,
        fontFamily: 'Pretendard-Bold',
        fontSize: 13,
        marginBottom: 4,
    },
    venueInfoText: {
        color: '#ffffff',
        fontFamily: 'Pretendard-Medium',
        fontSize: 12,
    },
    venueInfoNote: {
        color: 'rgba(255,255,255,0.5)',
        fontFamily: 'Pretendard-Medium',
        fontSize: 10,
        marginTop: 4,
        fontStyle: 'italic',
    },
});
