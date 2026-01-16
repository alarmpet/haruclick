import { TouchableOpacity, StyleSheet, View } from 'react-native';
import { Colors } from '../constants/Colors';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';

export function ScannerFAB() {
    const router = useRouter();

    return (
        <TouchableOpacity
            style={styles.fab}
            activeOpacity={0.8}
            onPress={() => router.push('/scan/universal')}
        >
            <Ionicons name="scan-outline" size={24} color="white" />
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    fab: {
        position: 'absolute',
        bottom: 24,
        left: '50%',
        marginLeft: -32, // Half of width to center
        width: 64,
        height: 64,
        borderRadius: 32,
        backgroundColor: Colors.orange,
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: Colors.orange,
        shadowOffset: {
            width: 0,
            height: 8,
        },
        shadowOpacity: 0.4,
        shadowRadius: 10,
        elevation: 8,
    },
});
