import React from 'react';
import { View, Text, TouchableOpacity, TextInput, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/Colors';
import { GifticonResult } from '../../services/ai/OpenAIService';

interface EditableRowProps {
    label: string;
    value: string;
    onChangeText: (text: string) => void;
    placeholder?: string;
    keyboardType?: 'default' | 'numeric';
    isCurrency?: boolean;
}

// Use React Native TextInput (NOT HTML input)
const EditableRow: React.FC<EditableRowProps> = ({ label, value, onChangeText, placeholder, keyboardType, isCurrency }) => {
    const [localValue, setLocalValue] = React.useState(value);

    React.useEffect(() => {
        setLocalValue(value);
    }, [value]);

    const handleChange = (text: string) => {
        if (isCurrency) {
            const numericValue = text.replace(/[^0-9]/g, '');
            setLocalValue(numericValue);
            onChangeText(numericValue);
        } else {
            setLocalValue(text);
            onChangeText(text);
        }
    };

    const displayValue = isCurrency
        ? Number(localValue || 0).toLocaleString()
        : localValue;

    return (
        <View style={styles.row}>
            <Text style={styles.label}>{label}</Text>
            <View style={styles.inputContainer}>
                <TextInput
                    style={styles.input}
                    value={displayValue}
                    onChangeText={handleChange}
                    placeholder={placeholder}
                    keyboardType={keyboardType === 'numeric' ? 'number-pad' : 'default'}
                    placeholderTextColor={Colors.subText}
                />
                {isCurrency && <Text style={styles.currencySuffix}>원</Text>}
            </View>
        </View>
    );
};

interface GifticonEditorProps {
    data: GifticonResult;
    onUpdateField: (field: string, value: any) => void;
    onOpenDatePicker: () => void;
    editingIndex?: number | null;
}

export const GifticonEditor: React.FC<GifticonEditorProps> = ({
    data,
    onUpdateField,
    onOpenDatePicker,
}) => {
    return (
        <View style={styles.card}>
            <View style={styles.headerRow}>
                <Ionicons name="gift-outline" size={24} color={Colors.navy} />
                <Text style={styles.cardTitle}>기프티콘 정보 (수정 가능)</Text>
            </View>
            <View style={styles.divider} />

            <EditableRow
                label="상품명"
                value={data.productName || ''}
                onChangeText={(text) => onUpdateField('productName', text)}
            />
            <EditableRow
                label="브랜드"
                value={data.brandName || ''}
                onChangeText={(text) => onUpdateField('brandName', text)}
            />
            <EditableRow
                label="보낸 사람"
                value={data.senderName || ''}
                onChangeText={(text) => onUpdateField('senderName', text)}
            />

            {/* 날짜 선택 */}
            <View style={styles.row}>
                <Text style={[styles.label, { marginTop: 12 }]}>유효기간</Text>
                <TouchableOpacity
                    style={[styles.input, { justifyContent: 'center' }]}
                    onPress={onOpenDatePicker}
                >
                    <Text style={{ fontFamily: 'Pretendard-Bold', fontSize: 16, color: Colors.text }}>
                        {data.expiryDate || 'YYYY-MM-DD'}
                    </Text>
                </TouchableOpacity>
            </View>

            <EditableRow
                label="바코드 번호"
                value={data.barcodeNumber || ''}
                onChangeText={(text) => onUpdateField('barcodeNumber', text)}
                keyboardType="numeric"
            />
            <EditableRow
                label="예상 금액"
                value={String(data.estimatedPrice || 0)}
                keyboardType="numeric"
                onChangeText={(text) => onUpdateField('estimatedPrice', parseInt(text.replace(/[^0-9]/g, '') || '0', 10))}
                isCurrency
            />
        </View>
    );
};

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
    inputContainer: {
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
    currencySuffix: {
        fontFamily: 'Pretendard-Bold',
        fontSize: 16,
        color: Colors.text,
        marginLeft: 8,
    },
});

export default GifticonEditor;
