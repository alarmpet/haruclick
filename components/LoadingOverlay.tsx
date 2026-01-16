// components/LoadingOverlay.tsx
import React, { createContext, useContext, useState, ReactNode } from 'react';
import { View, Text, ActivityIndicator, StyleSheet, Modal } from 'react-native';
import { Colors } from '../constants/Colors';

type LoadingContextType = {
    show: (message?: string) => void;
    hide: () => void;
};

const LoadingContext = createContext<LoadingContextType | undefined>(undefined);

export const LoadingProvider = ({ children }: { children: ReactNode }) => {
    const [visible, setVisible] = useState(false);
    const [message, setMessage] = useState('');

    const show = (msg?: string) => {
        setMessage(msg ?? '');
        setVisible(true);
    };
    const hide = () => setVisible(false);

    return (
        <LoadingContext.Provider value={{ show, hide }}>
            {children}
            <Modal transparent visible={visible} animationType="fade">
                <View style={styles.overlay}>
                    <ActivityIndicator size="large" color={Colors.white} />
                    {message ? <View style={styles.msgContainer}><Text style={styles.msg}>{message}</Text></View> : null}
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
    msgContainer: { marginTop: 12 },
    msg: { color: Colors.white, fontSize: 16 },
});
