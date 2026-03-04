import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, ActivityIndicator, Share, Modal } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../../constants/Colors';
import { Calendar, CalendarMember, getMyCalendars, getCalendarMembers, createInviteCode, leaveCalendar } from '../../../services/supabase-modules/calendars';

export default function CalendarDetailScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const router = useRouter();
    const [calendar, setCalendar] = useState<Calendar | null>(null);
    const [members, setMembers] = useState<CalendarMember[]>([]);
    const [loading, setLoading] = useState(true);
    const [inviteCode, setInviteCode] = useState<string | null>(null);
    const [generatingCode, setGeneratingCode] = useState(false);
    const [categoryModalVisible, setCategoryModalVisible] = useState(false);
    const [selectedCategories, setSelectedCategories] = useState<string[]>(['ceremony', 'todo', 'schedule']);

    useEffect(() => {
        loadDetails();
    }, [id]);

    const loadDetails = async () => {
        if (!id) return;
        setLoading(true);
        try {
            // 1. Get Calendar Details (from my list to check role)
            const myCalendars = await getMyCalendars();
            const target = myCalendars.find(c => c.id === id);

            if (!target) {
                Alert.alert('오류', '캘린더를 찾을 수 없습니다.');
                router.back();
                return;
            }
            setCalendar(target);

            // 2. Get Members
            const memberList = await getCalendarMembers(id);
            setMembers(memberList);

        } catch (e) {
            console.error(e);
            Alert.alert('오류', '정보를 불러오는데 실패했습니다.');
        } finally {
            setLoading(false);
        }
    };

    const handleInvite = () => {
        // Show category selection modal first
        setCategoryModalVisible(true);
    };

    const handleGenerateInviteWithCategories = async () => {
        if (!id) return;
        setCategoryModalVisible(false);
        setGeneratingCode(true);
        try {
            const code = await createInviteCode(id, { sharedCategories: selectedCategories });
            setInviteCode(code);
        } catch (e) {
            console.error(e);
            Alert.alert('오류', '초대 코드를 생성하지 못했습니다.');
        } finally {
            setGeneratingCode(false);
        }
    };

    const toggleCategory = (category: string) => {
        setSelectedCategories(prev =>
            prev.includes(category)
                ? prev.filter(c => c !== category)
                : [...prev, category]
        );
    };

    const handleShareCode = async () => {
        if (!inviteCode) return;

        const message =
            `[하루클릭] 캘린더에 초대되었습니다.\n\n` +
            `초대 코드: ${inviteCode}\n\n` +
            `앱 설치 후 함께 일정 관리해요!\n` +
            `Android: https://play.google.com/store/apps/details?id=com.minsim.haruclick\n` +
            `iOS: https://apps.apple.com/app/id123456789`; // TODO: 실제 iOS ID로 변경 필요

        try {
            await Share.share({ message });
        } catch (error) {
            console.error(error);
        }
    };

    const handleLeave = () => {
        Alert.alert(
            '캘린더 나가기',
            '정말 이 캘린더에서 나가시겠습니까?',
            [
                { text: '취소', style: 'cancel' },
                {
                    text: '나가기',
                    style: 'destructive',
                    onPress: async () => {
                        if (!id) return;
                        const success = await leaveCalendar(id);
                        if (success) {
                            router.back();
                        }
                    }
                }
            ]
        );
    };

    if (loading) {
        return (
            <View style={styles.center}>
                <ActivityIndicator size="large" color={Colors.primary} />
            </View>
        );
    }

    if (!calendar) return null;

    return (
        <View style={styles.container}>
            <Stack.Screen
                options={{
                    title: calendar.name,
                    headerStyle: { backgroundColor: Colors.white },
                    headerShadowVisible: false,
                    headerTintColor: Colors.navy,
                    headerRight: () => (
                        !calendar.is_personal && (
                            <TouchableOpacity
                                testID="calendar-detail-open-chat-button"
                                onPress={() => router.push(`/calendar/chat/${calendar.id}`)}
                                style={{ marginRight: 16 }}
                            >
                                <Ionicons name="chatbubbles-outline" size={24} color={Colors.navy} />
                            </TouchableOpacity>
                        )
                    )
                }}
            />

            <ScrollView contentContainerStyle={styles.content}>

                {/* Header Card */}
                <View style={styles.headerCard}>
                    <View style={[styles.colorDotBig, { backgroundColor: calendar.color }]} />
                    <View>
                        <Text style={styles.calendarName}>{calendar.name}</Text>
                        <Text style={styles.roleText}>
                            내 권한: {calendar.role === 'owner' ? '소유자' : calendar.role === 'editor' ? '편집자' : '뷰어'}
                        </Text>
                    </View>
                </View>

                {/* Invite Section */}
                {calendar.role === 'owner' && (
                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>멤버 초대</Text>
                        <View style={styles.inviteContainer}>
                            {inviteCode ? (
                                <View style={styles.codeBox}>
                                    <Text testID="calendar-invite-code-text" style={styles.codeText}>{inviteCode}</Text>
                                    <TouchableOpacity testID="calendar-invite-share-button" onPress={handleShareCode} style={styles.shareButton}>
                                        <Ionicons name="share-outline" size={20} color={Colors.white} />
                                        <Text style={styles.shareText}>공유</Text>
                                    </TouchableOpacity>
                                </View>
                            ) : (
                                <TouchableOpacity
                                    testID="calendar-generate-invite-button"
                                    style={styles.generateButton}
                                    onPress={handleInvite}
                                    disabled={generatingCode}
                                >
                                    {generatingCode ? (
                                        <ActivityIndicator color={Colors.primary} />
                                    ) : (
                                        <>
                                            <Ionicons name="person-add-outline" size={20} color={Colors.primary} style={{ marginRight: 8 }} />
                                            <Text style={styles.generateText}>초대 코드 생성하기</Text>
                                        </>
                                    )}
                                </TouchableOpacity>
                            )}
                            <Text style={styles.helperText}>
                                생성된 코드는 24시간 동안 유효합니다.
                            </Text>
                        </View>
                    </View>
                )}

                {/* Members List */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>멤버 ({members.length})</Text>
                    {members.map((member, index) => (
                        <View key={member.id || index} style={styles.memberItem}>
                            <View style={styles.memberAvatar}>
                                <Ionicons name="person" size={20} color={Colors.subText} />
                            </View>
                            <View style={styles.memberInfo}>
                                <Text style={styles.memberId}>User {member.user_id.substring(0, 8)}...</Text>
                                <Text style={styles.memberRole}>{member.role}</Text>
                            </View>
                        </View>
                    ))}
                </View>

                {/* Actions */}
                <View style={styles.section}>
                    {!calendar.is_personal && calendar.role !== 'owner' && (
                        <TouchableOpacity style={styles.leaveButton} onPress={handleLeave}>
                            <Text style={styles.leaveText}>캘린더 나가기</Text>
                        </TouchableOpacity>
                    )}
                    {calendar.is_personal && (
                        <Text style={styles.infoText}>개인 캘린더는 나갈 수 없습니다.</Text>
                    )}
                </View>

            </ScrollView>

            {/* Category Selection Modal */}
            <Modal
                visible={categoryModalVisible}
                transparent
                animationType="slide"
                onRequestClose={() => setCategoryModalVisible(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <Text style={styles.modalTitle}>공유할 항목 선택</Text>
                        <Text style={styles.modalSubtitle}>
                            초대한 멤버가 볼 수 있는 항목을 선택하세요
                        </Text>

                        <View style={styles.optionsList}>
                            {[
                                { id: 'schedule', label: '📅 일정', enabled: true },
                                { id: 'todo', label: '✅ 할일', enabled: true },
                                { id: 'ceremony', label: '🎊 경조사', enabled: true },
                                { id: 'expense', label: '💰 가계부', enabled: true },
                            ].map(option => (
                                <TouchableOpacity
                                    key={option.id}
                                    disabled={!option.enabled}
                                    onPress={() => toggleCategory(option.id)}
                                    style={[
                                        styles.optionRow,
                                        !option.enabled && styles.optionDisabled
                                    ]}
                                >
                                    <View style={[
                                        styles.checkbox,
                                        selectedCategories.includes(option.id) && styles.checkboxChecked,
                                        !option.enabled && styles.checkboxDisabled
                                    ]}>
                                        {selectedCategories.includes(option.id) && option.enabled && (
                                            <Ionicons name="checkmark" size={16} color={Colors.white} />
                                        )}
                                    </View>
                                    <Text style={[
                                        styles.optionLabel,
                                        !option.enabled && styles.optionLabelDisabled
                                    ]}>
                                        {option.label}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>

                        <View style={styles.modalButtons}>
                            <TouchableOpacity
                                testID="calendar-invite-modal-cancel-button"
                                style={[styles.modalButton, styles.cancelButton]}
                                onPress={() => setCategoryModalVisible(false)}
                            >
                                <Text style={styles.cancelButtonText}>취소</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                testID="calendar-invite-modal-confirm-button"
                                style={[styles.modalButton, styles.confirmButton]}
                                onPress={handleGenerateInviteWithCategories}
                                disabled={selectedCategories.length === 0}
                            >
                                <Text style={styles.confirmButtonText}>초대 코드 생성</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.background,
    },
    center: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    content: {
        padding: 20,
    },
    headerCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: Colors.white,
        padding: 20,
        borderRadius: 16,
        marginBottom: 24,
        shadowColor: Colors.shadow,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
        elevation: 2,
    },
    colorDotBig: {
        width: 40,
        height: 40,
        borderRadius: 20,
        marginRight: 16,
    },
    calendarName: {
        fontSize: 20,
        fontWeight: 'bold',
        color: Colors.text,
        marginBottom: 4,
    },
    roleText: {
        fontSize: 14,
        color: Colors.subText,
    },
    section: {
        marginBottom: 32,
    },
    sectionTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: Colors.text,
        marginBottom: 12,
        marginLeft: 4,
    },
    inviteContainer: {
        backgroundColor: Colors.white,
        padding: 16,
        borderRadius: 16,
    },
    generateButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 12,
        backgroundColor: '#F1F5F9',
        borderRadius: 12,
        marginBottom: 8,
    },
    generateText: {
        color: Colors.primary,
        fontWeight: '600',
    },
    codeBox: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: '#F0FDF4',
        padding: 12,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#DCFCE7',
        marginBottom: 8,
    },
    codeText: {
        fontSize: 24,
        fontWeight: 'bold',
        color: Colors.green,
        letterSpacing: 2,
    },
    shareButton: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: Colors.green,
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 8,
    },
    shareText: {
        color: Colors.white,
        fontWeight: '600',
        marginLeft: 4,
        fontSize: 12,
    },
    helperText: {
        fontSize: 12,
        color: Colors.subText,
        textAlign: 'center',
    },
    memberItem: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: Colors.white,
        padding: 12,
        borderRadius: 12,
        marginBottom: 8,
    },
    memberAvatar: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#F1F5F9',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    memberInfo: {
        justifyContent: 'center',
    },
    memberId: {
        fontSize: 14,
        color: Colors.text,
        fontWeight: '500',
    },
    memberRole: {
        fontSize: 12,
        color: Colors.subText,
    },
    leaveButton: {
        backgroundColor: '#FEE2E2',
        padding: 16,
        borderRadius: 16,
        alignItems: 'center',
    },
    leaveText: {
        color: Colors.red,
        fontWeight: 'bold',
        fontSize: 16,
    },
    infoText: {
        textAlign: 'center',
        color: Colors.subText,
        marginTop: 10,
    },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.5)', justifyContent: 'flex-end' },
    modalContent: { backgroundColor: Colors.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, maxHeight: '80%' },
    modalTitle: { fontSize: 20, fontWeight: 'bold', color: Colors.text, marginBottom: 8 },
    modalSubtitle: { fontSize: 14, color: Colors.lightGray, marginBottom: 24 },
    optionsList: { gap: 12 },
    optionRow: { flexDirection: 'row', alignItems: 'center', padding: 16, backgroundColor: Colors.background, borderRadius: 12 },
    optionDisabled: { opacity: 0.5 },
    checkbox: { width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: Colors.border, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
    checkboxChecked: { backgroundColor: Colors.primary, borderColor: Colors.primary },
    checkboxDisabled: { backgroundColor: Colors.lightGray, borderColor: Colors.lightGray },
    optionLabel: { fontSize: 16, color: Colors.text, flex: 1 },
    optionLabelDisabled: { color: Colors.lightGray },
    hint: { fontSize: 12, color: Colors.lightGray, fontStyle: 'italic' },
    modalButtons: { flexDirection: 'row', gap: 12, marginTop: 24 },
    modalButton: { flex: 1, padding: 16, borderRadius: 12, alignItems: 'center' },
    cancelButton: { backgroundColor: Colors.background },
    confirmButton: { backgroundColor: Colors.primary },
    cancelButtonText: { color: Colors.text, fontSize: 16, fontWeight: '600' },
    confirmButtonText: { color: Colors.white, fontSize: 16, fontWeight: '600' },
});
