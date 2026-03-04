import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/Colors';
import type { ChatMessage } from '../../services/supabase';

interface MessageBubbleProps {
    message: ChatMessage & { status?: 'pending' | 'sent' | 'failed'; tempId?: string };
    isMe: boolean;
    senderName: string;
    showDateSeparator?: boolean;
    dateSeparatorText?: string;
    onRetry?: () => void;
}

const formatTime = (timestamp: string): string => {
    return new Date(timestamp).toLocaleTimeString('ko-KR', {
        hour: '2-digit',
        minute: '2-digit',
    });
};

export const MessageBubble = React.memo(({
    message,
    isMe,
    senderName,
    showDateSeparator,
    dateSeparatorText,
    onRetry
}: MessageBubbleProps) => {
    const status = message.status || 'sent';
    const isPending = status === 'pending';
    const isFailed = status === 'failed';

    return (
        <View>
            {showDateSeparator && dateSeparatorText && (
                <View style={styles.dateSeparator}>
                    <Text style={styles.dateSeparatorText}>{dateSeparatorText}</Text>
                </View>
            )}

            <View style={[styles.messageBubbleContainer, isMe && styles.myMessageContainer]}>
                {!isMe && <Text style={styles.senderName}>{senderName}</Text>}
                <View style={styles.bubbleRow}>
                    <View style={[
                        styles.messageBubble,
                        isMe ? styles.myBubble : styles.otherBubble,
                        isFailed && styles.failedBubble
                    ]}>
                        <Text style={[
                            styles.messageText,
                            isMe ? styles.myText : styles.otherText,
                            isFailed && styles.failedText
                        ]}>
                            {message.message}
                        </Text>
                    </View>
                    {isPending && (
                        <ActivityIndicator
                            size="small"
                            color={Colors.subText}
                            style={styles.statusIndicator}
                        />
                    )}
                    {isFailed && onRetry && (
                        <TouchableOpacity
                            onPress={onRetry}
                            style={styles.retryButton}
                            activeOpacity={0.7}
                        >
                            <Ionicons name="refresh" size={16} color={Colors.danger} />
                        </TouchableOpacity>
                    )}
                </View>
                <View style={styles.timestampRow}>
                    <Text style={[styles.timestamp, isMe && styles.myTimestamp]}>
                        {formatTime(message.created_at)}
                    </Text>
                    {isFailed && (
                        <Text style={styles.failedLabel}> • 전송 실패</Text>
                    )}
                </View>
            </View>
        </View>
    );
});

MessageBubble.displayName = 'MessageBubble';

const styles = StyleSheet.create({
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
    bubbleRow: {
        flexDirection: 'row',
        alignItems: 'center',
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
    failedBubble: {
        backgroundColor: '#FFEBEE',
        borderWidth: 1,
        borderColor: '#FFCDD2',
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
    failedText: {
        color: Colors.danger,
    },
    timestampRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 4,
    },
    timestamp: {
        fontSize: 10,
        color: Colors.subText,
        marginLeft: 8,
    },
    myTimestamp: {
        textAlign: 'right',
        marginRight: 8,
        marginLeft: 0,
    },
    failedLabel: {
        fontSize: 10,
        color: Colors.danger,
    },
    statusIndicator: {
        marginLeft: 8,
    },
    retryButton: {
        marginLeft: 8,
        padding: 4,
    },
});
