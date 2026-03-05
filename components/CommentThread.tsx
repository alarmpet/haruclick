import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, FlatList, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { Colors } from '../constants/Colors';
import { Ionicons } from '@expo/vector-icons';
import { getEventComments, postEventComment, subscribeToEventComments, unsubscribeFromEventComments, EventComment } from '../services/supabase-modules/event_comments';
import { useTheme } from '../contexts/ThemeContext';
import { supabase } from '../services/supabase';

interface CommentThreadProps {
    eventId: string;
}

export const CommentThread: React.FC<CommentThreadProps> = ({ eventId }) => {
    const { colors, isDark } = useTheme();
    const [comments, setComments] = useState<EventComment[]>([]);
    const [inputText, setInputText] = useState('');
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [currentUserId, setCurrentUserId] = useState<string | null>(null);
    const flatListRef = useRef<FlatList>(null);

    useEffect(() => {
        setup();
        const channel = subscribeToEventComments(eventId, (newComment) => {
            setComments(prev => {
                // 중복 방지 (본인이 쓴 글이 로컬에 먼저 추가된 경우 대비)
                if (prev.find(c => c.id === newComment.id)) return prev;
                return [...prev, newComment];
            });
            setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
        });

        return () => {
            unsubscribeFromEventComments(channel);
        };
    }, [eventId]);

    const setup = async () => {
        setLoading(true);
        const { data: { user } } = await supabase.auth.getUser();
        setCurrentUserId(user?.id || null);

        const loadedComments = await getEventComments(eventId);
        setComments(loadedComments);
        setLoading(false);
        setTimeout(() => flatListRef.current?.scrollToEnd({ animated: false }), 100);
    };

    const handleSend = async () => {
        if (!inputText.trim() || submitting) return;
        setSubmitting(true);

        const success = await postEventComment(eventId, inputText);
        if (success) {
            setInputText('');
            setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
        }
        setSubmitting(false);
    };

    const renderEmpty = () => {
        if (loading) return <ActivityIndicator style={{ marginTop: 20 }} color={Colors.light.tint} />;
        return (
            <View style={styles.emptyContainer}>
                <Ionicons name="chatbubbles-outline" size={32} color={colors.subText} />
                <Text style={[styles.emptyText, { color: colors.subText }]}>첫 댓글을 남겨보세요!</Text>
            </View>
        );
    };

    const renderComment = ({ item }: { item: EventComment }) => {
        const isMine = item.user_id === currentUserId;
        const timeStr = new Date(item.created_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
        const name = item.user_profile?.display_name || '익명 사용자';

        return (
            <View style={[styles.commentRow, isMine ? styles.myRow : styles.otherRow]}>
                {!isMine && (
                    <View style={[styles.avatar, { backgroundColor: isDark ? '#333' : '#E5E5EA' }]}>
                        <Text style={styles.avatarText}>{name.substring(0, 1)}</Text>
                    </View>
                )}
                <View style={[styles.bubbleContainer, isMine ? styles.myBubble : styles.otherBubble, { backgroundColor: isMine ? Colors.light.tint : (isDark ? '#2C2C2E' : '#F2F2F7') }]}>
                    {!isMine && <Text style={[styles.authorName, { color: isDark ? '#FFF' : '#8E8E93' }]}>{name}</Text>}
                    <Text style={[styles.commentText, { color: isMine ? '#FFF' : colors.text }]}>{item.content}</Text>
                </View>
                <Text style={styles.timeText}>{timeStr}</Text>
            </View>
        );
    };

    return (
        <KeyboardAvoidingView
            style={[styles.container, { backgroundColor: colors.card }]}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
            <View style={[styles.header, { borderBottomColor: colors.border }]}>
                <Text style={[styles.headerTitle, { color: colors.text }]}>커뮤니티 Пи드</Text>
            </View>

            <FlatList
                ref={flatListRef}
                data={comments}
                keyExtractor={(item) => item.id}
                renderItem={renderComment}
                ListEmptyComponent={renderEmpty}
                contentContainerStyle={styles.listContent}
                showsVerticalScrollIndicator={false}
            />

            <View style={[styles.inputContainer, { borderTopColor: colors.border }]}>
                <TextInput
                    style={[styles.input, { backgroundColor: isDark ? '#1C1C1E' : '#F2F2F7', color: colors.text }]}
                    placeholder="이 일정에 대해 이야기해 보세요..."
                    placeholderTextColor={colors.subText}
                    value={inputText}
                    onChangeText={setInputText}
                    multiline
                    maxLength={500}
                />
                <TouchableOpacity
                    style={[styles.sendButton, { opacity: inputText.trim() ? 1 : 0.5, backgroundColor: Colors.light.tint }]}
                    onPress={handleSend}
                    disabled={!inputText.trim() || submitting}
                >
                    {submitting ? (
                        <ActivityIndicator size="small" color="#FFF" />
                    ) : (
                        <Ionicons name="arrow-up" size={18} color="#FFF" />
                    )}
                </TouchableOpacity>
            </View>
        </KeyboardAvoidingView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        borderTopLeftRadius: 16,
        borderTopRightRadius: 16,
        overflow: 'hidden',
    },
    header: {
        padding: 16,
        borderBottomWidth: 1,
    },
    headerTitle: {
        fontSize: 16,
        fontWeight: 'bold',
    },
    listContent: {
        padding: 16,
        paddingBottom: 24,
    },
    emptyContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 32,
    },
    emptyText: {
        marginTop: 8,
        fontSize: 14,
    },
    commentRow: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        marginBottom: 16,
        maxWidth: '85%',
    },
    myRow: {
        alignSelf: 'flex-end',
        justifyContent: 'flex-end',
    },
    otherRow: {
        alignSelf: 'flex-start',
    },
    avatar: {
        width: 32,
        height: 32,
        borderRadius: 16,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 8,
    },
    avatarText: {
        fontSize: 14,
        fontWeight: 'bold',
        color: '#8E8E93',
    },
    bubbleContainer: {
        padding: 12,
        borderRadius: 16,
    },
    myBubble: {
        borderBottomRightRadius: 4,
    },
    otherBubble: {
        borderBottomLeftRadius: 4,
    },
    authorName: {
        fontSize: 12,
        fontWeight: 'bold',
        marginBottom: 4,
    },
    commentText: {
        fontSize: 15,
        lineHeight: 20,
    },
    timeText: {
        fontSize: 10,
        color: '#8E8E93',
        marginHorizontal: 8,
        marginBottom: 4,
    },
    inputContainer: {
        flexDirection: 'row',
        padding: 12,
        paddingBottom: Platform.OS === 'ios' ? 24 : 12,
        borderTopWidth: 1,
        alignItems: 'flex-end',
    },
    input: {
        flex: 1,
        minHeight: 40,
        maxHeight: 120,
        borderRadius: 20,
        paddingHorizontal: 16,
        paddingTop: 10,
        paddingBottom: 10,
        fontSize: 15,
    },
    sendButton: {
        width: 36,
        height: 36,
        borderRadius: 18,
        justifyContent: 'center',
        alignItems: 'center',
        marginLeft: 12,
        marginBottom: 2,
    },
});
