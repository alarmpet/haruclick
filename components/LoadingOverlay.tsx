import React, { createContext, useContext, useState, ReactNode, useEffect, useRef } from 'react';
import { View, Text, ActivityIndicator, StyleSheet, Modal, Animated } from 'react-native';
import { Colors } from '../constants/Colors';
import { LOADING_TIPS } from '../constants/LoadingTips';

type LoadingContextType = {
    show: (message?: string) => void;
    hide: () => void;
};

const LoadingContext = createContext<LoadingContextType | undefined>(undefined);

const TIP_COLORS = [
    '#FFD700', // Gold
    '#00FFFF', // Cyan
    '#FF69B4', // HotPink
    '#7FFF00', // Chartreuse
    '#FFA500', // Orange
    '#E0B0FF', // Mauve
    '#87CEEB', // SkyBlue
    '#F0E68C', // Khaki
];

const RotatingTip = () => {
    const [index, setIndex] = useState(() => Math.floor(Math.random() * LOADING_TIPS.length));
    const fadeAnim = useRef(new Animated.Value(1)).current;

    useEffect(() => {
        const timer = setInterval(() => {
            // Fade Out
            Animated.timing(fadeAnim, {
                toValue: 0,
                duration: 500,
                useNativeDriver: true,
            }).start(() => {
                // Change Text
                setIndex((prev) => (prev + 1) % LOADING_TIPS.length);
                // Fade In
                Animated.timing(fadeAnim, {
                    toValue: 1,
                    duration: 500,
                    useNativeDriver: true,
                }).start();
            });
        }, 3000); // 3 total cycle (wait + anim)

        return () => clearInterval(timer);
    }, []);

    const tip = LOADING_TIPS[index];
    const color = TIP_COLORS[index % TIP_COLORS.length];

    return (
        <Animated.Text style={[styles.quote, { color, opacity: fadeAnim }]}>
            {tip}
        </Animated.Text>
    );
};

export const LoadingProvider = ({ children }: { children: ReactNode }) => {
    const [visible, setVisible] = useState(false);
    const [message, setMessage] = useState('');
    const [showTip, setShowTip] = useState(false);

    const shouldShowInspiration = (msg: string) => /분석|analysis|analyz/i.test(msg);

    const show = (msg?: string) => {
        const nextMessage = msg ?? '';
        setMessage(nextMessage);
        setShowTip(shouldShowInspiration(nextMessage));
        setVisible(true);
    };
    const hide = () => setVisible(false);

    return (
        <LoadingContext.Provider value={{ show, hide }}>
            {children}
            <Modal transparent visible={visible} animationType="fade">
                <View style={styles.overlay}>
                    <ActivityIndicator size="large" color={Colors.white} />
                    {message ? (
                        <View style={styles.msgContainer}>
                            <Text style={styles.msg}>{message}</Text>
                            {showTip ? <RotatingTip /> : null}
                        </View>
                    ) : null}
                </View>
            </Modal>
        </LoadingContext.Provider>
    );
};

export const useLoading = (): LoadingContextType => {
    const ctx = useContext(LoadingContext);
    if (!ctx) throw new Error('useLoading must be used within LoadingProvider');
    return ctx;
};

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.7)', // Slightly darker for neon colors
        justifyContent: 'center',
        alignItems: 'center',
    },
    msgContainer: { marginTop: 20, alignItems: 'center', paddingHorizontal: 30 },
    msg: { color: Colors.white, fontSize: 18, marginBottom: 12, fontWeight: '600' },
    quote: {
        fontSize: 15,
        marginTop: 8,
        textAlign: 'center',
        fontWeight: 'bold',
        textShadowColor: 'rgba(0, 0, 0, 0.75)',
        textShadowOffset: { width: -1, height: 1 },
        textShadowRadius: 3
    },
});
