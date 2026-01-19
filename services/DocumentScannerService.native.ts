import DocumentScanner from 'react-native-document-scanner-plugin';
import { Platform } from 'react-native';

export interface ScanResult {
    scannedImages: string[];
    status: 'cancel' | 'success';
}

export async function scanDocument(): Promise<string | null> {
    if (Platform.OS === 'web') {
        console.warn('Document Scanner is not supported on web.');
        return null;
    }

    try {
        const { scannedImages, status } = await DocumentScanner.scanDocument({
            maxNumDocuments: 1,
            croppedImageQuality: 90,
        });

        if (status === 'success' && scannedImages && scannedImages.length > 0) {
            return scannedImages[0];
        } else {
            return null; // User cancelled or failed
        }
    } catch (e) {
        console.error('[DocumentScanner] Scan failed:', e);
        return null;
    }
}
