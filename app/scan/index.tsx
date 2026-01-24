import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { Colors } from '../../constants/Colors';
import Ionicons from '@expo/vector-icons/Ionicons';
import { analyzeInvitation, AnalysisResult } from '../../services/ai/AnalysisEngine';
import { useLoading } from '../../components/LoadingOverlay';
import { useTheme } from '../../contexts/ThemeContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const RELATIONS = ['가족', '친한 친구', '직장 동료', '대학 동기', '지인', '거래처'];

export default function ScanScreen() {
    const router = useRouter();
    const loading = useLoading();
    const { colors, isDark } = useTheme();
    const insets = useSafeAreaInsets();
    const [image, setImage] = useState<string | null>(null);
    const [selectedRelation, setSelectedRelation] = useState<string | null>(null);
    const [isAnalyzing, setIsAnalyzing] = useState(false);

    const pickImage = async () => {
        // No permissions request is necessary for launching the image library
        let result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: true,
            quality: 1,
        });

        if (!result.canceled) {
            setImage(result.assets[0].uri);
        }
    };

    const handleAnalyze = async () => {
        if (!image || !selectedRelation) {
            Alert.alert('알림', '이미지와 관계를 모두 선택해주세요.');
            return;
        }

        setIsAnalyzing(true);
        loading.show('Analyzing...');
        try {
            const result = await analyzeInvitation(image, selectedRelation);
            // Navigate to results with params
            router.push({
                pathname: '/scan/result',
                params: { result: JSON.stringify(result) }
            });
        } catch (error) {
            Alert.alert('오류', '분석 중 문제가 발생했습니다.');
            console.error(error);
        } finally {
            loading.hide();
            setIsAnalyzing(false);
        }
    };

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            <ScrollView contentContainerStyle={styles.content}>
                <Text style={[styles.headerTitle, { color: colors.text }]}>청첩장 분석</Text>
                <Text style={[styles.headerSubtitle, { color: colors.subText }]}>청첩장 사진을 올리고{'\n'}관계만 알려주세요.</Text>

                {/* Image Picker Area */}
                <TouchableOpacity
                    style={[styles.imageContainer, { backgroundColor: colors.card, borderColor: colors.border }]}
                    onPress={pickImage}
                    activeOpacity={0.9}
                    accessibilityLabel={image ? "이미지 선택됨" : "사진 선택하기"}
                    accessibilityRole="button"
                >
                    {image ? (
                        <Image source={{ uri: image }} style={styles.image} contentFit="contain" />
                    ) : (
                        <View style={styles.placeholder}>
                            <Ionicons name="camera-outline" size={48} color={colors.subText} />
                            <Text style={[styles.placeholderText, { color: colors.subText }]}>청첩장 사진 선택하기</Text>
                        </View>
                    )}
                </TouchableOpacity>

                {/* Relation Selector */}
                <Text style={[styles.sectionTitle, { color: colors.text }]}>관계 선택</Text>
                <View style={styles.relationGrid}>
                    {RELATIONS.map((rel) => {
                        const isSelected = selectedRelation === rel;
                        return (
                            <TouchableOpacity
                                key={rel}
                                style={[
                                    styles.relationChip,
                                    { backgroundColor: colors.card, borderColor: colors.border },
                                    isSelected && { backgroundColor: isDark ? colors.primary : colors.navy, borderColor: isDark ? colors.primary : colors.navy }
                                ]}
                                onPress={() => setSelectedRelation(rel)}
                                accessibilityRole="radio"
                                accessibilityState={{ selected: isSelected }}
                                accessibilityLabel={`${rel} 선택`}
                            >
                                {isSelected && <Ionicons name="checkmark" size={16} color="white" style={{ marginRight: 4 }} />}
                                <Text style={[
                                    styles.chipText,
                                    { color: colors.subText },
                                    isSelected && { color: 'white', fontFamily: 'Pretendard-Bold' }
                                ]}>{rel}</Text>
                            </TouchableOpacity>
                        );
                    })}
                </View>
            </ScrollView>

            {/* Bottom Action */}
            <View style={[styles.footer, { backgroundColor: colors.background, paddingBottom: Math.max(insets.bottom, 24) }]}>
                <TouchableOpacity
                    style={[
                        styles.analyzeButton,
                        { backgroundColor: colors.primary },
                        (!image || !selectedRelation) && { backgroundColor: isDark ? '#555' : '#FFD4B5' }
                    ]}
                    onPress={handleAnalyze}
                    disabled={!image || !selectedRelation || isAnalyzing}
                    accessibilityLabel="AI 분석 시작하기"
                    accessibilityRole="button"
                >
                    <Text style={[styles.buttonText, { color: isDark && (!image || !selectedRelation) ? '#888' : 'white' }]}>AI 분석 시작하기</Text>
                </TouchableOpacity>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    content: {
        padding: 24,
    },
    headerTitle: {
        fontFamily: 'Pretendard-Bold',
        fontSize: 24,
        marginTop: 20,
        marginBottom: 8,
    },
    headerSubtitle: {
        fontFamily: 'Pretendard-Medium',
        fontSize: 16,
        lineHeight: 24,
        marginBottom: 32,
    },
    imageContainer: {
        width: '100%',
        height: 300,
        borderRadius: 20,
        marginBottom: 32,
        overflow: 'hidden',
        borderWidth: 1,
        justifyContent: 'center',
        alignItems: 'center',
        borderStyle: 'dashed',
    },
    image: {
        width: '100%',
        height: '100%',
    },
    placeholder: {
        alignItems: 'center',
        gap: 12,
    },
    placeholderText: {
        fontFamily: 'Pretendard-Medium',
        fontSize: 14,
    },
    sectionTitle: {
        fontFamily: 'Pretendard-Bold',
        fontSize: 18,
        marginBottom: 16,
    },
    relationGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 10,
    },
    relationChip: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingVertical: 12,
        borderRadius: 100,
        borderWidth: 1,
    },
    chipText: {
        fontFamily: 'Pretendard-Medium',
        fontSize: 14,
    },
    footer: {
        padding: 24,
        borderTopWidth: 1,
        borderTopColor: 'rgba(0,0,0,0.05)',
    },
    analyzeButton: {
        paddingVertical: 18,
        borderRadius: 16,
        alignItems: 'center',
    },
    buttonText: {
        fontFamily: 'Pretendard-Bold',
        fontSize: 18,
    },
});
