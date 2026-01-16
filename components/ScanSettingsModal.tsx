import React from 'react';
import { Modal, View, Text, Switch, StyleSheet, TouchableOpacity } from 'react-native';
import { Colors } from '../constants/Colors';

interface ScanSettingsModalProps {
    visible: boolean;
    onClose: () => void;
    isEnabled: boolean;
    onToggle: (enabled: boolean) => void;
}

export const ScanSettingsModal: React.FC<ScanSettingsModalProps> = ({ visible, onClose, isEnabled, onToggle }) => {
    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
            <View style={styles.backdrop}>
                <View style={styles.modalContainer}>
                    <Text style={styles.title}>OCR 전처리 설정</Text>
                    <View style={styles.row}>
                        <Text style={styles.label}>이미지 전처리 사용</Text>
                        <Switch value={isEnabled} onValueChange={onToggle} thumbColor={isEnabled ? Colors.navy : Colors.subText} />
                    </View>
                    <TouchableOpacity style={styles.closeButton} onPress={onClose}>
                        <Text style={styles.closeText}>닫기</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    backdrop: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    modalContainer: {
        width: '80%',
        backgroundColor: Colors.white,
        borderRadius: 12,
        padding: 20,
        elevation: 5,
    },
    title: {
        fontFamily: 'Pretendard-Bold',
        fontSize: 20,
        color: Colors.text,
        marginBottom: 16,
        textAlign: 'center',
    },
    row: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 24,
    },
    label: {
        fontFamily: 'Pretendard-Regular',
        fontSize: 16,
        color: Colors.text,
    },
    closeButton: {
        alignSelf: 'center',
        backgroundColor: Colors.navy,
        borderRadius: 8,
        paddingVertical: 8,
        paddingHorizontal: 24,
    },
    closeText: {
        color: Colors.white,
        fontFamily: 'Pretendard-Bold',
        fontSize: 14,
    },
});
