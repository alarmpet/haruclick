import { View, Text, StyleSheet, TouchableOpacity, StatusBar, Dimensions, FlatList, Animated } from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { Colors } from '../../constants/Colors';
import { useState, useRef, useCallback } from 'react';
import TermsAgreementModal from '../../components/TermsAgreementModal';
import { Ionicons } from '@expo/vector-icons';

const { width } = Dimensions.get('window');

// 온보딩 슬라이드 데이터
const ONBOARDING_SLIDES = [
    {
        id: '1',
        icon: '📸',
        title: '찍기만 하면 자동 분석',
        subtitle: 'AI가 청첩장, 영수증, 송금 내역을\n자동으로 인식하고 분류해요',
        iconName: 'scan-outline' as const,
    },
    {
        id: '2',
        icon: '💰',
        title: '경조사 금액 AI 추천',
        subtitle: '관계와 상황에 맞는\n적정 금액을 추천받으세요',
        iconName: 'sparkles-outline' as const,
    },
    {
        id: '3',
        icon: '📅',
        title: '캘린더 + 가계부 한번에',
        subtitle: '일정과 지출을 한 곳에서\n스마트하게 관리하세요',
        iconName: 'calendar-outline' as const,
    },
];

export default function WelcomeScreen() {
    const router = useRouter();
    const [showTermsModal, setShowTermsModal] = useState(false);
    const [currentIndex, setCurrentIndex] = useState(0);
    const flatListRef = useRef<FlatList>(null);
    const scrollX = useRef(new Animated.Value(0)).current;

    const handleStart = () => {
        setShowTermsModal(true);
    };

    const handleTermsAccepted = () => {
        setShowTermsModal(false);
        router.push('/auth/signup');
    };

    const handleLogin = () => {
        router.push('/auth/login');
    };

    const onViewableItemsChanged = useCallback(({ viewableItems }: any) => {
        if (viewableItems.length > 0) {
            setCurrentIndex(viewableItems[0].index || 0);
        }
    }, []);

    const viewabilityConfig = useRef({ viewAreaCoveragePercentThreshold: 50 }).current;

    const renderSlide = useCallback(({ item }: { item: typeof ONBOARDING_SLIDES[number] }) => (
        <View style={styles.slide}>
            <View style={styles.iconContainer}>
                <View style={styles.iconGlow} />
                <Text style={styles.slideEmoji}>{item.icon}</Text>
            </View>
            <Text style={styles.slideTitle}>{item.title}</Text>
            <Text style={styles.slideSubtitle}>{item.subtitle}</Text>
        </View>
    ), []);

    const keyExtractor = useCallback((item: typeof ONBOARDING_SLIDES[number]) => item.id, []);

    const renderPagination = () => (
        <View style={styles.pagination}>
            {ONBOARDING_SLIDES.map((_, index) => {
                const inputRange = [(index - 1) * width, index * width, (index + 1) * width];
                const dotWidth = scrollX.interpolate({
                    inputRange,
                    outputRange: [8, 24, 8],
                    extrapolate: 'clamp',
                });
                const opacity = scrollX.interpolate({
                    inputRange,
                    outputRange: [0.3, 1, 0.3],
                    extrapolate: 'clamp',
                });
                return (
                    <Animated.View
                        key={index}
                        style={[styles.dot, { width: dotWidth, opacity }]}
                    />
                );
            })}
        </View>
    );

    return (
        <View style={styles.container}>
            <StatusBar barStyle="light-content" backgroundColor={Colors.navy} />
            <Stack.Screen options={{ headerShown: false }} />

            {/* Logo */}
            <View style={styles.logoContainer}>
                <Text style={styles.logoText}>하루클릭</Text>
            </View>

            {/* Onboarding Slides */}
            <View style={styles.slidesContainer}>
                <Animated.FlatList
                    ref={flatListRef}
                    data={ONBOARDING_SLIDES}
                    renderItem={renderSlide}
                    keyExtractor={keyExtractor}
                    horizontal
                    pagingEnabled
                    showsHorizontalScrollIndicator={false}
                    onViewableItemsChanged={onViewableItemsChanged}
                    viewabilityConfig={viewabilityConfig}
                    onScroll={Animated.event(
                        [{ nativeEvent: { contentOffset: { x: scrollX } } }],
                        { useNativeDriver: false }
                    )}
                    scrollEventThrottle={16}
                />
                {renderPagination()}
            </View>

            {/* Buttons */}
            <View style={styles.buttonContainer}>
                <TouchableOpacity style={styles.startButton} onPress={handleStart}>
                    <Text style={styles.startButtonText}>시작하기</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.loginButton} onPress={handleLogin}>
                    <Text style={styles.loginButtonText}>이미 계정이 있으신가요? 로그인</Text>
                </TouchableOpacity>
            </View>

            {/* Terms Modal */}
            <TermsAgreementModal
                visible={showTermsModal}
                onClose={() => setShowTermsModal(false)}
                onAccept={handleTermsAccepted}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.navy,
        paddingTop: 60,
        paddingBottom: 40,
    },
    logoContainer: {
        alignItems: 'center',
        paddingTop: 20,
    },
    logoText: {
        fontFamily: 'Pretendard-Bold',
        fontSize: 28,
        color: Colors.orange,
        letterSpacing: 1,
    },
    slidesContainer: {
        flex: 1,
        justifyContent: 'center',
    },
    slide: {
        width: width,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 40,
    },
    iconContainer: {
        width: 120,
        height: 120,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 32,
    },
    iconGlow: {
        position: 'absolute',
        width: 100,
        height: 100,
        borderRadius: 50,
        backgroundColor: Colors.orange,
        opacity: 0.15,
    },
    slideEmoji: {
        fontSize: 64,
    },
    slideTitle: {
        fontFamily: 'Pretendard-Bold',
        fontSize: 24,
        color: Colors.white,
        textAlign: 'center',
        marginBottom: 12,
    },
    slideSubtitle: {
        fontFamily: 'Pretendard-Medium',
        fontSize: 16,
        color: 'rgba(255,255,255,0.7)',
        textAlign: 'center',
        lineHeight: 24,
    },
    pagination: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        marginTop: 32,
        gap: 8,
    },
    dot: {
        height: 8,
        borderRadius: 4,
        backgroundColor: Colors.orange,
    },
    buttonContainer: {
        paddingHorizontal: 40,
        gap: 12,
    },
    startButton: {
        paddingVertical: 16,
        borderRadius: 14,
        backgroundColor: Colors.orange,
        alignItems: 'center',
        shadowColor: Colors.orange,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 5,
    },
    startButtonText: {
        fontFamily: 'Pretendard-Bold',
        fontSize: 18,
        color: Colors.white,
    },
    loginButton: {
        paddingVertical: 14,
        alignItems: 'center',
    },
    loginButtonText: {
        fontFamily: 'Pretendard-Medium',
        fontSize: 14,
        color: 'rgba(255,255,255,0.6)',
    },
});
