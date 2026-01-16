import React, { useState, useEffect } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, FlatList, TextInput, ActivityIndicator } from 'react-native';
import { Colors } from '../constants/Colors';
import { Ionicons } from '@expo/vector-icons';

interface SenderSelectModalProps {
    visible: boolean;
    onClose: () => void;
    onSelect: (name: string) => void;
    initialQuery: string;
    candidates: string[]; // List of names found in DB
    onSearch: (text: string) => Promise<string[]>; // Function to search wider DB
}

export function SenderSelectModal({ visible, onClose, onSelect, initialQuery, candidates, onSearch }: SenderSelectModalProps) {
    const [searchText, setSearchText] = useState(initialQuery);
    const [list, setList] = useState<string[]>(candidates);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        setSearchText(initialQuery);
        setList(candidates);
    }, [initialQuery, candidates]);

    const handleSearch = async (text: string) => {
        setSearchText(text);
        setLoading(true);
        try {
            const results = await onSearch(text);
            setList(results);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const handleConfirmNew = () => {
        onSelect(searchText);
    };

    return (
        <Modal visible={visible} transparent animationType="slide">
            <View style={styles.overlay}>
                <View style={styles.modalContainer}>
                    <View style={styles.header}>
                        <Text style={styles.title}>보낸 사람 확인</Text>
                        <TouchableOpacity onPress={onClose}>
                            <Ionicons name="close" size={24} color={Colors.text} />
                        </TouchableOpacity>
                    </View>

                    <Text style={styles.subtitle}>
                        '{initialQuery}'님이 인맥 장부에 있나요?
                    </Text>

                    <View style={styles.searchContainer}>
                        <Ionicons name="search" size={20} color={Colors.subText} style={styles.searchIcon} />
                        <TextInput
                            style={styles.searchInput}
                            value={searchText}
                            onChangeText={handleSearch}
                            placeholder="이름 검색"
                            autoFocus
                        />
                    </View>

                    {loading ? (
                        <ActivityIndicator style={{ marginTop: 20 }} color={Colors.orange} />
                    ) : (
                        <FlatList
                            data={list}
                            keyExtractor={(item) => item}
                            ListHeaderComponent={() => (
                                <TouchableOpacity style={styles.newItem} onPress={handleConfirmNew}>
                                    <View style={styles.iconCircle}>
                                        <Ionicons name="add" size={20} color={Colors.white} />
                                    </View>
                                    <View>
                                        <Text style={styles.newItemText}>새 인맥으로 등록</Text>
                                        <Text style={styles.newItemSubText}>'{searchText}'(으)로 저장</Text>
                                    </View>
                                </TouchableOpacity>
                            )}
                            renderItem={({ item }) => (
                                <TouchableOpacity style={styles.item} onPress={() => onSelect(item)}>
                                    <Ionicons name="person-circle-outline" size={40} color={Colors.subText} />
                                    <Text style={styles.itemText}>{item}</Text>
                                    <Ionicons name="chevron-forward" size={20} color={Colors.lightGray} />
                                </TouchableOpacity>
                            )}
                            contentContainerStyle={styles.listContent}
                            ListEmptyComponent={() => (
                                <View style={styles.emptyContainer}>
                                    <Text style={styles.emptyText}>검색 결과가 없습니다.</Text>
                                </View>
                            )}
                        />
                    )}
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.6)', // Darker dim for focus
        justifyContent: 'flex-end',
    },
    modalContainer: {
        backgroundColor: Colors.white,
        borderTopLeftRadius: 32,
        borderTopRightRadius: 32,
        height: '85%',
        padding: 24,
        paddingTop: 32,
        shadowColor: Colors.shadow,
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.25,
        shadowRadius: 16,
        elevation: 20,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
    },
    title: {
        fontFamily: 'Pretendard-Bold',
        fontSize: 24,
        color: Colors.text,
    },
    subtitle: {
        fontFamily: 'Pretendard-Medium',
        fontSize: 16,
        color: Colors.subText,
        marginBottom: 24,
        marginTop: 8,
    },
    searchContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: Colors.background,
        borderRadius: 16,
        paddingHorizontal: 16,
        paddingVertical: 14,
        marginBottom: 20,
        borderWidth: 1,
        borderColor: Colors.border,
    },
    searchIcon: {
        marginRight: 10,
    },
    searchInput: {
        flex: 1,
        fontFamily: 'Pretendard-Medium',
        fontSize: 17,
        color: Colors.text,
    },
    listContent: {
        paddingBottom: 40,
    },
    newItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 18,
        borderBottomWidth: 1,
        borderBottomColor: Colors.border,
        marginBottom: 8,
        backgroundColor: Colors.background,
        borderRadius: 16,
        paddingHorizontal: 16,
    },
    iconCircle: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: Colors.orange,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 16,
        shadowColor: Colors.orange,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 4,
    },
    newItemText: {
        fontFamily: 'Pretendard-Bold',
        fontSize: 17,
        color: Colors.text, // Better contrast
    },
    newItemSubText: {
        fontFamily: 'Pretendard-Medium',
        fontSize: 13,
        color: Colors.green, // Highlight action
        marginTop: 2,
    },
    item: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 14,
        paddingHorizontal: 8,
        borderBottomWidth: 1,
        borderBottomColor: Colors.border,
    },
    itemText: {
        flex: 1,
        fontFamily: 'Pretendard-Bold',
        fontSize: 17,
        color: Colors.text,
        marginLeft: 16,
    },
    emptyContainer: {
        paddingVertical: 60,
        alignItems: 'center',
    },
    emptyText: {
        fontFamily: 'Pretendard-Medium',
        color: Colors.subText,
        fontSize: 16,
    }
});
