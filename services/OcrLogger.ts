import { supabase } from './supabase';
import { maskPIIInObject } from './piiMasking';

export type OcrStage = 'ml_kit' | 'openai_text' | 'google_vision' | 'openai_vision' | 'voice_local' | 'voice_whisper' | 'voice_confirm';

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
    | 'voice_init_failed'
    | 'voice_timeout'
    | 'voice_network_error'
    | 'voice_no_match'
    | 'voice_error'         // New
    | 'permission_denied'   // New
    | 'no_entity'           // New
    | 'analysis_unknown'    // New
    | 'api_error'           // New
    | 'needs_confirmation'  // New
    | 'auto_analysis'       // New
    | 'missing_uri'         // New
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
            if (entry.stage === 'voice_whisper') estimatedCost = 0.006; // Approx Whisper cost per min (0.006/min)
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
                processingTimeMs: entry.processingTimeMs || (currentTime - this.startTime),
            }
        };

        // 🔒 PII Masking for Storage (DB에는 항상 마스킹된 데이터 저장)
        const safeMetadata = maskPIIInObject(logItem.metadata);
        const storageLogItem: OcrLogEntry = {
            ...logItem,
            metadata: safeMetadata
        };

        this.logs.push(storageLogItem);
        const icon = entry.success ? '✅' : '❌';

        // 🛠️ Verbose Logging
        if (__DEV__) {
            console.log(`\n========================================`);
            console.log(`[OcrLogger] ${icon} Stage ${entry.stageOrder} (${entry.stage})`);
            console.log(`----------------------------------------`);
            console.log(`Status: ${entry.success ? 'Success' : 'Failed'}`);
            if (entry.fallbackReason) console.log(`Reason: ${entry.fallbackReason}`);
            if (entry.docTypePredicted) console.log(`Type: ${entry.docTypePredicted} (Conf: ${entry.confidence})`);
            if (estimatedCost > 0) console.log(`Cost: $${estimatedCost.toFixed(5)}`);

            // 개발 모드에서는 원본 메타데이터 출력 (디버깅용)
            if (entry.metadata) {
                console.log(`Metadata (Raw):`, JSON.stringify(logItem.metadata, null, 2));
            }
            console.log(`========================================\n`);
        } else {
            // 상용 모드에서는 마스킹된 로그만 출력하거나 생략
            // 여기서는 마스킹된 로그 출력 (중요 에러 확인용)
            if (!entry.success) {
                console.log(`[OcrLogger] ${icon} Stage ${entry.stageOrder} Failed: ${entry.fallbackReason}`);
                if (safeMetadata) console.log(`Metadata (Masked):`, JSON.stringify(safeMetadata));
            }
        }
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

    logVoiceLocal(success: boolean, textLength: number, fallbackReason?: FallbackReason, metadata?: Record<string, any>): void {
        this.logStage({
            stage: 'voice_local',
            stageOrder: 1, // Voice Pipeline Step 1
            success,
            textLength,
            fallbackReason,
            metadata: {
                ...metadata,
                source: 'local'
            }
        });
    }

    logVoiceWhisper(success: boolean, textLength: number, fallbackReason?: FallbackReason, metadata?: Record<string, any>): void {
        this.logStage({
            stage: 'voice_whisper',
            stageOrder: 2, // Voice Pipeline Step 2
            success,
            textLength,
            fallbackReason,
            metadata: {
                ...metadata,
                source: 'whisper'
            }
        });
    }

    logVoiceConfirm(originalText: string, editedText: string): void {
        const isEdited = originalText !== editedText;
        this.logStage({
            stage: 'voice_confirm',
            stageOrder: 2,
            success: true,
            textLength: editedText?.length || 0,
            fallbackReason: 'needs_confirmation',
            metadata: {
                source: 'local',
                original_text: originalText,
                edited_text: editedText,
                is_edited: isEdited
            }
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
