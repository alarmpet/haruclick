/** @jest-environment node */

jest.mock('@react-native-ml-kit/text-recognition', () => ({
    __esModule: true,
    default: {},
    TextRecognitionScript: {}
}));

jest.mock('react-native', () => ({
    Image: { getSize: jest.fn() },
    Platform: {},
    InteractionManager: { runAfterInteractions: jest.fn() }
}));

jest.mock('expo-image-manipulator', () => ({
    manipulateAsync: jest.fn(),
    SaveFormat: { JPEG: 'jpeg' }
}));

jest.mock('expo-file-system/legacy', () => ({
    getInfoAsync: jest.fn()
}));

jest.mock('../../services/ocrCache', () => ({
    getOcrCache: jest.fn(),
    setOcrCache: jest.fn()
}));

jest.mock('../../services/ocrSettings', () => ({
    isPreprocessEnabled: jest.fn(() => false)
}));

jest.mock('../../services/errorHandler', () => ({
    showError: jest.fn()
}));

jest.mock('../../services/GoogleVisionService', () => ({
    extractTextWithGoogleVision: jest.fn()
}));

jest.mock('../../services/OcrLogger', () => ({
    createOcrLogger: jest.fn(),
    getCurrentOcrLogger: jest.fn()
}));

jest.mock('../../services/imageHash', () => ({
    getImageHash: jest.fn()
}));

jest.mock('../../services/ImageClassifier', () => ({
    ImageType: { UNKNOWN: 'UNKNOWN' }
}));

import { preprocessRelativeDates } from '../../services/ocr';

describe('preprocessRelativeDates', () => {
    it('uses explicit anchors in the same block', () => {
        const text = '(그저께) 15:32\n[Web발신] 8,000원 결제\n01/10 16:11 400,000원 저금';
        const now = new Date(2026, 0, 12);
        const result = preprocessRelativeDates(text, { now });
        expect(result).toContain('2026-01-08');
    });

    it('falls back to now when no explicit date exists', () => {
        const text = '결제 알림\n어제 12:00 5,000원';
        const now = new Date(2026, 0, 10);
        const result = preprocessRelativeDates(text, { now });
        expect(result).toContain('2026-01-09');
    });

    it('keeps anchors scoped per block', () => {
        const text = '01/05\n어제 10,000원\n\n01/07\n어제 20,000원';
        const now = new Date(2026, 0, 8);
        const result = preprocessRelativeDates(text, { now });
        const lines = result.split('\n');
        expect(lines[1]).toContain('2026-01-04');
        expect(lines[4]).toContain('2026-01-06');
    });

    it('prefers past dates for ambiguous MM/DD anchors', () => {
        const text = '12/31 어제 결제';
        const now = new Date(2026, 0, 2);
        const result = preprocessRelativeDates(text, { now, preferPast: true });
        expect(result).toContain('2025-12-30');
    });
});
