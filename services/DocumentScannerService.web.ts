// Web implementation to avoid importing 'react-native-document-scanner-plugin' which causes crashes on web.
// We duplicate the interface here to avoid importing it from the native file (which would trigger the native module import).

export interface ScanResult {
    scannedImages: string[];
    status: 'cancel' | 'success';
}

export async function scanDocument(): Promise<string | null> {
    console.warn('Document Scanner is not supported on web.');
    return null;
}
