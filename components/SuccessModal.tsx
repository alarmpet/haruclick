import { Modal, View, Text, StyleSheet, Animated } from 'react-native';
import { useEffect, useRef } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/Colors';

interface SuccessModalProps {
    visible: boolean;
    title?: string;
    message?: string;
    onComplete?: () => void;
    autoCloseDelay?: number;
}

export function SuccessModal({
    visible,
    title = '저장 완료!',
    message = '캘린더와 장부에 저장되었습니다',
    onComplete,
    autoCloseDelay = 1500,
}: SuccessModalProps) {
    const scaleValue = useRef(new Animated.Value(0)).current;
    const opacityValue = useRef(new Animated.Value(0)).current;
    const checkScale = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        if (visible) {
            // 모달 등장 애니메이션
            Animated.parallel([
                Animated.spring(scaleValue, {
                    toValue: 1,
                    friction: 8,
                    tension: 40,
                    useNativeDriver: true,
                }),
                Animated.timing(opacityValue, {
                    toValue: 1,
                    duration: 200,
                    useNativeDriver: true,
                }),
            ]).start(() => {
                // 체크마크 바운스 애니메이션
                Animated.spring(checkScale, {
                    toValue: 1,
                    friction: 4,
                    tension: 100,
                    useNativeDriver: true,
                }).start();
            });

            // 자동 닫기
            const timer = setTimeout(() => {
                handleClose();
            }, autoCloseDelay);

            return () => clearTimeout(timer);
        } else {
            scaleValue.setValue(0);
            opacityValue.setValue(0);
            checkScale.setValue(0);
        }
    }, [visible, autoCloseDelay]);

    const handleClose = () => {
        Animated.parallel([
            Animated.timing(scaleValue, {
                toValue: 0.8,
                duration: 150,
                useNativeDriver: true,
            }),
            Animated.timing(opacityValue, {
                toValue: 0,
                duration: 150,
                useNativeDriver: true,
            }),
        ]).start(() => {
            onComplete?.();
        });
    };

    if (!visible) return null;

    return (
        <Modal transparent visible={visible} animationType="none">
            <Animated.View style={[styles.overlay, { opacity: opacityValue }]}>
                <Animated.View
                    style={[
                        styles.container,
                        {
                            transform: [{ scale: scaleValue }],
                            opacity: opacityValue,
                        },
                    ]}
                >
                    {/* Success Icon */}
                    <Animated.View
                        style={[
                            styles.iconContainer,
                            { transform: [{ scale: checkScale }] },
                        ]}
                    >
                        <View style={styles.iconCircle}>
                            <Ionicons name="checkmark" size={48} color={Colors.white} />
                        </View>
                    </Animated.View>

                    {/* Text */}
                    <Text style={styles.title}>{title}</Text>
                    <Text style={styles.message}>{message}</Text>
                </Animated.View>
            </Animated.View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.6)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    container: {
        backgroundColor: Colors.white,
        borderRadius: 24,
        padding: 32,
        alignItems: 'center',
        minWidth: 280,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.25,
        shadowRadius: 20,
        elevation: 10,
    },
    iconContainer: {
        marginBottom: 20,
    },
    iconCircle: {
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: Colors.green,
        justifyContent: 'center',
        alignItems: 'center',
    },
    title: {
        fontFamily: 'Pretendard-Bold',
        fontSize: 22,
        color: Colors.text,
        marginBottom: 8,
    },
    message: {
        fontFamily: 'Pretendard-Medium',
        fontSize: 15,
        color: Colors.subText,
        textAlign: 'center',
    },
});
