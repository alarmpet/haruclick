import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, ScrollView, Animated, LayoutAnimation, Platform, UIManager } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Colors } from '../constants/Colors';
import { EventRecord } from '../services/supabase';

// Enable LayoutAnimation for Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface TaskListModalProps {
    visible: boolean;
    onClose: () => void;
    tasks: EventRecord[];
    onToggleComplete: (task: EventRecord) => void;
    onAddTask: () => void;
    onDeleteTask: (task: EventRecord) => void;
}

export function TaskListModal({ visible, onClose, tasks, onToggleComplete, onAddTask, onDeleteTask }: TaskListModalProps) {
    const [completedExpanded, setCompletedExpanded] = useState(false);

    // 날짜 포맷 (예: 1주 전, 1일 전, 오늘, 내일 등 - 단순화하여 표시)
    const formatTaskDate = (dateString: string) => {
        const date = new Date(dateString);
        const today = new Date();
        const diffTime = date.getTime() - today.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays === 0) return '오늘';
        if (diffDays === 1) return '내일';
        if (diffDays < 0) return `${Math.abs(diffDays)}일 전`;
        return `${diffDays}일 후`;
    };

    const isOverdue = (dateString: string) => {
        const date = new Date(dateString);
        const today = new Date();
        // 오늘 날짜의 00:00:00으로 설정하여 정확한 비교
        today.setHours(0, 0, 0, 0);
        date.setHours(0, 0, 0, 0);
        return date < today;
    };

    // 완료/미완료 분리
    const { incompleteTasks, completedTasks } = useMemo(() => {
        const incomplete = tasks.filter(t => !t.isCompleted).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        const completed = tasks.filter(t => t.isCompleted).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        return { incompleteTasks: incomplete, completedTasks: completed };
    }, [tasks]);

    const toggleCompletedSection = () => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setCompletedExpanded(!completedExpanded);
    };

    return (
        <Modal
            visible={visible}
            animationType="slide"
            presentationStyle="pageSheet" // iOS only
            onRequestClose={onClose}
        >
            <View style={styles.container}>
                {/* Header */}
                <View style={styles.header}>
                    <TouchableOpacity onPress={onClose} style={styles.headerButton}>
                        <Ionicons name="arrow-back" size={24} color="#fff" />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>내 할 일 목록</Text>
                    <TouchableOpacity style={styles.headerButton}>
                        <View style={styles.profileIcon}>
                            <Text style={styles.profileText}>M</Text>
                        </View>
                    </TouchableOpacity>
                </View>

                <ScrollView style={styles.content} contentContainerStyle={{ paddingBottom: 100 }}>
                    {/* Incomplete Tasks */}
                    {incompleteTasks.map((task) => (
                        <View key={task.id} style={styles.taskItem}>
                            <TouchableOpacity
                                style={styles.checkbox}
                                onPress={() => onToggleComplete(task)}
                            >
                                <View style={styles.checkboxInner} />
                            </TouchableOpacity>
                            <View style={styles.taskInfo}>
                                <Text style={styles.taskTitle}>{task.name}</Text>
                                {task.memo && <Text style={styles.taskDesc} numberOfLines={1}>{task.memo}</Text>}
                                <Text style={[styles.taskDate, isOverdue(task.date) && styles.overdueText]}>
                                    {formatTaskDate(task.date)}
                                </Text>
                            </View>
                            <TouchableOpacity style={styles.starButton}>
                                <Ionicons name="star-outline" size={20} color={Colors.subText} />
                            </TouchableOpacity>
                        </View>
                    ))}

                    {/* Empty State for Incomplete */}
                    {incompleteTasks.length === 0 && completedTasks.length === 0 && (
                        <View style={styles.emptyState}>
                            <Ionicons name="checkmark-done-circle-outline" size={64} color="#444" />
                            <Text style={styles.emptyText}>할 일이 없습니다.</Text>
                            <Text style={styles.emptySubText}>새로운 할 일을 추가해보세요!</Text>
                        </View>
                    )}

                    {/* Completed Section Divider */}
                    {completedTasks.length > 0 && (
                        <View style={styles.completedSection}>
                            <TouchableOpacity style={styles.completedHeader} onPress={toggleCompletedSection}>
                                <Text style={styles.completedHeaderText}>완료됨 ({completedTasks.length})</Text>
                                <Ionicons name={completedExpanded ? "chevron-up" : "chevron-down"} size={20} color="#fff" />
                            </TouchableOpacity>

                            {completedExpanded && (
                                <View style={styles.completedList}>
                                    {completedTasks.map((task) => (
                                        <View key={task.id} style={[styles.taskItem, styles.completedItem]}>
                                            <TouchableOpacity
                                                style={styles.checkbox}
                                                onPress={() => onToggleComplete(task)}
                                            >
                                                <Ionicons name="checkmark" size={18} color={Colors.navy} style={styles.checkedIcon} />
                                            </TouchableOpacity>
                                            <View style={styles.taskInfo}>
                                                <Text style={[styles.taskTitle, styles.completedText]}>{task.name}</Text>
                                                <Text style={styles.taskDate}>{formatTaskDate(task.date)}</Text>
                                            </View>
                                            <TouchableOpacity onPress={() => onDeleteTask(task)} style={{ padding: 4 }}>
                                                <Ionicons name="trash-outline" size={18} color="#666" />
                                            </TouchableOpacity>
                                        </View>
                                    ))}
                                </View>
                            )}
                        </View>
                    )}
                </ScrollView>

                {/* FAB */}
                <TouchableOpacity style={styles.fab} onPress={onAddTask}>
                    <Ionicons name="add" size={32} color="#4A90D9" />
                </TouchableOpacity>

                {/* Bottom Bar (Google Tasks style decoration) */}
                <View style={styles.bottomBar}>
                    <Text style={styles.bottomBarText}>내 할 일 목록</Text>
                    <TouchableOpacity onPress={onAddTask}>
                        <Ionicons name="create-outline" size={24} color="#bbb" />
                    </TouchableOpacity>
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#1E1E1E', // Dark background like Google Tasks
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingTop: 60, // Safe area
        paddingBottom: 20,
    },
    headerButton: {
        padding: 8,
    },
    headerTitle: {
        flex: 1,
        fontSize: 24,
        fontFamily: 'Pretendard-Bold',
        color: '#fff',
        marginLeft: 16,
    },
    profileIcon: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: '#FF6B6B',
        justifyContent: 'center',
        alignItems: 'center',
    },
    profileText: {
        color: '#fff',
        fontWeight: 'bold',
    },
    content: {
        flex: 1,
    },
    taskItem: {
        flexDirection: 'row',
        alignItems: 'flex-start', // Align top for multiline
        paddingVertical: 12,
        paddingHorizontal: 20,
        marginBottom: 8,
    },
    checkbox: {
        width: 24,
        height: 24,
        borderRadius: 12,
        borderWidth: 2,
        borderColor: '#ccc',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 16,
        marginTop: 2,
    },
    checkboxInner: {
        width: 0,
        height: 0,
    },
    checkedIcon: {
        backgroundColor: '#A8C8F9', // Light blue fill
        width: 24,
        height: 24,
        borderRadius: 12,
        textAlign: 'center',
        lineHeight: 24,
        overflow: 'hidden',
        color: '#003366'
    },
    taskInfo: {
        flex: 1,
    },
    taskTitle: {
        fontSize: 16,
        fontFamily: 'Pretendard-Medium',
        color: '#fff',
        marginBottom: 4,
    },
    taskDesc: {
        fontSize: 14,
        fontFamily: 'Pretendard-Regular',
        color: '#aaa',
        marginBottom: 4,
    },
    taskDate: {
        fontSize: 12,
        fontFamily: 'Pretendard-Regular',
        color: '#A8C8F9', // Light blue accent
    },
    overdueText: {
        color: '#FF8A80', // Light red for overdue
    },
    starButton: {
        padding: 4,
    },
    // Completed Section
    completedSection: {
        marginTop: 10,
        borderTopWidth: 1,
        borderTopColor: '#333',
    },
    completedHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingVertical: 16,
    },
    completedHeaderText: {
        color: '#fff',
        fontSize: 14,
        fontFamily: 'Pretendard-Medium',
    },
    completedList: {
        overflow: 'hidden',
    },
    completedItem: {
        opacity: 0.6,
    },
    completedText: {
        textDecorationLine: 'line-through',
        color: '#888',
    },
    // FAB
    fab: {
        position: 'absolute',
        bottom: 80,
        right: 24,
        width: 56,
        height: 56,
        borderRadius: 16, // Squircle like Google Tasks
        backgroundColor: '#2D2E30',
        justifyContent: 'center',
        alignItems: 'center',
        elevation: 6,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 4,
        borderWidth: 1,
        borderColor: '#444'
    },
    // Bottom Bar
    bottomBar: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: 60,
        backgroundColor: '#2D2E30',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        borderTopWidth: 1,
        borderTopColor: '#333',
    },
    bottomBarText: {
        color: '#fff',
        fontSize: 16,
        fontFamily: 'Pretendard-Bold',
    },
    emptyState: {
        alignItems: 'center',
        marginTop: 100,
        opacity: 0.5
    },
    emptyText: {
        color: '#fff',
        fontSize: 18,
        marginTop: 16,
        fontFamily: 'Pretendard-Bold'
    },
    emptySubText: {
        color: '#aaa',
        fontSize: 14,
        marginTop: 8,
        fontFamily: 'Pretendard-Regular'
    }
});
