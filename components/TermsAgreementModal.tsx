import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, Pressable } from 'react-native';
import { Colors } from '../constants/Colors';
import Ionicons from '@expo/vector-icons/Ionicons';

interface TermsAgreementModalProps {
    visible: boolean;
    onClose: () => void;
    onAccept: () => void;
}

interface CheckItem {
    id: string;
    label: string;
    required: boolean;
    description?: string;
}

const TERMS_ITEMS: CheckItem[] = [
    { id: 'age', label: '만 14세 이상입니다.', required: true, description: '만 14세 미만일 경우 보호자의 동의가 필요합니다.' },
    { id: 'terms', label: '하루클릭 이용약관에 동의합니다', required: true },
    { id: 'privacy', label: '하루클릭 개인정보처리방침에 동의합니다', required: true },
];

export default function TermsAgreementModal({ visible, onClose, onAccept }: TermsAgreementModalProps) {
    const [checkedItems, setCheckedItems] = useState<Set<string>>(new Set());

    const allChecked = TERMS_ITEMS.every(item => checkedItems.has(item.id));

    const toggleAll = () => {
        if (allChecked) {
            setCheckedItems(new Set());
        } else {
            setCheckedItems(new Set(TERMS_ITEMS.map(item => item.id)));
        }
    };

    const toggleItem = (id: string) => {
        const newSet = new Set(checkedItems);
        if (newSet.has(id)) {
            newSet.delete(id);
        } else {
            newSet.add(id);
        }
        setCheckedItems(newSet);
    };

    const canProceed = TERMS_ITEMS.filter(item => item.required).every(item => checkedItems.has(item.id));

    const handleAccept = () => {
        if (canProceed) {
            setCheckedItems(new Set());
            onAccept();
        }
    };

    return (
        <Modal visible={visible} transparent animationType="slide">
            <View style={styles.overlay}>
                <Pressable style={styles.backdrop} onPress={onClose} />
                <View style={styles.container}>
                    {/* Logo */}
                    <View style={styles.logoContainer}>
                        <Text style={styles.logoEmoji}>📅</Text>
                    </View>

                    {/* Header */}
                    <Text style={styles.title}>이용약관에 동의해 주세요.</Text>
                    <Text style={styles.subtitle}>서비스를 이용하기 위해서는 아래의 내용에 동의하셔야 합니다.</Text>

                    {/* All Agree */}
                    <TouchableOpacity style={styles.allAgreeRow} onPress={toggleAll}>
                        <Ionicons
                            name={allChecked ? "checkmark-circle" : "ellipse-outline"}
                            size={24}
                            color={allChecked ? Colors.primaryGreen : Colors.subText}
                        />
                        <Text style={styles.allAgreeText}>모두 동의합니다</Text>
                    </TouchableOpacity>

                    {/* Individual Items */}
                    <View style={styles.itemsContainer}>
                        {TERMS_ITEMS.map(item => (
                            <TouchableOpacity
                                key={item.id}
                                style={styles.itemRow}
                                onPress={() => toggleItem(item.id)}
                            >
                                <Ionicons
                                    name={checkedItems.has(item.id) ? "checkmark-circle" : "ellipse-outline"}
                                    size={20}
                                    color={checkedItems.has(item.id) ? Colors.primaryGreen : Colors.subText}
                                />
                                <View style={styles.itemTextContainer}>
                                    <Text style={styles.itemLabel}>
                                        <Text style={styles.requiredTag}>(필수)</Text> {item.label}
                                    </Text>
                                    {item.description && (
                                        <Text style={styles.itemDescription}>{item.description}</Text>
                                    )}
                                </View>
                                <Ionicons name="chevron-forward" size={16} color={Colors.subText} />
                            </TouchableOpacity>
                        ))}
                    </View>

                    {/* Accept Button */}
                    <TouchableOpacity
                        style={[styles.acceptButton, !canProceed && styles.acceptButtonDisabled]}
                        onPress={handleAccept}
                        disabled={!canProceed}
                    >
                        <Text style={styles.acceptButtonText}>동의하고 계속하기</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        justifyContent: 'flex-end',
    },
    backdrop: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.5)',
    },
    container: {
        backgroundColor: Colors.darkCard,
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        paddingHorizontal: 24,
        paddingTop: 20,
        paddingBottom: 40,
    },
    logoContainer: {
        alignItems: 'center',
        marginBottom: 20,
    },
    logoEmoji: {
        fontSize: 48,
    },
    title: {
        fontFamily: 'Pretendard-Bold',
        fontSize: 22,
        color: Colors.white,
        marginBottom: 8,
    },
    subtitle: {
        fontFamily: 'Pretendard-Regular',
        fontSize: 14,
        color: Colors.subText,
        marginBottom: 24,
        lineHeight: 20,
    },
    allAgreeRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: Colors.darkBorder,
        marginBottom: 8,
    },
    allAgreeText: {
        fontFamily: 'Pretendard-SemiBold',
        fontSize: 16,
        color: Colors.white,
    },
    itemsContainer: {
        gap: 4,
        marginBottom: 24,
    },
    itemRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        gap: 12,
    },
    itemTextContainer: {
        flex: 1,
    },
    itemLabel: {
        fontFamily: 'Pretendard-Medium',
        fontSize: 14,
        color: Colors.white,
    },
    requiredTag: {
        color: Colors.primaryGreen,
    },
    itemDescription: {
        fontFamily: 'Pretendard-Regular',
        fontSize: 12,
        color: Colors.subText,
        marginTop: 4,
    },
    acceptButton: {
        backgroundColor: Colors.primaryGreen,
        paddingVertical: 16,
        borderRadius: 12,
        alignItems: 'center',
    },
    acceptButtonDisabled: {
        opacity: 0.5,
    },
    acceptButtonText: {
        fontFamily: 'Pretendard-SemiBold',
        fontSize: 16,
        color: Colors.darkBackground,
    },
});
