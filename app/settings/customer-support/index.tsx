import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, ActivityIndicator, Alert, ScrollView } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { supabase } from '../../../services/supabase';
import { Colors } from '../../../constants/Colors';
import { Ionicons } from '@expo/vector-icons';

type Notice = {
    id: string;
    title: string;
    content: string;
    created_at: string;
    is_active: boolean; // Just in case
};

type Inquiry = {
    id: string;
    title: string;
    content: string;
    answer: string | null;
    status: 'pending' | 'answered';
    created_at: string;
};

export default function CustomerSupportScreen() {
    const router = useRouter();
    const [activeTab, setActiveTab] = useState<'notice' | 'inquiry'>('notice');
    const [notices, setNotices] = useState<Notice[]>([]);
    const [inquiries, setInquiries] = useState<Inquiry[]>([]);
    const [loading, setLoading] = useState(false);

    // For expanding notice/inquiry details
    const [expandedId, setExpandedId] = useState<string | null>(null);

    useEffect(() => {
        if (activeTab === 'notice') fetchNotices();
        else fetchInquiries();
    }, [activeTab]);

    const fetchNotices = async () => {
        setLoading(true);
        const { data, error } = await supabase
            .from('notices')
            .select('*')
            .eq('is_active', true)
            .order('created_at', { ascending: false });

        if (error) Alert.alert('Error', '공지사항을 불러오지 못했습니다.');
        setNotices(data || []);
        setLoading(false);
    };

    const fetchInquiries = async () => {
        setLoading(true);
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            setLoading(false);
            return;
        }

        const { data, error } = await supabase
            .from('inquiries')
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false });

        if (error) Alert.alert('Error', '문의 내역을 불러오지 못했습니다.');
        setInquiries(data || []);
        setLoading(false);
    };

    const toggleExpand = (id: string) => {
        setExpandedId(expandedId === id ? null : id);
    };

    const renderNoticeItem = ({ item }: { item: Notice }) => (
        <TouchableOpacity
            style={styles.card}
            onPress={() => toggleExpand(item.id)}
            activeOpacity={0.8}
        >
            <View style={styles.cardHeader}>
                <View style={{ flex: 1 }}>
                    <Text style={styles.cardTitle}>{item.title}</Text>
                    <Text style={styles.cardDate}>{new Date(item.created_at).toLocaleDateString()}</Text>
                </View>
                <Ionicons name={expandedId === item.id ? "chevron-up" : "chevron-down"} size={20} color="#999" />
            </View>
            {expandedId === item.id && (
                <View style={styles.cardContent}>
                    <Text style={styles.cardBody}>{item.content}</Text>
                </View>
            )}
        </TouchableOpacity>
    );

    const renderInquiryItem = ({ item }: { item: Inquiry }) => (
        <TouchableOpacity
            style={styles.card}
            onPress={() => toggleExpand(item.id)}
            activeOpacity={0.8}
        >
            <View style={styles.cardHeader}>
                <View style={{ flex: 1 }}>
                    <View style={styles.statusRow}>
                        {item.status === 'answered' ? (
                            <View style={[styles.badge, styles.badgeSuccess]}>
                                <Text style={styles.badgeText}>답변완료</Text>
                            </View>
                        ) : (
                            <View style={[styles.badge, styles.badgePending]}>
                                <Text style={styles.badgeText}>답변대기</Text>
                            </View>
                        )}
                        <Text style={styles.cardDate}>{new Date(item.created_at).toLocaleDateString()}</Text>
                    </View>
                    <Text style={styles.cardTitle}>{item.title}</Text>
                </View>
                <Ionicons name={expandedId === item.id ? "chevron-up" : "chevron-down"} size={20} color="#999" />
            </View>
            {expandedId === item.id && (
                <View style={styles.cardContent}>
                    <Text style={styles.cardBody}>{item.content}</Text>
                    {item.answer && (
                        <View style={styles.answerBox}>
                            <Text style={styles.answerTitle}>↪ 답변</Text>
                            <Text style={styles.answerBody}>{item.answer}</Text>
                        </View>
                    )}
                </View>
            )}
        </TouchableOpacity>
    );

    return (
        <View style={styles.container}>
            <Stack.Screen options={{ title: '고객센터' }} />

            {/* Tabs */}
            <View style={styles.tabContainer}>
                <TouchableOpacity
                    style={[styles.tab, activeTab === 'notice' && styles.activeTab]}
                    onPress={() => setActiveTab('notice')}
                >
                    <Text style={[styles.tabText, activeTab === 'notice' && styles.activeTabText]}>공지사항</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.tab, activeTab === 'inquiry' && styles.activeTab]}
                    onPress={() => setActiveTab('inquiry')}
                >
                    <Text style={[styles.tabText, activeTab === 'inquiry' && styles.activeTabText]}>1:1 문의</Text>
                </TouchableOpacity>
            </View>

            {/* List */}
            {loading ? (
                <View style={styles.center}>
                    <ActivityIndicator size="large" color={Colors.primary} />
                </View>
            ) : (
                <>
                    {activeTab === 'notice' ? (
                        <FlatList
                            data={notices}
                            renderItem={renderNoticeItem}
                            keyExtractor={item => item.id}
                            contentContainerStyle={styles.listContent}
                            ListEmptyComponent={
                                <View style={styles.emptyState}>
                                    <Text style={styles.emptyText}>등록된 공지사항이 없습니다.</Text>
                                </View>
                            }
                        />
                    ) : (
                        <FlatList
                            data={inquiries}
                            renderItem={renderInquiryItem}
                            keyExtractor={item => item.id}
                            contentContainerStyle={styles.listContent}
                            ListEmptyComponent={
                                <View style={styles.emptyState}>
                                    <Text style={styles.emptyText}>문의 내역이 없습니다.</Text>
                                    <Text style={styles.emptySubText}>궁금한 점이 있으시면 아래 버튼을 눌러 문의해주세요.</Text>
                                </View>
                            }
                        />
                    )}
                </>
            )}

            {/* FAB for Writing Inquiry */}
            {activeTab === 'inquiry' && (
                <TouchableOpacity
                    style={styles.fab}
                    onPress={() => router.push('/settings/customer-support/write')}
                >
                    <Ionicons name="pencil" size={24} color="white" />
                </TouchableOpacity>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f5f5f5',
    },
    center: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    tabContainer: {
        flexDirection: 'row',
        backgroundColor: 'white',
        borderBottomWidth: 1,
        borderBottomColor: '#eee',
    },
    tab: {
        flex: 1,
        paddingVertical: 14,
        alignItems: 'center',
        borderBottomWidth: 2,
        borderBottomColor: 'transparent',
    },
    activeTab: {
        borderBottomColor: Colors.primary,
    },
    tabText: {
        fontSize: 15,
        color: '#666',
        fontWeight: '500',
    },
    activeTabText: {
        color: Colors.primary,
        fontWeight: 'bold',
    },
    listContent: {
        padding: 16,
    },
    card: {
        backgroundColor: 'white',
        borderRadius: 12,
        marginBottom: 12,
        padding: 16,
        // Shadow
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
        elevation: 2,
    },
    cardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    cardTitle: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#333',
        marginBottom: 4,
    },
    cardDate: {
        fontSize: 12,
        color: '#999',
    },
    cardContent: {
        marginTop: 12,
        paddingTop: 12,
        borderTopWidth: 1,
        borderTopColor: '#f0f0f0',
    },
    cardBody: {
        fontSize: 14,
        color: '#555',
        lineHeight: 20,
    },
    statusRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 6,
        gap: 8,
    },
    badge: {
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 4,
    },
    badgeSuccess: {
        backgroundColor: '#e6f7ed',
    },
    badgePending: {
        backgroundColor: '#fff4e5',
    },
    badgeText: {
        fontSize: 11,
        fontWeight: 'bold',
        color: '#333',
    },
    answerBox: {
        marginTop: 12,
        backgroundColor: '#f9f9fa',
        padding: 12,
        borderRadius: 8,
    },
    answerTitle: {
        fontSize: 13,
        fontWeight: 'bold',
        color: Colors.primary,
        marginBottom: 4,
    },
    answerBody: {
        fontSize: 14,
        color: '#444',
    },
    fab: {
        position: 'absolute',
        bottom: 24,
        right: 24,
        width: 56,
        height: 56,
        borderRadius: 28,
        backgroundColor: Colors.primary,
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.3,
        shadowRadius: 4,
        elevation: 6,
    },
    emptyState: {
        padding: 40,
        alignItems: 'center',
        justifyContent: 'center',
    },
    emptyText: {
        fontSize: 16,
        color: '#666',
        fontWeight: 'bold',
    },
    emptySubText: {
        fontSize: 14,
        color: '#999',
        textAlign: 'center',
        marginTop: 8,
    },
});
