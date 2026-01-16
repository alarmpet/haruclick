import { ScannedData } from './ai/OpenAIService';

interface ScanSession {
    imageUri?: string;
    scannedDataList?: ScannedData[];
    ocrSessionId?: string;
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

    public setScanResult(uri: string, dataList: ScannedData[], ocrSessionId?: string) {
        this.session = {
            imageUri: uri,
            scannedDataList: dataList,
            ocrSessionId
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
