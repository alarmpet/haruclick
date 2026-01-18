import { supabase } from './supabase';

export type OcrStage = 'ml_kit' | 'openai_text' | 'google_vision' | 'openai_vision';

export type FallbackReason =
    | 'short_text'
    | 'low_quality_image'
    | 'ui_noise_detected'
    | 'missing_api_key'
    | 'json_parse_error'
    | 'low_confidence'
    | 'timeout'
    | 'exception'
    | 'unknown_result'
    | 'no_valid_results'
    | 'stage2_exception'
    | 'vision_exception'
    | 'unknown_type'
    | string;

export interface OcrLogEntry {
    stage: OcrStage;
    stageOrder: number;
    success: boolean;
    fallbackReason?: FallbackReason;

    // New Detailed Metrics
    imageHash?: string;
    docTypePredicted?: string;
    confidence?: number;
    processingTimeMs?: number;
    retryCount?: number;
    costEstimatedUsd?: number;
    metadata?: Record<string, any>;

    // Legacy mapping
    textLength?: number;
    resultType?: string;
    errorMessage?: string;
}

/**
 * OCR Pipeline Logger V2
 */
export class OcrLogger {
    private sessionId: string;
    private userId: string | null = null;
    private logs: OcrLogEntry[] = [];
    private startTime: number = 0;
    private imageHash?: string;
    private baseImageSizeKb?: number;

    constructor() {
        this.sessionId = this.generateSessionId();
    }

    private generateSessionId(): string {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    async startSession(imageHash?: string, imageSizeKb?: number): Promise<void> {
        this.startTime = Date.now();
        this.logs = [];
        this.imageHash = imageHash;
        this.baseImageSizeKb = imageSizeKb;

        try {
            const { data: { user } } = await supabase.auth.getUser();
            this.userId = user?.id || null;
        } catch {
            this.userId = null;
        }
        console.log(`[OcrLogger] Session started: ${this.sessionId}`);
    }

    logStage(entry: OcrLogEntry): void {
        const currentTime = Date.now();
        let estimatedCost = entry.costEstimatedUsd || 0;
        if (estimatedCost === 0) {
            if (entry.stage === 'openai_text') estimatedCost = 0.0005;
            if (entry.stage === 'openai_vision') estimatedCost = 0.005;
            if (entry.stage === 'google_vision') estimatedCost = 0.0015;
        }

        const logItem: OcrLogEntry = {
            ...entry,
            imageHash: entry.imageHash || this.imageHash,
            processingTimeMs: entry.processingTimeMs || (currentTime - this.startTime),
            costEstimatedUsd: estimatedCost,
            docTypePredicted: entry.docTypePredicted || entry.resultType,
            metadata: {
                ...entry.metadata,
                text_length: entry.textLength,
                error_message: entry.errorMessage,
                image_size_kb: this.baseImageSizeKb,
                processingTimeMs: entry.processingTimeMs || (currentTime - this.startTime), // Added this line based on the instruction's intent
            }
        };

        this.logs.push(logItem);
        const icon = entry.success ? '✅' : '❌';

        // 🛠️ Verbose Logging for Debugging
        console.log(`\n========================================`);
        console.log(`[OcrLogger] ${icon} Stage ${entry.stageOrder} (${entry.stage})`);
        console.log(`----------------------------------------`);
        console.log(`Status: ${entry.success ? 'Success' : 'Failed'}`);
        if (entry.fallbackReason) console.log(`Reason: ${entry.fallbackReason}`);
        if (entry.docTypePredicted) console.log(`Type: ${entry.docTypePredicted} (Conf: ${entry.confidence})`);
        if (estimatedCost > 0) console.log(`Cost: $${estimatedCost.toFixed(5)}`);

        if (entry.metadata) {
            console.log(`Metadata:`, JSON.stringify(entry.metadata, null, 2));
        }
        console.log(`========================================\n`);
    }

    // ===================================
    // ✨ Helpers for specific stages
    // ===================================

    logGoogleVision(success: boolean, textLength: number, metadata?: Record<string, any>): void {
        this.logStage({
            stage: 'google_vision',
            stageOrder: 3,
            success,
            textLength,
            metadata,
            fallbackReason: success ? undefined : 'low_confidence'
        });
    }

    logOpenAiText(success: boolean, docType?: string, failureReason?: string, metadata?: Record<string, any>): void {
        this.logStage({
            stage: 'openai_text',
            stageOrder: 2,
            success,
            docTypePredicted: docType,
            fallbackReason: failureReason,
            metadata
        });
    }

    logOpenAiVision(success: boolean, docType?: string, failureReason?: string, metadata?: Record<string, any>): void {
        this.logStage({
            stage: 'openai_vision',
            stageOrder: 4,
            success,
            docTypePredicted: docType,
            fallbackReason: failureReason,
            metadata
        });
    }

    async flush(): Promise<void> {
        if (this.logs.length === 0) return;

        const records = this.logs.map(log => ({
            session_id: this.sessionId,
            user_id: this.userId,
            stage: log.stage,
            stage_order: log.stageOrder,
            success: log.success,
            fallback_reason: log.fallbackReason,
            image_hash: log.imageHash,
            doc_type_predicted: log.docTypePredicted,
            confidence: log.confidence,
            processing_time_ms: log.processingTimeMs || 0,
            retry_count: log.retryCount || 0,
            cost_estimated_usd: log.costEstimatedUsd,
            metadata: log.metadata || {},
        }));

        try {
            const { error } = await supabase.from('ocr_pipeline_logs').insert(records);
            if (error) console.warn('[OcrLogger] DB Save Failed:', error.message);
            else console.log(`[OcrLogger] Saved ${records.length} logs.`);
        } catch (e) {
            console.warn('[OcrLogger] Exception saving logs:', e);
        }
    }

    getSessionId(): string { return this.sessionId; }
}

let currentLogger: OcrLogger | null = null;
export function createOcrLogger(): OcrLogger { currentLogger = new OcrLogger(); return currentLogger; }
export function getCurrentOcrLogger(): OcrLogger | null { return currentLogger; }
