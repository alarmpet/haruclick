import { View, Text, StyleSheet, FlatList, TouchableOpacity, Image, ActivityIndicator, Alert } from 'react-native';
import { useState, useCallback } from 'react';
import { Stack, useRouter, useFocusEffect } from 'expo-router';
import { Colors } from '../../constants/Colors';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Card } from '../../components/Card';
import * as ImagePicker from 'expo-image-picker';
import { getGifticons, GifticonItem } from '../../services/supabase';
import { scheduleGifticonAlerts } from '../../services/notification';

export default function GifticonInboxScreen() {
    const router = useRouter();
    const [activeTab, setActiveTab] = useState<'available' | 'used'>('available');
    const [gifticons, setGifticons] = useState<GifticonItem[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchData = async () => {
        try {
            setLoading(true);
            const data = await getGifticons(activeTab);
            setGifticons(data);

            // 사용 가능한 기프티콘에 대해 만료 알림 스케줄링
            if (activeTab === 'available' && data.length > 0) {
                scheduleGifticonAlerts(data);
            }
        } catch (error) {
            console.error('Error fetching gifticons:', error);
            Alert.alert('오류', '데이터를 불러오는 중 오류가 발생했습니다.');
        } finally {
            setLoading(false);
        }
    };

    useFocusEffect(
        useCallback(() => {
            fetchData();
        }, [activeTab])
    );

    const getDaysLeft = (expiryDate: string) => {
        if (!expiryDate) return '';
        const today = new Date();
        const expiry = new Date(expiryDate.replace(/\./g, '-'));
        const diffTime = expiry.getTime() - today.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays < 0) return '만료됨';
        if (diffDays === 0) return 'D-Day';
        return `D-${diffDays}`;
    };

    const handleUpload = async () => {
        // Request permissions
        const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();

        if (permissionResult.granted === false) {
            Alert.alert("권한 필요", "사진 접근 권한이 필요합니다.");
            return;
        }

        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: true,
            quality: 1,
        });

        if (!result.canceled) {
            router.push({
                pathname: '/gifticon/analyze',
                params: { imageUri: result.assets[0].uri }
            });
        }
    };

    const renderItem = ({ item }: { item: GifticonItem }) => {
        const dDay = getDaysLeft(item.expiryDate);
        const isUrgent = dDay === 'D-Day' || (dDay.startsWith('D-') && parseInt(dDay.replace('D-', ''), 10) <= 7);

        return (
            <Card style={styles.card}>
                <View style={styles.cardRow}>
                    {/* Image or Placeholder */}
                    {item.imageUrl ? (
                        <Image source={{ uri: item.imageUrl }} style={styles.gifticonImage} resizeMode="cover" />
                    ) : (
                        <View style={styles.imagePlaceholder}>
                            <Ionicons name="gift-outline" size={24} color={Colors.subText} />
                        </View>
                    )}

                    <View style={styles.cardContent}>
                        <View style={styles.headerRow}>
                            <Text style={styles.productName} numberOfLines={1}>{item.productName}</Text>
                            <View style={[styles.dDayBadge, isUrgent && styles.dDayUrgent]}>
                                <Text style={[styles.dDayText, isUrgent && styles.dDayTextUrgent]}>{dDay}</Text>
                            </View>
                        </View>
                        <Text style={styles.sender}>From. {item.sender}</Text>
                        <Text style={styles.expiryDate}>유효기간 {item.expiryDate}까지</Text>
                    </View>
                </View>
            </Card>
        );
    };

    return (
        <View style={styles.container}>
            <Stack.Screen options={{
                title: '기프티콘 보관함',
                headerStyle: { backgroundColor: Colors.navy },
                headerTintColor: Colors.white,
                headerShadowVisible: false,
            }} />

            {/* Tabs */}
            <View style={styles.tabContainer}>
                <TouchableOpacity
                    style={[styles.tab, activeTab === 'available' && styles.activeTab]}
                    onPress={() => setActiveTab('available')}
                >
                    <Text style={[styles.tabText, activeTab === 'available' && styles.activeTabText]}>사용 가능</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.tab, activeTab === 'used' && styles.activeTab]}
                    onPress={() => setActiveTab('used')}
                >
                    <Text style={[styles.tabText, activeTab === 'used' && styles.activeTabText]}>사용 완료</Text>
                </TouchableOpacity>
            </View>

            {/* List */}
            {loading ? (
                <View style={styles.centerContainer}>
                    <ActivityIndicator size="large" color={Colors.navy} />
                </View>
            ) : (
                <FlatList
                    data={gifticons}
                    renderItem={renderItem}
                    keyExtractor={item => item.id}
                    contentContainerStyle={styles.listContent}
                    ListEmptyComponent={
                        <View style={styles.emptyContainer}>
                            <Text style={styles.emptyText}>
                                {activeTab === 'available' ? '사용 가능한 기프티콘이 없습니다.' : '사용 완료한 기프티콘이 없습니다.'}
                            </Text>
                        </View>
                    }
                />
            )}

            {/* FAB */}
            <TouchableOpacity
                style={styles.fab}
                activeOpacity={0.8}
                onPress={handleUpload}
            >
                <Ionicons name="add" size={32} color="white" />
            </TouchableOpacity>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.background,
    },
    centerContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    tabContainer: {
        flexDirection: 'row',
        backgroundColor: Colors.white,
    },
    tab: {
        flex: 1,
        paddingVertical: 14,
        alignItems: 'center',
        borderBottomWidth: 2,
        borderBottomColor: 'transparent',
    },
    activeTab: {
        borderBottomColor: Colors.navy,
    },
    tabText: {
        fontFamily: 'Pretendard-Medium',
        fontSize: 16,
        color: Colors.subText,
    },
    activeTabText: {
        fontFamily: 'Pretendard-Bold',
        color: Colors.navy,
    },
    listContent: {
        padding: 20,
        paddingBottom: 100, // FAB space
    },
    card: {
        padding: 16,
        marginBottom: 16,
        borderRadius: 16,
    },
    cardRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 16,
    },
    imagePlaceholder: {
        width: 60,
        height: 60,
        borderRadius: 12,
        backgroundColor: '#F2F4F6',
        justifyContent: 'center',
        alignItems: 'center',
    },
    gifticonImage: {
        width: 60,
        height: 60,
        borderRadius: 12,
        backgroundColor: '#F2F4F6',
    },
    cardContent: {
        flex: 1,
    },
    headerRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 4,
    },
    productName: {
        fontFamily: 'Pretendard-Bold',
        fontSize: 16,
        color: Colors.text,
        flex: 1,
        marginRight: 8,
    },
    sender: {
        fontFamily: 'Pretendard-Medium',
        fontSize: 14,
        color: Colors.subText,
        marginBottom: 4,
    },
    expiryDate: {
        fontFamily: 'Pretendard-Medium',
        fontSize: 12,
        color: '#BDC5CC',
    },
    dDayBadge: {
        backgroundColor: '#F2F4F6',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 8,
    },
    dDayUrgent: {
        backgroundColor: '#FFF0F0',
    },
    dDayText: {
        fontFamily: 'Pretendard-Bold',
        fontSize: 12,
        color: Colors.subText,
    },
    dDayTextUrgent: {
        color: '#FF4B4B',
    },
    emptyContainer: {
        alignItems: 'center',
        marginTop: 40,
    },
    emptyText: {
        fontFamily: 'Pretendard-Medium',
        color: Colors.subText,
    },
    fab: {
        position: 'absolute',
        bottom: 24,
        right: 24,
        width: 56,
        height: 56,
        borderRadius: 28,
        backgroundColor: Colors.orange,
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: Colors.orange,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 6,
    },
});
