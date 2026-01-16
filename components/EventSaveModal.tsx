import React, { useState } from 'react';
import { Modal, View, Text, StyleSheet, TouchableOpacity, TextInput, KeyboardAvoidingView, Platform, TouchableWithoutFeedback, Keyboard } from 'react-native';
import { Colors } from '../constants/Colors';
import Ionicons from '@expo/vector-icons/Ionicons';

interface EventSaveModalProps {
    visible: boolean;
    onClose: () => void;
    onSave: (name: string, relation: string) => void;
    recommendedAmount: number;
}

export const EventSaveModal = ({ visible, onClose, onSave, recommendedAmount }: EventSaveModalProps) => {
    const [name, setName] = useState('');
    const [relation, setRelation] = useState('');

    const handleSave = () => {
        if (!name.trim()) {
            alert('이름을 입력해주세요.');
            return;
        }
        onSave(name, relation || '지인');
        setName('');
        setRelation('');
        onClose();
    };

    const relations = ['친구', '직장동료', '가족', '친척', '지인'];

    return (
        <Modal
            visible={visible}
            transparent
            animationType="fade"
            onRequestClose={onClose}
        >
            <TouchableWithoutFeedback onPress={onClose}>
                <View style={styles.overlay}>
                    <KeyboardAvoidingView
                        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                        style={styles.keyboardView}
                    >
                        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
                            <View style={styles.modalContent}>
                                <View style={styles.header}>
                                    <Text style={styles.title}>장부에 기록하기</Text>
                                    <TouchableOpacity onPress={onClose}>
                                        <Ionicons name="close" size={24} color={Colors.text} />
                                    </TouchableOpacity>
                                </View>

                                <View style={styles.inputContainer}>
                                    <Text style={styles.label}>이름</Text>
                                    <TextInput
                                        style={styles.input}
                                        placeholder="이름을 입력하세요"
                                        value={name}
                                        onChangeText={setName}
                                        autoFocus
                                    />
                                </View>

                                <View style={styles.inputContainer}>
                                    <Text style={styles.label}>관계</Text>
                                    <View style={styles.chipContainer}>
                                        {relations.map((rel) => (
                                            <TouchableOpacity
                                                key={rel}
                                                style={[
                                                    styles.chip,
                                                    relation === rel && styles.activeChip
                                                ]}
                                                onPress={() => setRelation(rel)}
                                            >
                                                <Text style={[
                                                    styles.chipText,
                                                    relation === rel && styles.activeChipText
                                                ]}>{rel}</Text>
                                            </TouchableOpacity>
                                        ))}
                                    </View>
                                    <TextInput
                                        style={[styles.input, { marginTop: 8 }]}
                                        placeholder="직접 입력 (선택사항)"
                                        value={relation}
                                        onChangeText={setRelation}
                                    />
                                </View>

                                <View style={styles.summary}>
                                    <Text style={styles.summaryLabel}>저장할 금액</Text>
                                    <Text style={styles.summaryAmount}>{recommendedAmount.toLocaleString()}원</Text>
                                </View>

                                <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
                                    <Text style={styles.saveButtonText}>저장하기</Text>
                                </TouchableOpacity>
                            </View>
                        </TouchableWithoutFeedback>
                    </KeyboardAvoidingView>
                </View>
            </TouchableWithoutFeedback>
        </Modal>
    );
};

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'flex-end',
    },
    keyboardView: {
        width: '100%',
    },
    modalContent: {
        backgroundColor: Colors.white,
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        padding: 24,
        paddingBottom: Platform.OS === 'ios' ? 40 : 24,
        minHeight: 400,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 24,
    },
    title: {
        fontFamily: 'Pretendard-Bold',
        fontSize: 20,
        color: Colors.text,
    },
    inputContainer: {
        marginBottom: 20,
    },
    label: {
        fontFamily: 'Pretendard-Medium',
        fontSize: 14,
        color: Colors.subText,
        marginBottom: 8,
    },
    input: {
        backgroundColor: '#F3F4F6',
        borderRadius: 12,
        padding: 16,
        fontSize: 16,
        fontFamily: 'Pretendard-Regular',
        color: Colors.text,
    },
    chipContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    chip: {
        paddingVertical: 8,
        paddingHorizontal: 16,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: Colors.border,
        backgroundColor: Colors.white,
    },
    activeChip: {
        borderColor: Colors.orange,
        backgroundColor: '#FFF4E6',
    },
    chipText: {
        fontFamily: 'Pretendard-Medium',
        fontSize: 14,
        color: Colors.subText,
    },
    activeChipText: {
        color: Colors.orange,
        fontFamily: 'Pretendard-Bold',
    },
    summary: {
        backgroundColor: '#F9FAFB',
        padding: 16,
        borderRadius: 12,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 24,
    },
    summaryLabel: {
        fontFamily: 'Pretendard-Medium',
        fontSize: 14,
        color: Colors.subText,
    },
    summaryAmount: {
        fontFamily: 'Pretendard-Bold',
        fontSize: 18,
        color: Colors.text,
    },
    saveButton: {
        backgroundColor: Colors.navy,
        paddingVertical: 18,
        borderRadius: 16,
        alignItems: 'center',
    },
    saveButtonText: {
        fontFamily: 'Pretendard-Bold',
        fontSize: 18,
        color: Colors.white,
    },
});
