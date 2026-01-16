import { View, Text, StyleSheet, Switch, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { useState, useEffect } from 'react';
import { useRouter } from 'expo-router';
import { Colors } from '../../constants/Colors';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';

const NOTIFICATION_SETTINGS_KEY = '@haruclick_notification_settings';

interface NotificationSettings {
    eventReminder: boolean;
    gifticonExpiry: boolean;
    reciprocity: boolean;
    communityPoll: boolean;
    marketing: boolean;
}

const defaultSettings: NotificationSettings = {
    eventReminder: true,
    gifticonExpiry: true,
    reciprocity: true,
    communityPoll: false,
    marketing: false,
};

export default function NotificationSettingsScreen() {
    const router = useRouter();
    const [settings, setSettings] = useState<NotificationSettings>(defaultSettings);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadSettings();
    }, []);

    const loadSettings = async () => {
        try {
            const saved = await AsyncStorage.getItem(NOTIFICATION_SETTINGS_KEY);
            if (saved) {
                setSettings(JSON.parse(saved));
            }
        } catch (error) {
            console.error('Failed to load notification settings:', error);
        } finally {
            setLoading(false);
        }
    };

    const saveSettings = async (newSettings: NotificationSettings) => {
        try {
            await AsyncStorage.setItem(NOTIFICATION_SETTINGS_KEY, JSON.stringify(newSettings));
            setSettings(newSettings);
        } catch (error) {
            Alert.alert('오류', '설정 저장에 실패했습니다.');
        }
    };

    const toggleSetting = (key: keyof NotificationSettings) => {
        const newSettings = { ...settings, [key]: !settings[key] };
        saveSettings(newSettings);
    };

    const SettingRow = ({
        icon,
        title,
        description,
        value,
        onToggle
    }: {
        icon: string;
        title: string;
        description: string;
        value: boolean;
        onToggle: () => void;
    }) => (
        <View style={styles.row}>
            <View style={styles.rowLeft}>
                <View style={styles.iconBox}>
                    <Ionicons name={icon as any} size={20} color={Colors.navy} />
                </View>
                <View style={styles.rowText}>
                    <Text style={styles.rowTitle}>{title}</Text>
                    <Text style={styles.rowDescription}>{description}</Text>
                </View>
            </View>
            <Switch
                value={value}
                onValueChange={onToggle}
                trackColor={{ false: '#E0E0E0', true: Colors.navy }}
                thumbColor={Colors.white}
            />
        </View>
    );

    if (loading) {
        return (
            <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
                <Text>로딩 중...</Text>
            </View>
        );
    }

    return (
        <ScrollView style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                    <Ionicons name="arrow-back" size={24} color={Colors.text} />
                </TouchableOpacity>
                <Text style={styles.title}>알림 설정</Text>
                <View style={{ width: 40 }} />
            </View>

            <View style={styles.section}>
                <Text style={styles.sectionTitle}>경조사 알림</Text>
                <SettingRow
                    icon="calendar-outline"
                    title="일정 리마인더"
                    description="경조사 1일 전, 당일 알림"
                    value={settings.eventReminder}
                    onToggle={() => toggleSetting('eventReminder')}
                />
                <SettingRow
                    icon="heart-outline"
                    title="보답 알림"
                    description="축의금 받은 분의 경조사 알림"
                    value={settings.reciprocity}
                    onToggle={() => toggleSetting('reciprocity')}
                />
            </View>

            <View style={styles.section}>
                <Text style={styles.sectionTitle}>기프티콘 알림</Text>
                <SettingRow
                    icon="gift-outline"
                    title="유효기간 임박 알림"
                    description="만료 7일 전, 3일 전, 1일 전 알림"
                    value={settings.gifticonExpiry}
                    onToggle={() => toggleSetting('gifticonExpiry')}
                />
            </View>

            <View style={styles.section}>
                <Text style={styles.sectionTitle}>커뮤니티 알림</Text>
                <SettingRow
                    icon="chatbubbles-outline"
                    title="하루 광장 알림"
                    description="내 투표 결과, 인기 투표 알림"
                    value={settings.communityPoll}
                    onToggle={() => toggleSetting('communityPoll')}
                />
            </View>

            <View style={styles.section}>
                <Text style={styles.sectionTitle}>마케팅 알림</Text>
                <SettingRow
                    icon="megaphone-outline"
                    title="이벤트/프로모션"
                    description="할인, 이벤트 소식 알림"
                    value={settings.marketing}
                    onToggle={() => toggleSetting('marketing')}
                />
            </View>

            <View style={styles.footer}>
                <Text style={styles.footerText}>
                    알림 설정은 기기에 저장되며, 앱을 삭제하면 초기화됩니다.
                </Text>
            </View>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#F5F6F8',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingTop: 60,
        paddingBottom: 20,
        backgroundColor: Colors.white,
    },
    backButton: {
        width: 40,
        height: 40,
        justifyContent: 'center',
        alignItems: 'center',
    },
    title: {
        fontSize: 18,
        fontFamily: 'Pretendard-Bold',
        color: Colors.text,
    },
    section: {
        backgroundColor: Colors.white,
        marginTop: 12,
        paddingVertical: 8,
    },
    sectionTitle: {
        fontSize: 14,
        fontFamily: 'Pretendard-Bold',
        color: Colors.subText,
        marginLeft: 20,
        marginTop: 12,
        marginBottom: 8,
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 16,
        paddingHorizontal: 20,
    },
    rowLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
        marginRight: 12,
    },
    iconBox: {
        width: 36,
        height: 36,
        borderRadius: 10,
        backgroundColor: '#F0F2F5',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    rowText: {
        flex: 1,
    },
    rowTitle: {
        fontSize: 16,
        fontFamily: 'Pretendard-Medium',
        color: Colors.text,
        marginBottom: 4,
    },
    rowDescription: {
        fontSize: 13,
        fontFamily: 'Pretendard-Regular',
        color: Colors.subText,
    },
    footer: {
        padding: 20,
        alignItems: 'center',
    },
    footerText: {
        fontSize: 12,
        fontFamily: 'Pretendard-Regular',
        color: Colors.subText,
        textAlign: 'center',
    },
});
