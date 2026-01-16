import * as FileSystem from 'expo-file-system';
import * as Crypto from 'expo-crypto';

async function hashString(value: string): Promise<string> {
    return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, value);
}

export async function getImageHash(uri: string): Promise<string> {
    try {
        const info = await FileSystem.getInfoAsync(uri, { size: true });
        if (info.exists && typeof info.size === 'number') {
            const signature = `${uri}|${info.size}|${info.modificationTime ?? ''}`;
            return await hashString(signature);
        }
    } catch (error) {
        console.warn('[ImageHash] getInfoAsync failed, falling back:', error);
    }

    try {
        const base64 = await FileSystem.readAsStringAsync(uri, {
            encoding: FileSystem.EncodingType.Base64,
        });
        return await hashString(base64);
    } catch (error) {
        console.warn('[ImageHash] readAsStringAsync failed, falling back:', error);
    }

    return await hashString(uri);
}
