import { StyleSheet } from 'react-native';
import { Colors } from '../constants/Colors';

export const common = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.darkBackground,
        padding: 16,
    },
    button: {
        paddingVertical: 12,
        paddingHorizontal: 24,
        borderRadius: 8,
        backgroundColor: Colors.navy,
        alignItems: 'center',
        justifyContent: 'center',
    },
    buttonText: {
        color: Colors.white,
        fontFamily: 'Pretendard-Bold',
        fontSize: 16,
    },
    card: {
        backgroundColor: Colors.darkCard,
        borderRadius: 12,
        padding: 16,
        shadowColor: '#000',
        shadowOpacity: 0.1,
        shadowRadius: 8,
        elevation: 4,
    },
});
