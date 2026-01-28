import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/Colors';
import { useTheme } from '../../contexts/ThemeContext';
import {
    getRelationshipLedgerSummary,
    getRelationshipTransactions,
    RelationshipSummary,
    RelationshipTransaction
} from '../../services/supabase-modules/relationship-ledger';

type TabKey = 'given' | 'received';

export default function RelationshipLedgerScreen() {
    const { colors } = useTheme();
    const [activeTab, setActiveTab] = useState<TabKey>('given');
    const [loading, setLoading] = useState(false);
    const [summaries, setSummaries] = useState<RelationshipSummary[]>([]);
    const [selectedPerson, setSelectedPerson] = useState<RelationshipSummary | null>(null);
    const [transactions, setTransactions] = useState<RelationshipTransaction[]>([]);

    const loadSummaries = useCallback(async () => {
        setLoading(true);
        const data = await getRelationshipLedgerSummary();
        setSummaries(data);
        setLoading(false);
    }, []);

    const loadTransactions = useCallback(async (personName: string) => {
        setLoading(true);
        const data = await getRelationshipTransactions(personName);
        setTransactions(data);
        setLoading(false);
    }, []);

    useFocusEffect(
        useCallback(() => {
            loadSummaries();
        }, [loadSummaries])
    );

    const filteredSummaries = useMemo(() => {
        const list = summaries.map((summary) => ({
            ...summary,
            displayAmount: activeTab === 'given' ? summary.totalGiven : summary.totalReceived
        }))
            .filter((summary) => summary.displayAmount > 0)
            .sort((a, b) => b.displayAmount - a.displayAmount);
        return list;
    }, [summaries, activeTab]);

    const handleSelectPerson = useCallback(async (person: RelationshipSummary) => {
        setSelectedPerson(person);
        await loadTransactions(person.personName);
    }, [loadTransactions]);

    const renderSummaryItem = useCallback(({ item }: { item: RelationshipSummary & { displayAmount: number } }) => (
        <TouchableOpacity style={[styles.card, { backgroundColor: colors.card }]} onPress={() => handleSelectPerson(item)}>
            <View style={styles.cardHeader}>
                <View>
                    <Text style={[styles.nameText, { color: colors.text }]}>{item.personName}</Text>
                    <Text style={[styles.metaText, { color: colors.subText }]}>{item.relation || '미지정'}</Text>
                </View>
                <Text style={[styles.amountText, { color: activeTab === 'given' ? Colors.danger : Colors.green }]}>
                    {activeTab === 'given' ? '-' : '+'}{item.displayAmount.toLocaleString()}원
                </Text>
            </View>
            <Text style={[styles.metaText, { color: colors.subText }]}>
                최근 {item.lastTransactionDate || '날짜 없음'} · {item.transactionCount}건
            </Text>
        </TouchableOpacity>
    ), [activeTab, colors.card, colors.subText, colors.text, handleSelectPerson]);

    const renderTransactionItem = useCallback(({ item }: { item: RelationshipTransaction }) => (
        <View style={[styles.card, { backgroundColor: colors.card }]}>
            <View style={styles.cardHeader}>
                <Text style={[styles.metaText, { color: colors.subText }]}>
                    {item.date || '날짜 없음'} · {item.source}
                </Text>
                <Text style={[styles.amountText, { color: item.isReceived ? Colors.green : Colors.danger }]}>
                    {item.isReceived ? '+' : '-'}{(item.amount || 0).toLocaleString()}원
                </Text>
            </View>
            <Text style={[styles.nameText, { color: colors.text }]}>
                {item.personName || '미지정'}
            </Text>
            {item.type ? (
                <Text style={[styles.metaText, { color: colors.subText }]}>
                    {item.type}
                </Text>
            ) : null}
        </View>
    ), [colors.card, colors.subText, colors.text]);

    if (selectedPerson) {
        return (
            <View style={[styles.container, { backgroundColor: colors.background }]}>
                <View style={styles.header}>
                    <TouchableOpacity style={styles.backButton} onPress={() => setSelectedPerson(null)}>
                        <Ionicons name="chevron-back" size={22} color={colors.text} />
                        <Text style={[styles.backText, { color: colors.text }]}>목록</Text>
                    </TouchableOpacity>
                    <Text style={[styles.title, { color: colors.text }]}>상세 내역</Text>
                </View>
                <View style={[styles.summaryBox, { backgroundColor: colors.card }]}>
                    <Text style={[styles.nameText, { color: colors.text }]}>{selectedPerson.personName}</Text>
                    <Text style={[styles.metaText, { color: colors.subText }]}>{selectedPerson.relation || '미지정'}</Text>
                    <View style={styles.totalRow}>
                        <Text style={[styles.totalLabel, { color: Colors.danger }]}>보낸 금액</Text>
                        <Text style={[styles.totalValue, { color: Colors.danger }]}>
                            -{selectedPerson.totalGiven.toLocaleString()}원
                        </Text>
                    </View>
                    <View style={styles.totalRow}>
                        <Text style={[styles.totalLabel, { color: Colors.green }]}>받은 금액</Text>
                        <Text style={[styles.totalValue, { color: Colors.green }]}>
                            +{selectedPerson.totalReceived.toLocaleString()}원
                        </Text>
                    </View>
                </View>
                {loading ? (
                    <ActivityIndicator style={{ marginTop: 24 }} color={Colors.orange} />
                ) : (
                    <FlatList
                        data={transactions}
                        keyExtractor={(item) => `${item.source}-${item.id}`}
                        renderItem={renderTransactionItem}
                        contentContainerStyle={styles.listContent}
                        ListEmptyComponent={
                            <Text style={[styles.emptyText, { color: colors.subText }]}>거래 내역이 없습니다.</Text>
                        }
                    />
                )}
            </View>
        );
    }

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            <View style={styles.header}>
                <Text style={[styles.title, { color: colors.text }]}>마음 보관함</Text>
                <Text style={[styles.subtitle, { color: colors.subText }]}>
                    인맥별로 보내고 받은 금액을 확인하세요
                </Text>
            </View>

            <View style={styles.tabRow}>
                <TouchableOpacity
                    style={[styles.tabButton, activeTab === 'given' && styles.activeTab]}
                    onPress={() => setActiveTab('given')}
                >
                    <Text style={[styles.tabText, activeTab === 'given' && styles.activeTabText]}>보낸 금액</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.tabButton, activeTab === 'received' && styles.activeTab]}
                    onPress={() => setActiveTab('received')}
                >
                    <Text style={[styles.tabText, activeTab === 'received' && styles.activeTabText]}>받은 금액</Text>
                </TouchableOpacity>
            </View>

            {loading ? (
                <ActivityIndicator style={{ marginTop: 24 }} color={Colors.orange} />
            ) : (
                <FlatList
                    data={filteredSummaries}
                    keyExtractor={(item) => item.personName}
                    renderItem={renderSummaryItem}
                    contentContainerStyle={styles.listContent}
                    ListEmptyComponent={
                        <Text style={[styles.emptyText, { color: colors.subText }]}>
                            아직 표시할 항목이 없습니다.
                        </Text>
                    }
                />
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        paddingHorizontal: 20,
        paddingTop: 24
    },
    header: {
        marginBottom: 16
    },
    title: {
        fontFamily: 'Pretendard-Bold',
        fontSize: 24
    },
    subtitle: {
        fontFamily: 'Pretendard-Medium',
        fontSize: 14,
        marginTop: 6
    },
    tabRow: {
        flexDirection: 'row',
        gap: 12,
        marginBottom: 12
    },
    tabButton: {
        flex: 1,
        paddingVertical: 10,
        borderRadius: 12,
        backgroundColor: 'rgba(255,255,255,0.08)',
        alignItems: 'center'
    },
    activeTab: {
        backgroundColor: Colors.orange
    },
    tabText: {
        fontFamily: 'Pretendard-Medium',
        color: Colors.lightGray
    },
    activeTabText: {
        color: Colors.white
    },
    listContent: {
        paddingBottom: 40,
        gap: 12
    },
    card: {
        borderRadius: 16,
        padding: 16,
        gap: 8
    },
    cardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center'
    },
    nameText: {
        fontFamily: 'Pretendard-Bold',
        fontSize: 16
    },
    metaText: {
        fontFamily: 'Pretendard-Medium',
        fontSize: 13
    },
    amountText: {
        fontFamily: 'Pretendard-Bold',
        fontSize: 16
    },
    emptyText: {
        textAlign: 'center',
        fontFamily: 'Pretendard-Medium',
        marginTop: 32
    },
    summaryBox: {
        borderRadius: 16,
        padding: 16,
        marginBottom: 12,
        gap: 8
    },
    totalRow: {
        flexDirection: 'row',
        justifyContent: 'space-between'
    },
    totalLabel: {
        fontFamily: 'Pretendard-Medium',
        fontSize: 14
    },
    totalValue: {
        fontFamily: 'Pretendard-Bold',
        fontSize: 14
    },
    backButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        marginBottom: 12
    },
    backText: {
        fontFamily: 'Pretendard-Medium'
    }
});
