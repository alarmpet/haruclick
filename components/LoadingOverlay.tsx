import React, { createContext, useContext, useState, ReactNode } from 'react';
import { View, Text, ActivityIndicator, StyleSheet, Modal } from 'react-native';
import { Colors } from '../constants/Colors';
import { LOADING_TIPS } from '../constants/LoadingTips';

type LoadingContextType = {
    show: (message?: string) => void;
    hide: () => void;
};

const LoadingContext = createContext<LoadingContextType | undefined>(undefined);

export const LoadingProvider = ({ children }: { children: ReactNode }) => {
    const [visible, setVisible] = useState(false);
    const [message, setMessage] = useState('');
    const [tip, setTip] = useState('');

    const shouldShowInspiration = (msg: string) => /분석|analysis|analyz/i.test(msg);

    const getRandomTip = () => {
        const index = Math.floor(Math.random() * LOADING_TIPS.length);
        return LOADING_TIPS[index];
    };

    const show = (msg?: string) => {
        const nextMessage = msg ?? '';
        setMessage(nextMessage);

        if (shouldShowInspiration(nextMessage)) {
            setTip(getRandomTip());
        } else {
            setTip('');
        }
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
                            {tip ? <Text style={styles.quote}>{tip}</Text> : null}
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
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    msgContainer: { marginTop: 12, alignItems: 'center', paddingHorizontal: 24 },
    msg: { color: Colors.white, fontSize: 16 },
    quote: { color: Colors.white, fontSize: 13, marginTop: 8, opacity: 0.85, textAlign: 'center' },
});
