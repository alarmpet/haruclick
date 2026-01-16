import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import { Colors } from '../../constants/Colors';

export interface EditableRowProps {
    label: string;
    value: string;
    onChangeText: (text: string) => void;
    placeholder?: string;
    keyboardType?: 'default' | 'numeric';
    isCurrency?: boolean;
}

export const EditableRow: React.FC<EditableRowProps> = ({
    label,
    value,
    onChangeText,
    placeholder,
    keyboardType,
    isCurrency,
}) => {
    const [localValue, setLocalValue] = useState(value);

    useEffect(() => {
        setLocalValue(value);
    }, [value]);

    const handleChange = (text: string) => {
        if (isCurrency) {
            // Remove non-numeric characters for currency
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
            <View style={styles.inputWrapper}>
                <TextInput
                    style={styles.input}
                    value={displayValue}
                    onChangeText={handleChange}
                    placeholder={placeholder}
                    keyboardType={keyboardType === 'numeric' ? 'number-pad' : 'default'}
                    placeholderTextColor={Colors.subText}
                />
                {isCurrency && <Text style={styles.currencySymbol}>원</Text>}
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
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
});

export default EditableRow;
