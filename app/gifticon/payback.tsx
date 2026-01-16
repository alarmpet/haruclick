import { View, Text, StyleSheet, Image, TouchableOpacity, ScrollView, Linking } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { Colors } from '../../constants/Colors';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Card } from '../../components/Card';

// Mock Data for Demo
const MOCK_RECEIVED = {
    sender: '김철수',
    item: '스타벅스 부드러운 디저트 세트',
    amount: 20000,
    date: '2025.08.10'
};

const RECOMMENDATIONS = [
    {
        id: '1',
        name: '교촌 허니콤보 웨지감자 세트',
        price: 23000,
        reason: '받으신 금액과 가장 비슷해요!',
        image: 'chicken'
    },
    {
        id: '2',
        name: '설빙 애플망고치즈설빙',
        price: 19500,
        reason: '비슷한 가격대의 디저트예요.',
        image: 'dessert'
    },
    {
        id: '3',
        name: '록시땅 시어 버터 핸드크림',
        price: 32000,
        reason: '조금 더 신경 쓴 느낌을 주고 싶다면?',
        image: 'handcream'
    }
];

export default function PaybackScreen() {
    const params = useLocalSearchParams();
    // In real app, use params to fetch specific debt info

    // Using Mock Data
    const received = MOCK_RECEIVED;

    const handleGiftLink = (item: any) => {
        // KakaoTalk Gift Link (Generic for demo or specific if execution is possible)
        // Linking.openURL('kakaotalk://gift/home'); 
        // For web demo purpose, opens web store
        Linking.openURL('https://gift.kakao.com/home');
    };

    return (
        <View style={styles.container}>
            <Stack.Screen options={{
                title: '보답하기',
                headerStyle: { backgroundColor: Colors.navy },
                headerTintColor: Colors.white,
                headerShadowVisible: false,
            }} />

            <ScrollView contentContainerStyle={styles.content}>

                {/* Context Header */}
                <View style={styles.headerSection}>
                    <Text style={styles.headerTitle}>{received.sender}님에게 받은 마음</Text>
                    <View style={styles.receivedCard}>
                        <View style={styles.iconCircle}>
                            <Ionicons name="gift" size={24} color={Colors.orange} />
                        </View>
                        <View>
                            <Text style={styles.receivedItem}>{received.item}</Text>
                            <Text style={styles.receivedAmount}>{received.amount.toLocaleString()}원 상당</Text>
                            <Text style={styles.receivedDate}>{received.date} 받음</Text>
                        </View>
                    </View>
                    <Text style={styles.helperText}>
                        곧 {received.sender}님의 경조사가 다가옵니다.{'\n'}
                        이런 선물로 마음을 표현해보는 건 어떨까요?
                    </Text>
                </View>

                {/* Recommendations */}
                <Text style={styles.sectionTitle}>하루클릭 AI 추천</Text>

                <View style={styles.listContainer}>
                    {RECOMMENDATIONS.map((item, index) => (
                        <Card key={item.id} style={styles.recommendCard}>
                            <View style={styles.badgeContainer}>
                                <Text style={styles.badgeText}>추천 {index + 1}</Text>
                            </View>

                            <View style={styles.cardBody}>
                                <View style={styles.itemPlaceholder}>
                                    <Ionicons name={item.image === 'chicken' ? 'fast-food' : item.image === 'dessert' ? 'ice-cream' : 'rose'} size={32} color={Colors.subText} />
                                </View>
                                <View style={styles.itemInfo}>
                                    <Text style={styles.itemReason}>{item.reason}</Text>
                                    <Text style={styles.itemName}>{item.name}</Text>
                                    <Text style={styles.itemPrice}>{item.price.toLocaleString()}원</Text>
                                </View>
                            </View>

                            <TouchableOpacity
                                style={styles.actionButton}
                                onPress={() => handleGiftLink(item)}
                            >
                                <Ionicons name="chatbubble" size={16} color="#381E1F" />
                                <Text style={styles.actionButtonText}>카카오톡 선물하기</Text>
                            </TouchableOpacity>
                        </Card>
                    ))}
                </View>
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.background,
    },
    content: {
        padding: 24,
        paddingBottom: 40,
    },
    headerSection: {
        marginBottom: 32,
    },
    headerTitle: {
        fontFamily: 'Pretendard-Bold',
        fontSize: 20,
        color: Colors.text,
        marginBottom: 16,
    },
    receivedCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: Colors.white,
        padding: 20,
        borderRadius: 16,
        gap: 16,
        marginBottom: 16,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
        elevation: 2,
    },
    iconCircle: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: '#FFF0E6',
        justifyContent: 'center',
        alignItems: 'center',
    },
    receivedItem: {
        fontFamily: 'Pretendard-Bold',
        fontSize: 16,
        color: Colors.text,
        marginBottom: 4,
    },
    receivedAmount: {
        fontFamily: 'Pretendard-Medium',
        fontSize: 14,
        color: Colors.navy,
        marginBottom: 2,
    },
    receivedDate: {
        fontFamily: 'Pretendard-Medium',
        fontSize: 12,
        color: Colors.subText,
    },
    helperText: {
        fontFamily: 'Pretendard-Medium',
        fontSize: 14,
        color: Colors.subText,
        lineHeight: 20,
    },
    sectionTitle: {
        fontFamily: 'Pretendard-Bold',
        fontSize: 18,
        color: Colors.text,
        marginBottom: 16,
    },
    listContainer: {
        gap: 16,
    },
    recommendCard: {
        padding: 20,
        borderRadius: 20,
        backgroundColor: Colors.white,
    },
    badgeContainer: {
        position: 'absolute',
        top: 20,
        left: 20,
        backgroundColor: Colors.navy,
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 12,
        zIndex: 1,
    },
    badgeText: {
        color: Colors.white,
        fontSize: 10,
        fontFamily: 'Pretendard-Bold',
    },
    cardBody: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 12,
        gap: 16,
        marginBottom: 20,
    },
    itemPlaceholder: {
        width: 72,
        height: 72,
        borderRadius: 12,
        backgroundColor: '#F2F4F6',
        justifyContent: 'center',
        alignItems: 'center',
    },
    itemInfo: {
        flex: 1,
    },
    itemReason: {
        fontFamily: 'Pretendard-Medium',
        fontSize: 12,
        color: Colors.orange,
        marginBottom: 4,
    },
    itemName: {
        fontFamily: 'Pretendard-Bold',
        fontSize: 16,
        color: Colors.text,
        marginBottom: 4,
    },
    itemPrice: {
        fontFamily: 'Pretendard-Bold',
        fontSize: 18,
        color: Colors.text,
    },
    actionButton: {
        backgroundColor: '#FEE500', // Kakao Yellow
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        paddingVertical: 14,
        borderRadius: 12,
        gap: 8,
    },
    actionButtonText: {
        fontFamily: 'Pretendard-Bold',
        fontSize: 14,
        color: '#381E1F', // Kakao Brown
    }
});
