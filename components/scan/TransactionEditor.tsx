import React from 'react';
import { View, Text, TouchableOpacity, TextInput, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/Colors';
import { BankTransactionResult, StorePaymentResult } from '../../services/ai/OpenAIService';

// =========================================
// Shared EditableRow Component
// =========================================
interface EditableRowProps {
    label: string;
    value: string;
    onChangeText: (text: string) => void;
    placeholder?: string;
    keyboardType?: 'default' | 'numeric';
    isCurrency?: boolean;
}

const EditableRow: React.FC<EditableRowProps> = ({ label, value, onChangeText, placeholder, keyboardType, isCurrency }) => {
    return (
        <View style={styles.row}>
            <Text style={styles.label}>{label}</Text>
            <View style={styles.inputWrapper}>
                <TextInput
                    style={styles.input}
                    value={isCurrency ? `${Number(value || 0).toLocaleString()}` : value}
                    onChangeText={(text) => {
                        if (isCurrency) {
                            onChangeText(text.replace(/[^0-9]/g, ''));
                        } else {
                            onChangeText(text);
                        }
                    }}
                    placeholder={placeholder}
                    keyboardType={keyboardType === 'numeric' ? 'number-pad' : 'default'}
                />
                {isCurrency && <Text style={styles.currencySymbol}>원</Text>}
            </View>
        </View>
    );
};

// =========================================
// Category Selector Component
// =========================================
interface CategorySelectorProps {
    label: string;
    value: string;
    onPress: () => void;
}

const CategorySelector: React.FC<CategorySelectorProps> = ({ label, value, onPress }) => (
    <View style={styles.infoRow}>
        <Text style={styles.infoLabel}>{label}</Text>
        <TouchableOpacity style={styles.categorySelect} onPress={onPress}>
            <Text style={styles.categorySelectText}>{value || '선택하세요'}</Text>
            <Ionicons name="chevron-down" size={16} color={Colors.subText} />
        </TouchableOpacity>
    </View>
);

// =========================================
// Bank Transfer Editor
// =========================================
interface BankTransferEditorProps {
    data: BankTransactionResult;
    onUpdateField: (field: string, value: any) => void;
    onOpenCategoryModal: (type: 'category' | 'subCategory', currentValue?: string) => void;
}

export const BankTransferEditor: React.FC<BankTransferEditorProps> = ({
    data,
    onUpdateField,
    onOpenCategoryModal,
}) => {
    const isDeposit = data.transactionType === 'deposit';

    return (
        <View style={styles.card}>
            <View style={styles.headerRow}>
                <Ionicons name="card-outline" size={24} color={Colors.navy} />
                <Text style={styles.cardTitle}>은행 거래 수정</Text>
            </View>
            <View style={styles.divider} />

            <EditableRow
                label="금액"
                value={String(data.amount || 0)}
                keyboardType="numeric"
                onChangeText={(text) => onUpdateField('amount', parseInt(text || '0', 10))}
                isCurrency
            />
            <EditableRow
                label={isDeposit ? '보낸 사람' : '받는 사람'}
                value={data.targetName || ''}
                onChangeText={(text) => onUpdateField('targetName', text)}
            />
            <EditableRow
                label="날짜"
                value={data.date || ''}
                onChangeText={(text) => onUpdateField('date', text)}
                placeholder="YYYY-MM-DD HH:mm"
            />

            <CategorySelector
                label="카테고리 (대분류)"
                value={data.category || ''}
                onPress={() => onOpenCategoryModal('category', data.category)}
            />
            <CategorySelector
                label="상세 분류 (소분류)"
                value={data.subCategory || ''}
                onPress={() => onOpenCategoryModal('subCategory', data.category || '기타')}
            />

            <EditableRow
                label="메모"
                value={data.memo || ''}
                onChangeText={(text) => onUpdateField('memo', text)}
                placeholder="메모 입력"
            />
        </View>
    );
};

// =========================================
// Store Payment Editor
// =========================================
interface StorePaymentEditorProps {
    data: StorePaymentResult;
    onUpdateField: (field: string, value: any) => void;
    onOpenCategoryModal: (type: 'category' | 'subCategory', currentValue?: string) => void;
    onOpenDatePicker: () => void;
}

export const StorePaymentEditor: React.FC<StorePaymentEditorProps> = ({
    data,
    onUpdateField,
    onOpenCategoryModal,
    onOpenDatePicker,
}) => {
    return (
        <View style={styles.card}>
            <View style={styles.headerRow}>
                <Ionicons name="cart-outline" size={24} color={Colors.navy} />
                <Text style={styles.cardTitle}>결제 내역 수정</Text>
            </View>
            <View style={styles.divider} />

            <EditableRow
                label="상호명"
                value={data.merchant || ''}
                onChangeText={(text) => onUpdateField('merchant', text)}
            />
            <EditableRow
                label="금액"
                value={String(data.amount || 0)}
                keyboardType="numeric"
                onChangeText={(text) => onUpdateField('amount', parseInt(text || '0', 10))}
                isCurrency
            />

            {/* Date Picker Trigger */}
            <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>날짜</Text>
                <TouchableOpacity style={styles.categorySelect} onPress={onOpenDatePicker}>
                    <Text style={styles.categorySelectText}>{data.date || 'YYYY-MM-DD'}</Text>
                    <Ionicons name="calendar-outline" size={16} color={Colors.subText} />
                </TouchableOpacity>
            </View>

            <CategorySelector
                label="카테고리 (대분류)"
                value={data.category || ''}
                onPress={() => onOpenCategoryModal('category', data.category)}
            />
            <CategorySelector
                label="상세 분류 (소분류)"
                value={data.subCategory || ''}
                onPress={() => onOpenCategoryModal('subCategory', data.category || '기타')}
            />

            <EditableRow
                label="메모"
                value={data.memo || ''}
                onChangeText={(text) => onUpdateField('memo', text)}
                placeholder="메모 입력"
            />
        </View>
    );
};

// =========================================
// Styles
// =========================================
const styles = StyleSheet.create({
    card: {
        backgroundColor: Colors.white,
        borderRadius: 16,
        padding: 20,
        marginBottom: 16,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 8,
        elevation: 3,
    },
    headerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        marginBottom: 12,
    },
    cardTitle: {
        fontFamily: 'Pretendard-Bold',
        fontSize: 18,
        color: Colors.navy,
    },
    divider: {
        height: 1,
        backgroundColor: Colors.border,
        marginVertical: 12,
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 12,
    },
    label: {
        fontFamily: 'Pretendard-Medium',
        fontSize: 14,
        color: Colors.subText,
        width: 80,
    },
    inputWrapper: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
    },
    input: {
        flex: 1,
        fontFamily: 'Pretendard-Bold',
        fontSize: 16,
        color: Colors.text,
        backgroundColor: Colors.card,
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: Colors.border,
    },
    currencySymbol: {
        fontFamily: 'Pretendard-Bold',
        fontSize: 16,
        color: Colors.text,
        marginLeft: 8,
    },
    infoRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 12,
    },
    infoLabel: {
        fontFamily: 'Pretendard-Medium',
        fontSize: 14,
        color: Colors.subText,
        width: 110,
    },
    categorySelect: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: Colors.card,
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: Colors.border,
    },
    categorySelectText: {
        fontFamily: 'Pretendard-Bold',
        fontSize: 16,
        color: Colors.text,
    },
});

export default { BankTransferEditor, StorePaymentEditor };
