import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { useState, useEffect } from 'react';
import { Colors } from '../constants/Colors';
import { Poll, PollService } from '../services/PollService';
import { VoteService, VoteResults } from '../services/VoteService';
import { VoteResultsBar } from './VoteResultsBar';
import { Ionicons } from '@expo/vector-icons';

interface PollCardProps {
    poll: Poll;
    onVoteSubmitted?: () => void;
    onDeleted?: () => void; // ✅ 삭제 후 콜백 추가
}

export function PollCard({ poll, onVoteSubmitted, onDeleted }: PollCardProps) {
    const [voteResults, setVoteResults] = useState<VoteResults | null>(null);
    const [loading, setLoading] = useState(false);
    const [hasVoted, setHasVoted] = useState(false);

    useEffect(() => {
        loadVoteResults();
    }, [poll.id]);

    const loadVoteResults = async () => {
        const results = await VoteService.getVoteResults(poll.id);
        setVoteResults(results);
    };

    const handleVote = async (amount: number) => {
        setLoading(true);
        const success = await VoteService.submitVote(poll.id, amount);

        if (success) {
            setHasVoted(true);
            await loadVoteResults(); // Refresh results
            onVoteSubmitted?.();
        }

        setLoading(false);
    };

    const formatAmount = (amount: number) => {
        return `${(amount / 10000).toFixed(0)}만`;
    };

    const formatTimeAgo = (dateString: string) => {
        const date = new Date(dateString);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMins / 60);
        const diffDays = Math.floor(diffHours / 24);

        if (diffDays > 0) return `${diffDays}일 전`;
        if (diffHours > 0) return `${diffHours}시간 전`;
        if (diffMins > 0) return `${diffMins}분 전`;
        return '방금 전';
    };

    // ✅ 삭제 핸들러
    const handleDelete = () => {
        Alert.alert(
            '투표 삭제',
            '이 투표를 삭제하시겠습니까?\n삭제하면 복구할 수 없습니다.',
            [
                { text: '취소', style: 'cancel' },
                {
                    text: '삭제',
                    style: 'destructive',
                    onPress: async () => {
                        setLoading(true);
                        const success = await PollService.deletePoll(poll.id);
                        setLoading(false);
                        if (success) {
                            onDeleted?.();
                        } else {
                            Alert.alert('오류', '삭제에 실패했습니다.');
                        }
                    }
                }
            ]
        );
    };

    return (
        <View style={styles.card}>
            {/* Header */}
            <View style={styles.header}>
                <View>
                    <Text style={styles.author}>익명의 작성자</Text>
                    <Text style={styles.time}>{formatTimeAgo(poll.created_at)}</Text>
                </View>
                {/* ✅ 삭제 버튼 */}
                <TouchableOpacity onPress={handleDelete} style={styles.deleteButton}>
                    <Ionicons name="trash-outline" size={20} color={Colors.subText} />
                </TouchableOpacity>
            </View>

            {/* Situation Summary */}
            <Text style={styles.summary}>{poll.situation_summary}</Text>

            {/* Context Info (if available) */}
            {poll.context && (
                <View style={styles.contextContainer}>
                    {poll.context.productName && (
                        <Text style={styles.contextText}>상품: {poll.context.productName}</Text>
                    )}
                    {poll.context.occasion && (
                        <Text style={styles.contextText}>상황: {poll.context.occasion}</Text>
                    )}
                </View>
            )}

            {/* Vote Buttons */}
            <Text style={styles.voteLabel}>얼마가 적당할까요?</Text>
            <View style={styles.voteButtons}>
                {VoteService.VOTE_AMOUNTS.map(amount => (
                    <TouchableOpacity
                        key={amount}
                        style={[styles.voteButton, hasVoted && styles.voteButtonDisabled]}
                        onPress={() => !hasVoted && !loading && handleVote(amount)}
                        disabled={hasVoted || loading}
                    >
                        <Text style={[styles.voteButtonText, hasVoted && styles.voteButtonTextDisabled]}>
                            {formatAmount(amount)}
                        </Text>
                    </TouchableOpacity>
                ))}
            </View>

            {/* Loading Indicator */}
            {loading && (
                <ActivityIndicator size="small" color={Colors.orange} style={styles.loader} />
            )}

            {/* Vote Results */}
            {voteResults && voteResults.totalVotes > 0 && (
                <View style={styles.resultsContainer}>
                    <Text style={styles.totalVotes}>
                        총 {voteResults.totalVotes}명이 투표했습니다
                    </Text>
                    {voteResults.amounts.map(result => (
                        <VoteResultsBar
                            key={result.amount}
                            amount={result.amount}
                            count={result.count}
                            percentage={result.percentage}
                        />
                    ))}
                </View>
            )}

            {/* No votes yet */}
            {voteResults && voteResults.totalVotes === 0 && (
                <Text style={styles.noVotes}>아직 투표가 없습니다. 첫 투표를 해보세요!</Text>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    card: {
        backgroundColor: Colors.white,
        borderRadius: 20,
        padding: 20,
        marginBottom: 16,
        shadowColor: Colors.shadow,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 12,
        elevation: 4,
        borderWidth: 1,
        borderColor: Colors.glassBorder,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
    },
    author: {
        fontFamily: 'Pretendard-Bold',
        fontSize: 14,
        color: Colors.navy,
    },
    time: {
        fontFamily: 'Pretendard-Medium',
        fontSize: 12,
        color: Colors.subText,
    },
    summary: {
        fontFamily: 'Pretendard-Medium',
        fontSize: 16,
        color: Colors.text,
        lineHeight: 24,
        marginBottom: 16,
    },
    contextContainer: {
        backgroundColor: Colors.background,
        borderRadius: 12,
        padding: 12,
        marginBottom: 16,
    },
    contextText: {
        fontFamily: 'Pretendard-Medium',
        fontSize: 13,
        color: Colors.subText,
        marginBottom: 4,
    },
    voteLabel: {
        fontFamily: 'Pretendard-Bold',
        fontSize: 14,
        color: Colors.navy,
        marginBottom: 12,
    },
    voteButtons: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        gap: 8,
        marginBottom: 16,
    },
    voteButton: {
        flex: 1,
        backgroundColor: Colors.navy,
        borderRadius: 12,
        paddingVertical: 12,
        alignItems: 'center',
        shadowColor: Colors.orange,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 4,
        elevation: 3,
    },
    voteButtonDisabled: {
        backgroundColor: Colors.border,
        shadowOpacity: 0,
    },
    voteButtonText: {
        fontFamily: 'Pretendard-Bold',
        fontSize: 15,
        color: Colors.white,
    },
    voteButtonTextDisabled: {
        color: Colors.subText,
    },
    loader: {
        marginVertical: 8,
    },
    resultsContainer: {
        marginTop: 8,
        paddingTop: 16,
        borderTopWidth: 1,
        borderTopColor: Colors.border,
    },
    totalVotes: {
        fontFamily: 'Pretendard-Bold',
        fontSize: 13,
        color: Colors.orange,
        marginBottom: 12,
        textAlign: 'center',
    },
    noVotes: {
        fontFamily: 'Pretendard-Medium',
        fontSize: 13,
        color: Colors.subText,
        textAlign: 'center',
        marginTop: 8,
        fontStyle: 'italic',
    },
    // ✅ 삭제 버튼 스타일
    deleteButton: {
        padding: 8,
        borderRadius: 8,
    },
});
