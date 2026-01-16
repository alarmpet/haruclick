import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { Colors } from '../../constants/Colors';
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { supabase } from '../../services/supabase';

interface LegalDocument {
    id: string;
    title: string;
    content: string;
    effective_date: string;
}

export default function TermsScreen() {
    const router = useRouter();
    const [document, setDocument] = useState<LegalDocument | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        fetchTerms();
    }, []);

    const fetchTerms = async () => {
        try {
            const { data, error } = await supabase
                .from('legal_documents')
                .select('*')
                .eq('id', 'terms')
                .single();

            if (error) throw error;
            setDocument(data);
        } catch (e: any) {
            console.error('Failed to fetch terms:', e);
            setError('이용약관을 불러오는데 실패했습니다.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                    <Ionicons name="arrow-back" size={24} color={Colors.text} />
                </TouchableOpacity>
                <Text style={styles.title}>이용약관</Text>
                <View style={{ width: 40 }} />
            </View>

            <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
                {loading ? (
                    <View style={styles.loadingContainer}>
                        <ActivityIndicator size="large" color={Colors.navy} />
                        <Text style={styles.loadingText}>불러오는 중...</Text>
                    </View>
                ) : error ? (
                    <View style={styles.errorContainer}>
                        <Ionicons name="alert-circle-outline" size={48} color={Colors.red} />
                        <Text style={styles.errorText}>{error}</Text>
                        <TouchableOpacity style={styles.retryButton} onPress={fetchTerms}>
                            <Text style={styles.retryText}>다시 시도</Text>
                        </TouchableOpacity>
                    </View>
                ) : document ? (
                    <>
                        <Text style={styles.paragraph}>{document.content}</Text>
                        <Text style={styles.footer}>
                            시행일: {new Date(document.effective_date).toLocaleDateString('ko-KR')}
                        </Text>
                    </>
                ) : null}
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.white,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingTop: 60,
        paddingBottom: 20,
        backgroundColor: Colors.white,
        borderBottomWidth: 1,
        borderBottomColor: Colors.border,
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
    content: {
        flex: 1,
    },
    contentContainer: {
        padding: 20,
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingTop: 100,
    },
    loadingText: {
        marginTop: 12,
        fontSize: 14,
        fontFamily: 'Pretendard-Medium',
        color: Colors.subText,
    },
    errorContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingTop: 100,
    },
    errorText: {
        marginTop: 12,
        fontSize: 14,
        fontFamily: 'Pretendard-Medium',
        color: Colors.subText,
        textAlign: 'center',
    },
    retryButton: {
        marginTop: 16,
        paddingHorizontal: 24,
        paddingVertical: 10,
        backgroundColor: Colors.navy,
        borderRadius: 8,
    },
    retryText: {
        color: Colors.white,
        fontFamily: 'Pretendard-Medium',
        fontSize: 14,
    },
    paragraph: {
        fontSize: 14,
        fontFamily: 'Pretendard-Regular',
        color: Colors.text,
        lineHeight: 24,
    },
    footer: {
        fontSize: 12,
        fontFamily: 'Pretendard-Regular',
        color: Colors.subText,
        marginTop: 40,
        textAlign: 'center',
    },
});
