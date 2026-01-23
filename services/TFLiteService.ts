/**
 * TFLite Service
 * Provides document classification and field extraction using TensorFlow Lite models.
 */

import { Asset } from 'expo-asset';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import * as Device from 'expo-device';
import Constants from 'expo-constants';

// Note: react-native-fast-tflite types may need adjustment based on actual API
// import { TensorFlowLite } from 'react-native-fast-tflite';

// =============================================
// Constants
// =============================================
const DEVICE_CAPABILITY_CACHE_KEY = 'tflite_device_capability';
const CACHE_TTL_DAYS = 30;
const INFERENCE_TIME_THRESHOLD_MS = 250;
const STAGE2_DISABLE_THRESHOLD_MS = 500;

// GPU/NNAPI Denylist (devices with known instability)
const DELEGATE_DENYLIST: string[] = [
    'samsung:SM-A105',
    'xiaomi:Redmi 9A',
    'samsung:SM-A107',
    // Add more as discovered
];

// =============================================
// Types
// =============================================
interface DeviceCapability {
    isLowEnd: boolean;
    avgInferenceTimeMs: number;
    timestamp: number;
    appVersion: string;
}

interface ClassificationResult {
    receiptProb: number;
}

interface FieldExtractionResult {
    date?: string;       // YYYY-MM-DD format
    merchant?: string;
    amount?: number;
}

// =============================================
// Model Loading
// =============================================
let docClassifierModel: any = null;
let fieldExtractorModel: any = null;
let modelsLoaded = false;

/**
 * Get local file path for a bundled TFLite model asset.
 */
async function getModelLocalPath(modelRequire: any): Promise<string | null> {
    try {
        const asset = Asset.fromModule(modelRequire);
        await asset.downloadAsync();
        return asset.localUri;
    } catch (error) {
        console.error('[TFLite] Failed to resolve model path:', error);
        return null;
    }
}

/**
 * Load TFLite models. Call this during app initialization or lazily on first use.
 */
export async function loadModels(): Promise<boolean> {
    if (modelsLoaded) return true;

    try {
        // Placeholder: Replace with actual model requires when models are available
        // const classifierPath = await getModelLocalPath(require('../assets/models/doc_classifier.tflite'));
        // const extractorPath = await getModelLocalPath(require('../assets/models/field_extractor.tflite'));

        // TODO: Initialize react-native-fast-tflite with models
        // docClassifierModel = await TensorFlowLite.loadModel(classifierPath, { delegate: getDelegate() });
        // fieldExtractorModel = await TensorFlowLite.loadModel(extractorPath, { delegate: getDelegate() });

        console.log('[TFLite] Models loaded successfully (placeholder)');
        modelsLoaded = true;
        return true;
    } catch (error) {
        console.error('[TFLite] Failed to load models:', error);
        return false;
    }
}

// =============================================
// Device Detection
// =============================================

/**
 * Check if device is in the GPU/NNAPI denylist.
 */
function isInDenylist(): boolean {
    const manufacturer = Device.manufacturer?.toLowerCase() || '';
    const model = Device.modelName || '';
    const deviceKey = `${manufacturer}:${model}`;
    return DELEGATE_DENYLIST.some(d => deviceKey.includes(d.toLowerCase()));
}

/**
 * Get the appropriate delegate based on device capability.
 */
function getDelegate(): 'gpu' | 'nnapi' | 'cpu' {
    if (isInDenylist()) return 'cpu';

    // TODO: Check cached capability
    if (Platform.OS === 'android') {
        return 'nnapi'; // Prefer NNAPI on Android
    }
    return 'cpu'; // iOS: CoreML or CPU
}

/**
 * Measure average inference time (excluding warm-up).
 */
async function measureInferenceTime(): Promise<number> {
    const timings: number[] = [];

    // Warm-up run (excluded from average)
    // await runDummyInference();

    // 2-3 measurement runs
    for (let i = 0; i < 3; i++) {
        const start = Date.now();
        // await runDummyInference();
        await new Promise(resolve => setTimeout(resolve, 50)); // Placeholder
        timings.push(Date.now() - start);
    }

    return timings.reduce((a, b) => a + b, 0) / timings.length;
}

/**
 * Check if current device is low-end. Result is cached.
 */
export async function isLowEndDevice(): Promise<boolean> {
    // Check denylist first
    if (isInDenylist()) {
        console.log('[TFLite] Device in denylist, treating as low-end');
        return true;
    }

    // Check cache
    try {
        const cached = await AsyncStorage.getItem(DEVICE_CAPABILITY_CACHE_KEY);
        if (cached) {
            const capability: DeviceCapability = JSON.parse(cached);
            const appVersion = Constants.expoConfig?.version || '1.0.0';
            const ageInDays = (Date.now() - capability.timestamp) / (1000 * 60 * 60 * 24);

            // Invalidate if expired or app version changed
            if (ageInDays < CACHE_TTL_DAYS && capability.appVersion === appVersion) {
                console.log('[TFLite] Using cached device capability:', capability.isLowEnd);
                return capability.isLowEnd;
            }
        }
    } catch (error) {
        console.warn('[TFLite] Failed to read cache:', error);
    }

    // Measure and cache
    const avgTime = await measureInferenceTime();
    const isLowEnd = avgTime > INFERENCE_TIME_THRESHOLD_MS;

    const capability: DeviceCapability = {
        isLowEnd,
        avgInferenceTimeMs: avgTime,
        timestamp: Date.now(),
        appVersion: Constants.expoConfig?.version || '1.0.0',
    };

    try {
        await AsyncStorage.setItem(DEVICE_CAPABILITY_CACHE_KEY, JSON.stringify(capability));
    } catch (error) {
        console.warn('[TFLite] Failed to cache device capability:', error);
    }

    console.log(`[TFLite] Device capability measured: isLowEnd=${isLowEnd}, avgTime=${avgTime}ms`);
    return isLowEnd;
}

// =============================================
// Classification & Extraction
// =============================================

/**
 * Classify document type (receipt vs screenshot).
 * Returns receiptProb between 0 and 1.
 */
export async function classifyDocument(imageUri: string): Promise<ClassificationResult> {
    if (!modelsLoaded) {
        await loadModels();
    }

    try {
        // TODO: Implement actual TFLite inference
        // const output = await docClassifierModel.run(preprocessImage(imageUri));
        // return { receiptProb: output[0] };

        // Placeholder: Return mock result
        console.log('[TFLite] classifyDocument called (placeholder)');
        return { receiptProb: 0.85 };
    } catch (error) {
        console.error('[TFLite] Classification failed:', error);
        return { receiptProb: 0 };
    }
}

/**
 * Extract key fields from document image.
 * Returns date, merchant, and amount if detectable.
 */
export async function extractFields(imageUri: string): Promise<FieldExtractionResult> {
    if (!modelsLoaded) {
        await loadModels();
    }

    // Check if Stage 2 should be disabled on this device
    const lowEnd = await isLowEndDevice();
    if (lowEnd) {
        console.log('[TFLite] Skipping field extraction on low-end device');
        return {};
    }

    try {
        // TODO: Implement actual TFLite inference
        // const output = await fieldExtractorModel.run(preprocessImage(imageUri));
        // return parseFieldOutput(output);

        // Placeholder: Return mock result
        console.log('[TFLite] extractFields called (placeholder)');
        return {
            date: '2026-01-22',
            merchant: 'Test Merchant',
            amount: 50000,
        };
    } catch (error) {
        console.error('[TFLite] Field extraction failed:', error);
        return {};
    }
}

/**
 * Check if Stage 2 extraction result is valid (at least 2 fields present).
 */
export function isExtractionValid(result: FieldExtractionResult): boolean {
    let fieldCount = 0;
    if (result.date) fieldCount++;
    if (result.merchant) fieldCount++;
    if (result.amount !== undefined && result.amount > 0) fieldCount++;
    return fieldCount >= 2;
}

// =============================================
// Metrics
// =============================================
let stage1ExecutionCount = 0;
let stage2ExecutionCount = 0;
let visionFallbackCount = 0;

export function incrementStage1Count() { stage1ExecutionCount++; }
export function incrementStage2Count() { stage2ExecutionCount++; }
export function incrementVisionFallbackCount() { visionFallbackCount++; }

export function getMetrics() {
    return {
        stage1ExecutionCount,
        stage2ExecutionCount,
        visionFallbackCount,
    };
}
