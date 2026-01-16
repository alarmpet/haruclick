import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

export async function save(key: string, value: string) {
    if (Platform.OS === 'web') {
        return AsyncStorage.setItem(key, value);
    } else {
        return SecureStore.setItemAsync(key, value);
    }
}

export async function getValueFor(key: string) {
    if (Platform.OS === 'web') {
        return AsyncStorage.getItem(key);
    } else {
        return SecureStore.getItemAsync(key);
    }
}

export async function deleteItem(key: string) {
    if (Platform.OS === 'web') {
        return AsyncStorage.removeItem(key);
    } else {
        return SecureStore.deleteItemAsync(key);
    }
}
