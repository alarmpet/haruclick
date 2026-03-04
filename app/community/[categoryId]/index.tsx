import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator, TouchableOpacity, RefreshControl, Image, ScrollView } from 'react-native';
import { useLocalSearchParams, Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../../constants/Colors';
import { supabase } from '../../../services/supabase-modules/client';
import {
    getChannelPosts,
    togglePostLike,
    getUpcomingChannelEvents,
    ChannelPost
} from '../../../services/supabase-modules/channel-posts';
import { InterestCategory, toggleSubscription, getMySubscriptions } from '../../../services/supabase-modules/interests';

// Helper component for Post items to keep code clean
const PostItem = ({ post, onLikeToggle }: { post: ChannelPost, onLikeToggle: (id: string, liked: boolean) => void }) => {
    return (
        <View style={styles.postContainer}>
            <View style={styles.postHeader}>
                <View style={styles.avatar}>
                    <Ionicons name="person" size={20} color={Colors.white} />
                </View>
                <View style={styles.authorInfo}>
                    <Text style={styles.authorName}>{post.author_name}</Text>
                    <Text style={styles.postDate}>
                        {new Date(post.created_at).toLocaleDateString()}
                    </Text>
                </View>
            </View>

            <Text style={styles.postContent}>{post.content}</Text>

            {/* MVP: No image rendering yet unless absolutely needed, just a placeholder if imageUrl exists */}
            {post.image_url && (
                <View style={styles.imagePlaceholder}>
                    <Ionicons name="image-outline" size={24} color={Colors.subText} />
                    <Text style={styles.imageText}>첨부 이미지</Text>
                </View>
            )}

            <View style={styles.postFooter}>
                <TouchableOpacity
                    style={styles.actionButton}
                    onPress={() => onLikeToggle(post.id, !!post.has_liked)}
                    activeOpacity={0.7}
                >
                    <Ionicons
                        name={post.has_liked ? "heart" : "heart-outline"}
                        size={20}
                        color={post.has_liked ? Colors.orange : Colors.subText}
                    />
                    <Text style={[styles.actionText, post.has_liked && styles.actionTextActive]}>
                        {post.like_count || 0}
                    </Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.actionButton} activeOpacity={0.7}>
                    <Ionicons name="chatbubble-outline" size={18} color={Colors.subText} />
                    <Text style={styles.actionText}>{post.comment_count || 0}</Text>
                </TouchableOpacity>
            </View>
        </View>
    );
};

export default function ChannelDetailScreen() {
    const { categoryId } = useLocalSearchParams<{ categoryId: string }>();
    const router = useRouter();

    const [category, setCategory] = useState<InterestCategory | null>(null);
    const [events, setEvents] = useState<any[]>([]);
    const [posts, setPosts] = useState<ChannelPost[]>([]);

    const [isSubscribed, setIsSubscribed] = useState(false);
    const [isTogglingSub, setIsTogglingSub] = useState(false);

    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [page, setPage] = useState(0);
    const [hasMore, setHasMore] = useState(true);

    const loadCategoryAndEvents = useCallback(async () => {
        try {
            // 1. Fetch category details
            const { data: catData, error: catError } = await supabase
                .from('interest_categories')
                .select('*')
                .eq('id', categoryId)
                .single();

            if (catError) throw catError;
            setCategory(catData);

            // 2. Fetch subscription status
            const subs = await getMySubscriptions();
            setIsSubscribed(subs.some(s => s.category_id === categoryId));

            // 3. Fetch upcoming events if target_calendar_id exists
            if (catData.target_calendar_id) {
                const upcomingEvents = await getUpcomingChannelEvents(catData.target_calendar_id, 5);
                setEvents(upcomingEvents);
            }
        } catch (error) {
            console.error('Error loading category:', error);
        }
    }, [categoryId]);

    const loadPosts = useCallback(async (pageNumber: number, isRefresh = false) => {
        try {
            const fetchedPosts = await getChannelPosts(categoryId, pageNumber);
            if (isRefresh) {
                setPosts(fetchedPosts);
            } else {
                setPosts(prev => [...prev, ...fetchedPosts]);
            }
            setHasMore(fetchedPosts.length === 20);
        } catch (error) {
            console.error('Error loading posts:', error);
        }
    }, [categoryId]);

    useEffect(() => {
        const init = async () => {
            setLoading(true);
            await Promise.all([loadCategoryAndEvents(), loadPosts(0, true)]);
            setLoading(false);
        };
        init();
    }, [loadCategoryAndEvents, loadPosts]);

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        setPage(0);
        await Promise.all([loadCategoryAndEvents(), loadPosts(0, true)]);
        setRefreshing(false);
    }, [loadCategoryAndEvents, loadPosts]);

    const onLoadMore = () => {
        if (!loading && !refreshing && hasMore) {
            const nextPage = page + 1;
            setPage(nextPage);
            loadPosts(nextPage);
        }
    };

    const handleToggleSub = async () => {
        if (!category?.target_calendar_id) return;
        setIsTogglingSub(true);
        const success = await toggleSubscription(categoryId, category.target_calendar_id, !isSubscribed);
        if (success) setIsSubscribed(!isSubscribed);
        setIsTogglingSub(false);
    };

    const handleLikeToggle = async (postId: string, isLiked: boolean) => {
        // Optimistic UI update
        setPosts(prev => prev.map(p => {
            if (p.id === postId) {
                return {
                    ...p,
                    has_liked: !isLiked,
                    like_count: isLiked ? Math.max(0, p.like_count - 1) : p.like_count + 1
                };
            }
            return p;
        }));

        const success = await togglePostLike(postId, isLiked);
        if (!success) {
            // Revert if failed
            setPosts(prev => prev.map(p => {
                if (p.id === postId) {
                    return {
                        ...p,
                        has_liked: isLiked,
                        like_count: isLiked ? p.like_count + 1 : Math.max(0, p.like_count - 1)
                    };
                }
                return p;
            }));
        }
    };

    const renderHeader = () => (
        <View style={styles.headerContainer}>
            {events.length > 0 && (
                <View style={styles.eventsSection}>
                    <Text style={styles.sectionTitle}>🎉 다가오는 이벤트</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.eventsScroll}>
                        {events.map(event => (
                            <View key={event.id} style={styles.eventCard}>
                                <Text style={styles.eventName} numberOfLines={2}>{event.name}</Text>
                                <View style={styles.eventDateRow}>
                                    <Ionicons name="calendar-outline" size={12} color={Colors.navy} />
                                    <Text style={styles.eventDate}>
                                        {new Date(event.event_date).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })}
                                    </Text>
                                    {event.start_time && event.start_time !== '10:00' && (
                                        <>
                                            <Ionicons name="time-outline" size={12} color={Colors.navy} style={{ marginLeft: 6 }} />
                                            <Text style={styles.eventDate}>{event.start_time}</Text>
                                        </>
                                    )}
                                </View>
                                {event.location ? (
                                    <View style={styles.eventDateRow}>
                                        <Ionicons name="location-outline" size={12} color={Colors.subText} />
                                        <Text style={[styles.eventDate, { color: Colors.subText }]} numberOfLines={1}>{event.location}</Text>
                                    </View>
                                ) : null}
                            </View>
                        ))}
                    </ScrollView>
                </View>
            )}
            <View style={styles.feedHeaderRow}>
                <Text style={styles.sectionTitle}>💬 커뮤니티 스레드</Text>
            </View>
        </View>
    );

    if (loading) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={Colors.navy} />
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <Stack.Screen
                options={{
                    title: category?.name || '채널',
                    headerRight: () => (
                        <TouchableOpacity
                            style={[styles.subButton, isSubscribed ? styles.subButtonActive : styles.subButtonInactive]}
                            onPress={handleToggleSub}
                            disabled={isTogglingSub}
                        >
                            {isTogglingSub ? (
                                <ActivityIndicator size="small" color={isSubscribed ? Colors.white : Colors.navy} />
                            ) : (
                                <Text style={[styles.subButtonText, isSubscribed ? styles.subButtonTextActive : styles.subButtonTextInactive]}>
                                    {isSubscribed ? '구독중' : '구독하기'}
                                </Text>
                            )}
                        </TouchableOpacity>
                    ),
                }}
            />

            <FlatList
                data={posts}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => <PostItem post={item} onLikeToggle={handleLikeToggle} />}
                ListHeaderComponent={renderHeader}
                ListEmptyComponent={
                    <View style={styles.emptyContainer}>
                        <Ionicons name="chatbubbles-outline" size={48} color={Colors.subText} />
                        <Text style={styles.emptyText}>아직 작성된 글이 없습니다.{'\n'}첫 번째 글을 작성해보세요!</Text>
                    </View>
                }
                contentContainerStyle={styles.listContent}
                onEndReached={onLoadMore}
                onEndReachedThreshold={0.5}
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.navy} />
                }
            />

            <TouchableOpacity
                style={styles.fab}
                onPress={() => router.push(`/community/${categoryId}/new-post`)}
                activeOpacity={0.8}
            >
                <Ionicons name="pencil" size={24} color={Colors.white} />
            </TouchableOpacity>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.background,
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: Colors.background,
    },
    headerContainer: {
        marginBottom: 8,
    },
    eventsSection: {
        backgroundColor: Colors.white,
        paddingVertical: 16,
        marginBottom: 8,
        borderBottomWidth: 1,
        borderBottomColor: Colors.border,
    },
    sectionTitle: {
        fontSize: 16,
        fontFamily: 'Pretendard-Bold',
        color: Colors.text,
        marginLeft: 20,
        marginBottom: 12,
    },
    eventsScroll: {
        paddingHorizontal: 16,
    },
    eventCard: {
        width: 160,
        backgroundColor: '#F5F6F8',
        borderRadius: 12,
        padding: 12,
        marginHorizontal: 4,
        borderWidth: 1,
        borderColor: Colors.border,
    },
    eventName: {
        fontSize: 14,
        fontFamily: 'Pretendard-Bold',
        color: Colors.text,
        marginBottom: 8,
        minHeight: 40,
    },
    eventDateRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    eventDate: {
        fontSize: 12,
        fontFamily: 'Pretendard-Medium',
        color: Colors.navy,
        marginLeft: 4,
    },
    feedHeaderRow: {
        paddingTop: 16,
        paddingHorizontal: 4,
    },
    listContent: {
        paddingBottom: 100, // For FAB
    },
    postContainer: {
        backgroundColor: Colors.white,
        padding: 16,
        marginHorizontal: 16,
        marginBottom: 12,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: Colors.border,
    },
    postHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 12,
    },
    avatar: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: Colors.subText,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 10,
    },
    authorInfo: {
        flex: 1,
    },
    authorName: {
        fontSize: 15,
        fontFamily: 'Pretendard-Bold',
        color: Colors.text,
    },
    postDate: {
        fontSize: 12,
        fontFamily: 'Pretendard-Medium',
        color: Colors.subText,
        marginTop: 2,
    },
    postContent: {
        fontSize: 15,
        fontFamily: 'Pretendard-Medium',
        color: Colors.text,
        lineHeight: 22,
        marginBottom: 16,
    },
    imagePlaceholder: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#F5F6F8',
        padding: 12,
        borderRadius: 8,
        marginBottom: 16,
    },
    imageText: {
        marginLeft: 8,
        fontSize: 13,
        color: Colors.subText,
        fontFamily: 'Pretendard-Medium',
    },
    postFooter: {
        flexDirection: 'row',
        alignItems: 'center',
        borderTopWidth: 1,
        borderTopColor: '#F5F6F8',
        paddingTop: 12,
    },
    actionButton: {
        flexDirection: 'row',
        alignItems: 'center',
        marginRight: 20,
    },
    actionText: {
        fontSize: 14,
        fontFamily: 'Pretendard-Medium',
        color: Colors.subText,
        marginLeft: 4,
    },
    actionTextActive: {
        color: Colors.orange,
    },
    emptyContainer: {
        alignItems: 'center',
        padding: 40,
    },
    emptyText: {
        marginTop: 16,
        fontSize: 15,
        fontFamily: 'Pretendard-Medium',
        color: Colors.subText,
        textAlign: 'center',
        lineHeight: 22,
    },
    fab: {
        position: 'absolute',
        bottom: 24,
        right: 24,
        width: 56,
        height: 56,
        borderRadius: 28,
        backgroundColor: Colors.navy,
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: Colors.shadow,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 6,
    },
    subButton: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 16,
        borderWidth: 1,
    },
    subButtonActive: {
        backgroundColor: Colors.navy,
        borderColor: Colors.navy,
    },
    subButtonInactive: {
        backgroundColor: 'transparent',
        borderColor: Colors.subText,
    },
    subButtonText: {
        fontSize: 12,
        fontFamily: 'Pretendard-Bold',
    },
    subButtonTextActive: {
        color: Colors.white,
    },
    subButtonTextInactive: {
        color: Colors.subText,
    },
});
