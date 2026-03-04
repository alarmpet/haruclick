import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, Platform, StatusBar } from 'react-native';
import { Colors } from '../../constants/Colors';
import { ChannelList } from '../../components/community/ChannelList';
import { HaruPlaza } from '../../components/community/HaruPlaza';

export default function CommunityHomeScreen() {
    const [activeTab, setActiveTab] = useState<'channels' | 'plaza'>('channels');

    return (
        <SafeAreaView style={styles.safeArea}>
            <View style={styles.header}>
                <View style={styles.segmentContainer}>
                    <TouchableOpacity
                        style={[styles.segmentButton, activeTab === 'channels' && styles.segmentActive]}
                        onPress={() => setActiveTab('channels')}
                        activeOpacity={0.8}
                    >
                        <Text style={[styles.segmentText, activeTab === 'channels' && styles.segmentTextActive]}>채널</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.segmentButton, activeTab === 'plaza' && styles.segmentActive]}
                        onPress={() => setActiveTab('plaza')}
                        activeOpacity={0.8}
                    >
                        <Text style={[styles.segmentText, activeTab === 'plaza' && styles.segmentTextActive]}>하루 광장</Text>
                    </TouchableOpacity>
                </View>
            </View>

            <View style={styles.content}>
                {activeTab === 'channels' ? <ChannelList /> : <HaruPlaza />}
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safeArea: {
        flex: 1,
        backgroundColor: Colors.white,
        paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
    },
    header: {
        paddingHorizontal: 20,
        paddingVertical: 12,
        backgroundColor: Colors.white,
        borderBottomWidth: 1,
        borderBottomColor: Colors.border,
        zIndex: 10,
    },
    segmentContainer: {
        flexDirection: 'row',
        backgroundColor: '#F5F6F8',
        borderRadius: 8,
        padding: 4,
    },
    segmentButton: {
        flex: 1,
        paddingVertical: 8,
        alignItems: 'center',
        borderRadius: 6,
    },
    segmentActive: {
        backgroundColor: Colors.white,
        shadowColor: Colors.shadow,
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
        elevation: 2,
    },
    segmentText: {
        fontFamily: 'Pretendard-Medium',
        fontSize: 15,
        color: Colors.subText,
    },
    segmentTextActive: {
        fontFamily: 'Pretendard-Bold',
        color: Colors.text,
    },
    content: {
        flex: 1,
        backgroundColor: Colors.background,
    }
});
