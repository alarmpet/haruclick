import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    FlatList,
    TextInput,
    TouchableOpacity,
    KeyboardAvoidingView,
    Platform,
    ActivityIndicator,
    Alert,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../../constants/Colors';
import {
    ChatMessage,
    ChatCursor,
    ChatRealtimeStatus,
    MemberProfile,
    getMessages,
    sendMessage,
    getMembersWithProfile,
    subscribeToChat,
    unsubscribeFromChat,
} from '../../../services/supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../../../services/supabase';
import { MessageBubble } from '../../../components/chat/MessageBubble';

const PAGE_SIZE = 40;

interface PendingMessage extends ChatMessage {
    status?: 'pending' | 'sent' | 'failed';
    tempId?: string;
}

export default function ChatScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const router = useRouter();
    const flatListRef = useRef<FlatList>(null);
    const channelRef = useRef<RealtimeChannel | null>(null);

    const [messages, setMessages] = useState<(ChatMessage | PendingMessage)[]>([]);
    const [members, setMembers] = useState<MemberProfile[]>([]);
    const [inputText, setInputText] = useState('');
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [hasMore, setHasMore] = useState(true);
    const [sending, setSending] = useState(false);
    const [currentUserId, setCurrentUserId] = useState<string | null>(null);
    const [realtimeStatus, setRealtimeStatus] = useState<ChatRealtimeStatus | null>(null);

    const seenMessageIds = useRef(new Set<string>());
    const pendingMessages = useRef(new Map<string, PendingMessage>());

    useEffect(() => {
        void initChat();
        return () => {
            cleanup();
        };
    }, [id]);

    const initChat = async () => {
        if (!id) {
            setLoading(false);
            Alert.alert('오류', '잘못된 채팅방 경로입니다.');
            router.back();
            return;
        }

        try {
            setLoading(true);
            seenMessageIds.current.clear();

            const {
                data: { user },
            } = await supabase.auth.getUser();

            if (!user) {
                Alert.alert('오류', '로그인이 필요합니다.');
                router.back();
                return;
            }
            setCurrentUserId(user.id);

            const initialMessages = await getMessages(id, PAGE_SIZE);
            initialMessages.forEach((msg) => seenMessageIds.current.add(msg.id));
            setMessages(initialMessages);
            setHasMore(initialMessages.length === PAGE_SIZE);

            const memberList = await getMembersWithProfile(id);
            setMembers(memberList);

            const channel = subscribeToChat(id, handleNewMessage, setRealtimeStatus);
            channelRef.current = channel;

            if (initialMessages.length > 0) {
                setTimeout(() => {
                    flatListRef.current?.scrollToEnd({ animated: false });
                }, 50);
            }
        } catch (error) {
            console.error('[initChat] Error:', error);
            Alert.alert('오류', '채팅을 불러오지 못했습니다.');
        } finally {
            setLoading(false);
        }
    };

    const handleNewMessage = useCallback((newMsg: ChatMessage) => {
        if (seenMessageIds.current.has(newMsg.id)) return;

        seenMessageIds.current.add(newMsg.id);

        // Remove pending message if it exists (optimistic update confirmed)
        const tempId = Array.from(pendingMessages.current.entries())
            .find(([, pending]) => pending.message === newMsg.message)?.[0];

        if (tempId) {
            pendingMessages.current.delete(tempId);
            setMessages((prev) => [
                ...prev.filter(m => m.id !== tempId),
                newMsg
            ]);
        } else {
            setMessages((prev) => [...prev, newMsg]);
        }

        setTimeout(() => {
            flatListRef.current?.scrollToEnd({ animated: true });
        }, 100);
    }, []);

    const cleanup = () => {
        if (channelRef.current) {
            void unsubscribeFromChat(channelRef.current);
            channelRef.current = null;
        }
    };

    const loadOlderMessages = async () => {
        if (!id || loadingMore || !hasMore || messages.length === 0) return;

        const oldest = messages[0];
        const cursor: ChatCursor = {
            created_at: new Date(oldest.created_at).toISOString(),
            id: oldest.id,
        };

        try {
            setLoadingMore(true);
            const olderMessages = await getMessages(id, PAGE_SIZE, cursor);
            const uniqueOlder = olderMessages.filter((msg) => !seenMessageIds.current.has(msg.id));

            uniqueOlder.forEach((msg) => seenMessageIds.current.add(msg.id));

            if (uniqueOlder.length > 0) {
                setMessages((prev) => [...uniqueOlder, ...prev]);
            }

            setHasMore(olderMessages.length === PAGE_SIZE);
        } catch (error) {
            console.error('[loadOlderMessages] Error:', error);
            Alert.alert('오류', '이전 메시지를 불러오지 못했습니다.');
        } finally {
            setLoadingMore(false);
        }
    };

    const handleSend = async () => {
        if (!inputText.trim() || !id || !currentUserId) return;

        const messageText = inputText.trim();
        const tempId = `temp-${Date.now()}-${Math.random()}`;

        const pendingMsg: PendingMessage = {
            id: tempId,
            calendar_id: id,
            user_id: currentUserId,
            message: messageText,
            type: 'text',
            created_at: new Date().toISOString(),
            status: 'pending',
            tempId,
        };

        // Optimistic update: show message immediately
        pendingMessages.current.set(tempId, pendingMsg);
        setMessages((prev) => [...prev, pendingMsg]);
        setInputText('');
        setSending(true);

        setTimeout(() => {
            flatListRef.current?.scrollToEnd({ animated: true });
        }, 50);

        try {
            await sendMessage(id, messageText);
            // Success - message will arrive via Realtime and handleNewMessage will clean up
        } catch (error) {
            console.error('[handleSend] Error:', error);
            // Mark as failed
            const failedMsg = { ...pendingMsg, status: 'failed' as const };
            pendingMessages.current.set(tempId, failedMsg);
            setMessages((prev) =>
                prev.map((m) => (m.id === tempId ? failedMsg : m))
            );
            Alert.alert('오류', '메시지 전송에 실패했습니다.');
        } finally {
            setSending(false);
        }
    };

    const handleRetry = async (failedMessage: PendingMessage) => {
        if (!id || !failedMessage.tempId) return;

        const tempId = failedMessage.tempId;
        const messageText = failedMessage.message;

        // Update to pending
        const retryMsg = { ...failedMessage, status: 'pending' as const };
        pendingMessages.current.set(tempId, retryMsg);
        setMessages((prev) =>
            prev.map((m) => (m.id === tempId ? retryMsg : m))
        );

        try {
            await sendMessage(id, messageText);
        } catch (error) {
            console.error('[handleRetry] Error:', error);
            const failedMsg = { ...failedMessage, status: 'failed' as const };
            pendingMessages.current.set(tempId, failedMsg);
            setMessages((prev) =>
                prev.map((m) => (m.id === tempId ? failedMsg : m))
            );
            Alert.alert('오류', '재전송에 실패했습니다.');
        }
    };

    const getMemberName = useCallback((userId: string): string => {
        const member = members.find((m) => m.user_id === userId);
        return member?.display_name || '익명';
    }, [members]);

    const formatDateSeparator = useCallback((value: string): string => {
        const target = new Date(value);
        const today = new Date();
        const yesterday = new Date();
        yesterday.setDate(today.getDate() - 1);

        if (target.toDateString() === today.toDateString()) return '오늘';
        if (target.toDateString() === yesterday.toDateString()) return '어제';

        return target.toLocaleDateString('ko-KR', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            weekday: 'short',
        });
    }, []);

    const keyExtractor = useCallback((item: ChatMessage) => item.id, []);

    const renderMessage = useCallback(({ item, index }: { item: ChatMessage; index: number }) => {
        const isMe = item.user_id === currentUserId;
        const senderName = getMemberName(item.user_id);
        const prevMessage = index > 0 ? messages[index - 1] : null;
        const showDateSeparator =
            !prevMessage ||
            new Date(prevMessage.created_at).toDateString() !== new Date(item.created_at).toDateString();

        const pendingItem = item as PendingMessage;
        const isFailed = pendingItem.status === 'failed';

        return (
            <MessageBubble
                message={item}
                isMe={isMe}
                senderName={senderName}
                showDateSeparator={showDateSeparator}
                dateSeparatorText={showDateSeparator ? formatDateSeparator(item.created_at) : undefined}
                onRetry={isFailed ? () => handleRetry(pendingItem) : undefined}
            />
        );
    }, [currentUserId, getMemberName, messages, formatDateSeparator, handleRetry]);

    if (loading) {
        return (
            <View style={styles.center}>
                <ActivityIndicator size="large" color={Colors.primary} />
            </View>
        );
    }

    return (
        <KeyboardAvoidingView
            style={styles.container}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
        >
            <Stack.Screen
                options={{
                    title: '채팅',
                    headerStyle: { backgroundColor: Colors.white },
                    headerShadowVisible: false,
                    headerTintColor: Colors.navy,
                }}
            />

            {realtimeStatus && realtimeStatus !== 'SUBSCRIBED' && (
                <View style={styles.connectionBanner}>
                    <Text style={styles.connectionBannerText}>
                        {realtimeStatus === 'TIMED_OUT' && '연결 지연 중입니다. 재시도 중...'}
                        {realtimeStatus === 'CHANNEL_ERROR' && '채팅 연결 오류가 발생했습니다.'}
                        {realtimeStatus === 'CLOSED' && '채팅 연결이 종료되었습니다.'}
                    </Text>
                </View>
            )}

            <FlatList
                testID="chat-message-list"
                ref={flatListRef}
                data={messages}
                renderItem={renderMessage}
                keyExtractor={keyExtractor}
                initialNumToRender={15}
                maxToRenderPerBatch={10}
                windowSize={5}
                removeClippedSubviews={Platform.OS === 'android'}
                maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
                contentContainerStyle={styles.messageList}
                ListHeaderComponent={
                    messages.length > 0 ? (
                        <View style={styles.loadMoreContainer}>
                            {hasMore ? (
                                <TouchableOpacity
                                    testID="chat-load-older-button"
                                    style={styles.loadMoreButton}
                                    onPress={loadOlderMessages}
                                    disabled={loadingMore}
                                >
                                    {loadingMore ? (
                                        <ActivityIndicator size="small" color={Colors.primary} />
                                    ) : (
                                        <Text style={styles.loadMoreText}>이전 메시지 불러오기</Text>
                                    )}
                                </TouchableOpacity>
                            ) : (
                                <Text style={styles.loadMoreDoneText}>처음 메시지입니다.</Text>
                            )}
                        </View>
                    ) : null
                }
                ListEmptyComponent={
                    <View style={styles.emptyContainer}>
                        <Text style={styles.emptyText}>아직 메시지가 없습니다.</Text>
                        <Text style={styles.emptySubtext}>첫 메시지를 보내보세요.</Text>
                    </View>
                }
            />

            <View style={styles.inputContainer}>
                <TextInput
                    testID="chat-message-input"
                    style={styles.input}
                    value={inputText}
                    onChangeText={setInputText}
                    placeholder="메시지를 입력하세요..."
                    placeholderTextColor={Colors.subText}
                    multiline
                    maxLength={2000}
                />
                <TouchableOpacity
                    testID="chat-send-button"
                    style={[styles.sendButton, (!inputText.trim() || sending) && styles.sendButtonDisabled]}
                    onPress={handleSend}
                    disabled={!inputText.trim() || sending}
                >
                    {sending ? (
                        <ActivityIndicator size="small" color={Colors.white} />
                    ) : (
                        <Ionicons name="send" size={20} color={Colors.white} />
                    )}
                </TouchableOpacity>
            </View>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.background,
    },
    center: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    messageList: {
        padding: 16,
    },
    connectionBanner: {
        backgroundColor: '#FEF3C7',
        borderBottomWidth: 1,
        borderBottomColor: '#FDE68A',
        paddingHorizontal: 12,
        paddingVertical: 8,
    },
    connectionBannerText: {
        color: '#92400E',
        fontSize: 12,
        textAlign: 'center',
    },
    loadMoreContainer: {
        alignItems: 'center',
        marginBottom: 12,
    },
    loadMoreButton: {
        backgroundColor: Colors.white,
        borderWidth: 1,
        borderColor: Colors.border,
        borderRadius: 9999,
        paddingHorizontal: 14,
        paddingVertical: 8,
        minWidth: 150,
        alignItems: 'center',
    },
    loadMoreText: {
        color: Colors.primary,
        fontSize: 13,
        fontWeight: '600',
    },
    loadMoreDoneText: {
        color: Colors.subText,
        fontSize: 12,
    },
    dateSeparator: {
        alignItems: 'center',
        marginBottom: 12,
    },
    dateSeparatorText: {
        fontSize: 12,
        color: Colors.subText,
        backgroundColor: Colors.white,
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 9999,
        overflow: 'hidden',
    },
    messageBubbleContainer: {
        marginBottom: 16,
        maxWidth: '80%',
    },
    myMessageContainer: {
        alignSelf: 'flex-end',
    },
    senderName: {
        fontSize: 12,
        color: Colors.subText,
        marginBottom: 4,
        marginLeft: 8,
    },
    messageBubble: {
        padding: 12,
        borderRadius: 16,
    },
    myBubble: {
        backgroundColor: Colors.primary,
        borderBottomRightRadius: 4,
    },
    otherBubble: {
        backgroundColor: Colors.white,
        borderBottomLeftRadius: 4,
    },
    messageText: {
        fontSize: 15,
        lineHeight: 20,
    },
    myText: {
        color: Colors.white,
    },
    otherText: {
        color: Colors.text,
    },
    timestamp: {
        fontSize: 10,
        color: Colors.subText,
        marginTop: 4,
        marginLeft: 8,
    },
    myTimestamp: {
        textAlign: 'right',
        marginRight: 8,
        marginLeft: 0,
    },
    inputContainer: {
        flexDirection: 'row',
        padding: 12,
        backgroundColor: Colors.white,
        borderTopWidth: 1,
        borderTopColor: Colors.border,
        alignItems: 'flex-end',
    },
    input: {
        flex: 1,
        backgroundColor: Colors.background,
        borderRadius: 20,
        paddingHorizontal: 16,
        paddingVertical: 10,
        fontSize: 15,
        maxHeight: 100,
        marginRight: 8,
    },
    sendButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: Colors.primary,
        justifyContent: 'center',
        alignItems: 'center',
    },
    sendButtonDisabled: {
        opacity: 0.5,
    },
    emptyContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingVertical: 60,
    },
    emptyText: {
        fontSize: 16,
        color: Colors.subText,
        marginBottom: 8,
    },
    emptySubtext: {
        fontSize: 14,
        color: Colors.lightGray,
    },
});
