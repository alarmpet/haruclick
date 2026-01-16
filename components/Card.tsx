import { View, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { Colors } from '../constants/Colors';

interface CardProps {
    children: React.ReactNode;
    style?: StyleProp<ViewStyle>;
}

export function Card({ children, style }: CardProps) {
    return <View style={[styles.card, style]}>{children}</View>;
}

const styles = StyleSheet.create({
    card: {
        backgroundColor: Colors.white,
        borderRadius: 16,
        padding: 24,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.04,
        shadowRadius: 16,
        elevation: 3,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: Colors.border,
    },
});
