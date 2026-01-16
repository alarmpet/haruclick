import { View, Text, StyleSheet, TouchableOpacity, StatusBar } from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { Colors } from '../../constants/Colors';
import { useState } from 'react';
import TermsAgreementModal from '../../components/TermsAgreementModal';

export default function WelcomeScreen() {
    const router = useRouter();
    const [showTermsModal, setShowTermsModal] = useState(false);

    const handleStart = () => {
        setShowTermsModal(true);
    };

    const handleTermsAccepted = () => {
        setShowTermsModal(false);
        router.push('/auth/signup');
    };

    const handleLogin = () => {
        router.push('/auth/login');
    };

    return (
        <View style={styles.container}>
            <StatusBar barStyle="light-content" backgroundColor={Colors.darkBackground} />
            <Stack.Screen options={{ headerShown: false }} />

            {/* Logo Area */}
            <View style={styles.logoContainer}>
                <View style={styles.logoIcon}>
                    <Text style={styles.logoEmoji}>📅</Text>
                </View>
                <Text style={styles.logoText}>하루클릭</Text>
            </View>

            {/* Buttons */}
            <View style={styles.buttonContainer}>
                <TouchableOpacity style={styles.startButton} onPress={handleStart}>
                    <Text style={styles.startButtonText}>시작</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.loginButton} onPress={handleLogin}>
                    <Text style={styles.loginButtonText}>로그인</Text>
                </TouchableOpacity>
            </View>

            {/* Terms Modal */}
            <TermsAgreementModal
                visible={showTermsModal}
                onClose={() => setShowTermsModal(false)}
                onAccept={handleTermsAccepted}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.navy, // Changed from darkBackground
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 40,
    },
    logoContainer: {
        alignItems: 'center',
        marginBottom: 80,
    },
    logoIcon: {
        width: 100,
        height: 100,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 16,
    },
    logoEmoji: {
        fontSize: 64,
    },
    logoText: {
        fontFamily: 'Pretendard-Bold',
        fontSize: 36,
        color: Colors.orange, // Changed from primaryGreen
        letterSpacing: 1,
    },
    buttonContainer: {
        width: '100%',
        gap: 16,
    },
    startButton: {
        paddingVertical: 16,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: Colors.orange, // Changed from primaryGreen
        alignItems: 'center',
        backgroundColor: 'transparent',
    },
    startButtonText: {
        fontFamily: 'Pretendard-SemiBold',
        fontSize: 16,
        color: Colors.white,
    },
    loginButton: {
        paddingVertical: 16,
        borderRadius: 12,
        backgroundColor: Colors.orange, // Changed from primaryGreen
        alignItems: 'center',
    },
    loginButtonText: {
        fontFamily: 'Pretendard-SemiBold',
        fontSize: 16,
        color: Colors.white, // Changed from darkBackground (Logic: White text on Orange button is better contrast/brand)
    },
});
