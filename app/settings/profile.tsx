import { View, Text, StyleSheet, TextInput, TouchableOpacity, Alert, ScrollView } from 'react-native';
import { useState, useEffect } from 'react';
import { useRouter } from 'expo-router';
import { supabase } from '../../services/supabase';
import { Colors } from '../../constants/Colors';
import { Ionicons } from '@expo/vector-icons';

export default function ProfileEditScreen() {
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [email, setEmail] = useState('');
    const [displayName, setDisplayName] = useState('');
    const [phone, setPhone] = useState('');

    useEffect(() => {
        loadProfile();
    }, []);

    const loadProfile = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
            setEmail(user.email || '');
            setDisplayName(user.user_metadata?.display_name || '');
            setPhone(user.user_metadata?.phone || '');
        }
    };

    const handleSave = async () => {
        setLoading(true);
        try {
            const { error } = await supabase.auth.updateUser({
                data: {
                    display_name: displayName,
                    phone: phone,
                }
            });

            if (error) throw error;

            Alert.alert('성공', '프로필이 저장되었습니다.', [
                { text: '확인', onPress: () => router.back() }
            ]);
        } catch (error: any) {
            Alert.alert('오류', error.message || '프로필 저장에 실패했습니다.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <ScrollView style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                    <Ionicons name="arrow-back" size={24} color={Colors.text} />
                </TouchableOpacity>
                <Text style={styles.title}>프로필 수정</Text>
                <View style={{ width: 40 }} />
            </View>

            <View style={styles.avatarSection}>
                <View style={styles.avatar}>
                    <Ionicons name="person" size={50} color={Colors.white} />
                </View>
                <TouchableOpacity style={styles.changePhotoButton}>
                    <Text style={styles.changePhotoText}>사진 변경</Text>
                </TouchableOpacity>
            </View>

            <View style={styles.form}>
                <View style={styles.inputGroup}>
                    <Text style={styles.label}>이메일</Text>
                    <TextInput
                        style={[styles.input, styles.disabledInput]}
                        value={email}
                        editable={false}
                        placeholder="이메일"
                    />
                    <Text style={styles.hint}>이메일은 변경할 수 없습니다</Text>
                </View>

                <View style={styles.inputGroup}>
                    <Text style={styles.label}>이름 (닉네임)</Text>
                    <TextInput
                        style={styles.input}
                        value={displayName}
                        onChangeText={setDisplayName}
                        placeholder="이름 또는 닉네임을 입력하세요"
                        placeholderTextColor={Colors.subText}
                    />
                </View>

                <View style={styles.inputGroup}>
                    <Text style={styles.label}>연락처</Text>
                    <TextInput
                        style={styles.input}
                        value={phone}
                        onChangeText={setPhone}
                        placeholder="010-0000-0000"
                        placeholderTextColor={Colors.subText}
                        keyboardType="phone-pad"
                    />
                </View>
            </View>

            <TouchableOpacity
                style={[styles.saveButton, loading && styles.disabledButton]}
                onPress={handleSave}
                disabled={loading}
            >
                <Text style={styles.saveButtonText}>
                    {loading ? '저장 중...' : '저장하기'}
                </Text>
            </TouchableOpacity>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.background,
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
    avatarSection: {
        alignItems: 'center',
        paddingVertical: 30,
        backgroundColor: Colors.white,
        marginBottom: 12,
    },
    avatar: {
        width: 100,
        height: 100,
        borderRadius: 50,
        backgroundColor: Colors.navy,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 12,
    },
    changePhotoButton: {
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 20,
        backgroundColor: '#F0F2F5',
    },
    changePhotoText: {
        fontSize: 14,
        fontFamily: 'Pretendard-Medium',
        color: Colors.navy,
    },
    form: {
        backgroundColor: Colors.white,
        padding: 20,
        marginBottom: 12,
    },
    inputGroup: {
        marginBottom: 20,
    },
    label: {
        fontSize: 14,
        fontFamily: 'Pretendard-Bold',
        color: Colors.text,
        marginBottom: 8,
    },
    input: {
        borderWidth: 1,
        borderColor: Colors.border,
        borderRadius: 12,
        paddingHorizontal: 16,
        paddingVertical: 14,
        fontSize: 16,
        fontFamily: 'Pretendard-Medium',
        color: Colors.text,
        backgroundColor: Colors.white,
    },
    disabledInput: {
        backgroundColor: '#F5F6F8',
        color: Colors.subText,
    },
    hint: {
        fontSize: 12,
        fontFamily: 'Pretendard-Regular',
        color: Colors.subText,
        marginTop: 6,
    },
    saveButton: {
        backgroundColor: Colors.navy,
        marginHorizontal: 20,
        marginVertical: 20,
        paddingVertical: 16,
        borderRadius: 12,
        alignItems: 'center',
    },
    disabledButton: {
        opacity: 0.6,
    },
    saveButtonText: {
        fontSize: 16,
        fontFamily: 'Pretendard-Bold',
        color: Colors.white,
    },
});
