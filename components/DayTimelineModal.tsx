import { Modal, View, Text, StyleSheet, TouchableOpacity, ScrollView, Dimensions } from 'react-native';
import { BlurView } from 'expo-blur';
import { Colors } from '../constants/Colors';
import { Ionicons } from '@expo/vector-icons';
import { EventRecord } from '../services/supabase';
import { EventTimeline } from './EventTimeline';

interface DayTimelineModalProps {
    visible: boolean;
    date: string; // YYYY-MM-DD
    events: EventRecord[];
    onClose: () => void;
    onEventsChange?: () => void;
}

const { width, height } = Dimensions.get('window');

export function DayTimelineModal({ visible, date, events, onClose, onEventsChange }: DayTimelineModalProps) {
    if (!visible) return null;

    const [year, month, day] = date.split('-');

    // ✅ 외부 캘린더 일정(공휴일 등)은 타임라인에서 숨김 - 월별 캘린더에서만 표시
    const filteredEvents = events.filter(e => e.source !== 'external');

    return (
        <Modal
            visible={visible}
            animationType="slide"
            transparent={true}
            onRequestClose={onClose}
        >
            <View style={styles.overlay}>
                {/* 
                   Background can be dismissed by touching outside? 
                   Maybe better to have a close button explicitly.
                */}
                <TouchableOpacity style={styles.backdrop} onPress={onClose} activeOpacity={1} />

                <View style={styles.modalContent}>
                    <View style={styles.header}>
                        <View>
                            <Text style={styles.dateTitle}>{month}월 {day}일</Text>
                            <Text style={styles.dateSubtitle}>{year}년</Text>
                        </View>
                        <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                            <Ionicons name="close" size={24} color={Colors.text} />
                        </TouchableOpacity>
                    </View>

                    <ScrollView style={styles.scrollContent} showsVerticalScrollIndicator={false}>
                        <EventTimeline
                            events={filteredEvents}
                            title="하루 타임라인"
                            onEventsChange={onEventsChange}
                        />
                        <View style={{ height: 40 }} />
                    </ScrollView>
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        justifyContent: 'flex-end',
        backgroundColor: 'rgba(0, 0, 0, 0.4)',
    },
    backdrop: {
        ...StyleSheet.absoluteFillObject,
    },
    modalContent: {
        backgroundColor: Colors.background,
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        height: height * 0.75, // 75% height
        padding: 20,
        paddingTop: 24,
        shadowColor: "#000",
        shadowOffset: {
            width: 0,
            height: -4,
        },
        shadowOpacity: 0.1,
        shadowRadius: 10,
        elevation: 5,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 20,
        paddingHorizontal: 4,
    },
    dateTitle: {
        fontFamily: 'Pretendard-Bold',
        fontSize: 24,
        color: Colors.text,
    },
    dateSubtitle: {
        fontFamily: 'Pretendard-Medium',
        fontSize: 14,
        color: Colors.subText,
        marginTop: 2,
    },
    closeButton: {
        padding: 8,
        backgroundColor: '#F5F5F5',
        borderRadius: 20,
    },
    scrollContent: {
        flex: 1,
    }
});
