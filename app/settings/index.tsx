import { View, Text, StyleSheet, TouchableOpacity, Alert, ScrollView, Switch } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../../services/supabase';
import { Colors } from '../../constants/Colors';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../../contexts/ThemeContext';
import { FeedbackModal } from '../../components/FeedbackModal';

const CALENDAR_SYNC_KEY = 'externalCalendarSync';

export default function SettingsScreen() {
    const router = useRouter();
    const { isDark, setTheme, colors } = useTheme();
    const [userEmail, setUserEmail] = useState<string | null>(null);
    const [userName, setUserName] = useState<string | null>(null);
    const [joinedDays, setJoinedDays] = useState<number>(0);
    const [totalScans, setTotalScans] = useState<number>(0);
    const [calendarSync, setCalendarSync] = useState(true);
    const [feedbackVisible, setFeedbackVisible] = useState(false);

    useEffect(() => {
        supabase.auth.getUser().then(({ data: { user } }) => {
            if (user) {
                setUserEmail(user.email || '이메일 없음');
                // 이메일에서 닉네임 추출 (@ 앞부분)
                const emailName = user.email?.split('@')[0] || '사용자';
                setUserName(emailName);

                // 가입일 계산
                if (user.created_at) {
                    const createdDate = new Date(user.created_at);
                    const today = new Date();
                    const diffTime = Math.abs(today.getTime() - createdDate.getTime());
                    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                    setJoinedDays(diffDays);
                }
            }
        });

        // 총 스캔 횟수 가져오기 (events 테이블에서 조회)
        const fetchScanCount = async () => {
            try {
                const { data: { user } } = await supabase.auth.getUser();
                if (user) {
                    const { count } = await supabase
                        .from('events')
                        .select('*', { count: 'exact', head: true })
                        .eq('user_id', user.id);
                    setTotalScans(count || 0);
                }
            } catch (e) {
                console.log('Failed to fetch scan count:', e);
            }
        };
        fetchScanCount();

        // 캘린더 연동 설정 불러오기
        AsyncStorage.getItem(CALENDAR_SYNC_KEY).then((value) => {
            if (value !== null) {
                setCalendarSync(value === 'true');
            }
        });
    }, []);

    const handleCalendarSyncToggle = async (value: boolean) => {
        setCalendarSync(value);
        await AsyncStorage.setItem(CALENDAR_SYNC_KEY, value.toString());
    };

    const handleThemeToggle = (value: boolean) => {
        setTheme(value ? 'dark' : 'light');
    };

    const handleLogout = async () => {
        Alert.alert('로그아웃', '정말 로그아웃 하시겠습니까?', [
            { text: '취소', style: 'cancel' },
            {
                text: '로그아웃',
                style: 'destructive',
                onPress: async () => {
                    const { error } = await supabase.auth.signOut();
                    if (error) {
                        Alert.alert('오류', '로그아웃 실패');
                    }
                    // _layout.tsx의 auth listener가 자동으로 로그인 화면으로 이동시킴
                }
            }
        ]);
    };

    const SettingItem = ({ icon, label, onPress, isDestructive = false }: any) => (
        <TouchableOpacity style={styles.item} onPress={onPress} accessibilityLabel={label}>
            <View style={styles.itemLeft}>
                <View style={[styles.iconBox, isDestructive && styles.destructiveIconBox, { backgroundColor: isDestructive ? '#FFF0F0' : (isDark ? colors.border : '#F0F2F5') }]}>
                    <Ionicons name={icon} size={20} color={isDestructive ? '#FF3B30' : colors.text} />
                </View>
                <Text style={[styles.itemLabel, isDestructive && styles.destructiveLabel, { color: isDestructive ? '#FF3B30' : colors.text }]}>{label}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.subText} />
        </TouchableOpacity>
    );

    const SettingToggle = ({ icon, label, value, onToggle }: any) => (
        <View style={styles.item}>
            <View style={styles.itemLeft}>
                <View style={[styles.iconBox, { backgroundColor: isDark ? colors.border : '#F0F2F5' }]}>
                    <Ionicons name={icon} size={20} color={colors.text} />
                </View>
                <Text style={[styles.itemLabel, { color: colors.text }]}>{label}</Text>
            </View>
            <Switch
                value={value}
                onValueChange={onToggle}
                trackColor={{ false: '#E5E5EA', true: Colors.navy }}
                thumbColor="#fff"
                accessibilityLabel={label}
            />
        </View>
    );

    return (
        <ScrollView style={[styles.container, { backgroundColor: colors.background }]}>
            <View style={[styles.header, { backgroundColor: colors.card }]}>
                <View style={styles.profileBox}>
                    <View style={[styles.avatar, { backgroundColor: Colors.navy }]}>
                        <Ionicons name="person" size={40} color={Colors.white} />
                    </View>
                    <View style={{ flex: 1 }}>
                        <Text style={[styles.userName, { color: colors.text }]}>{userName || '사용자'}님</Text>
                        <Text style={[styles.userEmail, { color: colors.subText }]}>{userEmail || '로그인 정보 없음'}</Text>
                    </View>
                </View>

                {/* 프로필 통계 */}
                <View style={styles.profileStats}>
                    <View style={styles.profileStatItem}>
                        <Ionicons name="calendar-outline" size={18} color={Colors.orange} />
                        <Text style={[styles.profileStatText, { color: colors.subText }]}>
                            가입 {joinedDays}일째
                        </Text>
                    </View>
                    <View style={styles.profileStatDivider} />
                    <View style={styles.profileStatItem}>
                        <Ionicons name="scan-outline" size={18} color={Colors.orange} />
                        <Text style={[styles.profileStatText, { color: colors.subText }]}>
                            총 스캔 {totalScans}건
                        </Text>
                    </View>
                </View>
            </View>

            <View style={[styles.section, { backgroundColor: colors.card }]}>
                <Text style={[styles.sectionTitle, { color: colors.subText }]}>캘린더 설정</Text>
                <SettingItem
                    icon="calendar-outline"
                    label="외부 캘린더 연동"
                    onPress={() => router.push('/settings/calendar-sync')}
                />
            </View>

            <View style={[styles.section, { backgroundColor: colors.card }]}>
                <Text style={[styles.sectionTitle, { color: colors.subText }]}>화면 스타일</Text>
                <SettingToggle
                    icon="moon-outline"
                    label="다크 모드"
                    value={isDark}
                    onToggle={handleThemeToggle}
                />
            </View>

            <View style={[styles.section, { backgroundColor: colors.card }]}>
                <Text style={[styles.sectionTitle, { color: colors.subText }]}>내 자산</Text>
                <SettingItem
                    icon="gift-outline"
                    label="기프티콘 보관함"
                    onPress={() => router.push('/gifticon')}
                />
            </View>

            <View style={[styles.section, { backgroundColor: colors.card }]}>
                <Text style={[styles.sectionTitle, { color: colors.subText }]}>계정 설정</Text>
                <SettingItem
                    icon="person-outline"
                    label="프로필 수정"
                    onPress={() => router.push('/settings/profile')}
                />
                <SettingItem
                    icon="notifications-outline"
                    label="알림 설정"
                    onPress={() => router.push('/settings/notifications')}
                />
                <SettingItem
                    icon="headset-outline"
                    label="고객센터 (공지/문의)"
                    onPress={() => router.push('/settings/customer-support')}
                />
                <SettingItem
                    icon="chatbox-ellipses-outline"
                    label="의견 보내기"
                    onPress={() => setFeedbackVisible(true)}
                />
            </View>

            <View style={[styles.section, { backgroundColor: colors.card }]}>
                <Text style={[styles.sectionTitle, { color: colors.subText }]}>앱 정보</Text>
                <SettingItem
                    icon="document-text-outline"
                    label="이용약관"
                    onPress={() => router.push('/settings/terms')}
                />
                <SettingItem
                    icon="shield-checkmark-outline"
                    label="개인정보 처리방침"
                    onPress={() => router.push('/settings/privacy')}
                />
                <SettingItem
                    icon="information-circle-outline"
                    label="버전 정보 1.0.0"
                    onPress={() => Alert.alert('하루클릭', '버전 1.0.0\n\n당신의 하루를 클릭 한 번으로 정리해요 ✨')}
                />
            </View>

            <View style={[styles.section, { backgroundColor: colors.card }]}>
                <SettingItem
                    icon="log-out-outline"
                    label="로그아웃"
                    onPress={handleLogout}
                    isDestructive
                />
            </View>

            <FeedbackModal
                visible={feedbackVisible}
                onClose={() => setFeedbackVisible(false)}
            />
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    header: {
        padding: 24,
        marginBottom: 8,
    },
    profileBox: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 16,
    },
    avatar: {
        width: 64,
        height: 64,
        borderRadius: 32,
        justifyContent: 'center',
        alignItems: 'center',
    },
    userName: {
        fontFamily: 'Pretendard-Bold',
        fontSize: 18,
        marginBottom: 4,
    },
    userEmail: {
        fontFamily: 'Pretendard-Medium',
        fontSize: 14,
    },
    section: {
        marginBottom: 8,
        paddingVertical: 8,
    },
    sectionTitle: {
        fontFamily: 'Pretendard-Bold',
        fontSize: 14,
        marginLeft: 20,
        marginTop: 12,
        marginBottom: 8,
    },
    item: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 16,
        paddingHorizontal: 20,
    },
    itemLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    iconBox: {
        width: 32,
        height: 32,
        borderRadius: 8,
        justifyContent: 'center',
        alignItems: 'center',
    },
    destructiveIconBox: {
        // dynamic handling in component
    },
    itemLabel: {
        fontFamily: 'Pretendard-Medium',
        fontSize: 16,
    },
    destructiveLabel: {
        color: '#FF3B30',
    },
    toggleDescription: {
        fontSize: 12,
        paddingHorizontal: 20,
        paddingBottom: 12,
    },
    profileStats: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        marginTop: 16,
        paddingTop: 16,
        borderTopWidth: 1,
        borderTopColor: 'rgba(0,0,0,0.05)',
    },
    profileStatItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 16,
    },
    profileStatText: {
        fontFamily: 'Pretendard-Medium',
        fontSize: 13,
    },
    profileStatDivider: {
        width: 1,
        height: 16,
        backgroundColor: 'rgba(0,0,0,0.1)',
    },
});
