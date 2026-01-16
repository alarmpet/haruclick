import { Alert } from 'react-native';

/**
 * Centralized error handling utility.
 * Shows a native alert with the provided message and logs to console.
 */
export function showError(message: string) {
    console.error('[Error] ', message);
    Alert.alert('오류', message);
}
