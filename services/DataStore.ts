import { ScannedData } from './ai/OpenAIService';

interface ScanSession {
    imageUri?: string;
    scannedDataList?: ScannedData[];
    ocrSessionId?: string;
    ocrRawText?: string;
}

class DataStoreService {
    private static instance: DataStoreService;
    private session: ScanSession = {};

    private constructor() { }

    public static getInstance(): DataStoreService {
        if (!DataStoreService.instance) {
            DataStoreService.instance = new DataStoreService();
        }
        return DataStoreService.instance;
    }

    public setScanResult(uri: string, dataList: ScannedData[], ocrSessionId?: string, ocrRawText?: string) {
        this.session = {
            imageUri: uri,
            scannedDataList: dataList,
            ocrSessionId,
            ocrRawText
        };
    }

    public getScanResult(): ScanSession {
        return this.session;
    }

    public clear() {
        this.session = {};
    }
}

export const DataStore = DataStoreService.getInstance();
