import { View, Text, StyleSheet, Image, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { Colors } from '../../constants/Colors';
import Ionicons from '@expo/vector-icons/Ionicons';
import { analyzeInvitation, AnalysisResult } from '../../services/ai/AnalysisEngine';
import { useLoading } from '../../components/LoadingOverlay';

const RELATIONS = ['가족', '친한 친구', '직장 동료', '대학 동기', '지인', '거래처'];

export default function ScanScreen() {
    const router = useRouter();
    const loading = useLoading();
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
        <View style={styles.container}>
            <ScrollView contentContainerStyle={styles.content}>
                <Text style={styles.headerTitle}>청첩장 분석</Text>
                <Text style={styles.headerSubtitle}>청첩장 사진을 올리고{'\n'}관계만 알려주세요.</Text>

                {/* Image Picker Area */}
                <TouchableOpacity style={styles.imageContainer} onPress={pickImage} activeOpacity={0.9}>
                    {image ? (
                        <Image source={{ uri: image }} style={styles.image} resizeMode="contain" />
                    ) : (
                        <View style={styles.placeholder}>
                            <Ionicons name="camera-outline" size={48} color={Colors.subText} />
                            <Text style={styles.placeholderText}>청첩장 사진 선택하기</Text>
                        </View>
                    )}
                </TouchableOpacity>

                {/* Relation Selector */}
                <Text style={styles.sectionTitle}>관계 선택</Text>
                <View style={styles.relationGrid}>
                    {RELATIONS.map((rel) => (
                        <TouchableOpacity
                            key={rel}
                            style={[
                                styles.relationChip,
                                selectedRelation === rel && styles.selectedChip
                            ]}
                            onPress={() => setSelectedRelation(rel)}
                        >
                            <Text style={[
                                styles.chipText,
                                selectedRelation === rel && styles.selectedChipText
                            ]}>{rel}</Text>
                        </TouchableOpacity>
                    ))}
                </View>
            </ScrollView>

            {/* Bottom Action */}
            <View style={styles.footer}>
                <TouchableOpacity
                    style={[
                        styles.analyzeButton,
                        (!image || !selectedRelation) && styles.disabledButton
                    ]}
                    onPress={handleAnalyze}
                    disabled={!image || !selectedRelation || isAnalyzing}
                >
                    <Text style={styles.buttonText}>AI 분석 시작하기</Text>
                </TouchableOpacity>
            </View>
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
    },
    headerTitle: {
        fontFamily: 'Pretendard-Bold',
        fontSize: 24,
        color: Colors.text,
        marginTop: 20,
        marginBottom: 8,
    },
    headerSubtitle: {
        fontFamily: 'Pretendard-Medium',
        fontSize: 16,
        color: Colors.subText,
        lineHeight: 24,
        marginBottom: 32,
    },
    imageContainer: {
        width: '100%',
        height: 300,
        backgroundColor: Colors.white,
        borderRadius: 20,
        marginBottom: 32,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: Colors.border,
        justifyContent: 'center',
        alignItems: 'center',
        borderStyle: 'dashed',
    },
    image: {
        width: '100%',
        height: '100%',
        backgroundColor: Colors.white,
    },
    placeholder: {
        alignItems: 'center',
        gap: 12,
    },
    placeholderText: {
        fontFamily: 'Pretendard-Medium',
        color: Colors.subText,
        fontSize: 14,
    },
    sectionTitle: {
        fontFamily: 'Pretendard-Bold',
        fontSize: 18,
        color: Colors.text,
        marginBottom: 16,
    },
    relationGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 10,
    },
    relationChip: {
        paddingHorizontal: 20,
        paddingVertical: 12,
        borderRadius: 100,
        backgroundColor: Colors.white,
        borderWidth: 1,
        borderColor: Colors.border,
    },
    selectedChip: {
        backgroundColor: Colors.navy,
        borderColor: Colors.navy,
    },
    chipText: {
        fontFamily: 'Pretendard-Medium',
        fontSize: 14,
        color: Colors.subText,
    },
    selectedChipText: {
        color: Colors.white,
        fontFamily: 'Pretendard-Bold',
    },
    footer: {
        padding: 24,
        backgroundColor: Colors.white,
        borderTopWidth: 1,
        borderTopColor: Colors.border,
    },
    analyzeButton: {
        backgroundColor: Colors.orange,
        paddingVertical: 18,
        borderRadius: 16,
        alignItems: 'center',
    },
    disabledButton: {
        backgroundColor: '#FFD4B5',
    },
    buttonText: {
        fontFamily: 'Pretendard-Bold',
        fontSize: 18,
        color: Colors.white,
    },
});
