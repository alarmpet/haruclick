import { supabase } from './supabase';
import { Platform } from 'react-native';

export type OcrStage = 'ml_kit' | 'openai_text' | 'google_vision' | 'openai_vision';

export interface OcrLogEntry {
    stage: OcrStage;
    stageOrder: number;
    success: boolean;
    fallbackReason?: string;
    textLength?: number;
    resultType?: string;
    processingTimeMs?: number;
    imageSizeKb?: number;
    errorMessage?: string;
    metadata?: Record<string, any>;
}

/**
 * OCR 파이프라인 로깅 서비스
 * 4단계 파이프라인: ML Kit → OpenAI Text → Google Vision → OpenAI Vision
 */
export class OcrLogger {
    private sessionId: string;
    private userId: string | null = null;
    private logs: OcrLogEntry[] = [];
    private startTime: number = 0;
    private imageSizeKb?: number;

    constructor() {
        // 고유 세션 ID 생성
        this.sessionId = this.generateSessionId();
    }

    private generateSessionId(): string {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    /**
     * 파이프라인 시작 시 호출
     */
    async startSession(imageSizeKb?: number): Promise<void> {
        this.startTime = Date.now();
        this.logs = [];
        this.imageSizeKb = imageSizeKb;

        // 현재 사용자 ID 가져오기 (실패해도 계속 진행)
        try {
            const { data: { user } } = await supabase.auth.getUser();
            this.userId = user?.id || null;
        } catch {
            this.userId = null;
        }

        console.log(`[OcrLogger] Session started: ${this.sessionId}`);
    }

    /**
     * 각 단계 결과 기록
     */
    logStage(entry: OcrLogEntry): void {
        this.logs.push({
            ...entry,
            processingTimeMs: entry.processingTimeMs || (Date.now() - this.startTime),
            imageSizeKb: entry.imageSizeKb ?? this.imageSizeKb
        });

        const status = entry.success ? '✅' : '❌';
        console.log(`[OcrLogger] ${status} Stage ${entry.stageOrder} (${entry.stage}): ${entry.success ? 'Success' : entry.fallbackReason || 'Failed'}`);
    }

    /**
     * 1️⃣ ML Kit 결과 로깅 헬퍼
     */
    logMlKit(success: boolean, textLength: number, fallbackReason?: string): void {
        this.logStage({
            stage: 'ml_kit',
            stageOrder: 1,
            success,
            textLength,
            fallbackReason: success ? undefined : fallbackReason,
        });
    }

    /**
     * 2️⃣ OpenAI Text 분석 결과 로깅 헬퍼
     */
    logOpenAiText(success: boolean, resultType?: string, fallbackReason?: string): void {
        this.logStage({
            stage: 'openai_text',
            stageOrder: 2,
            success,
            resultType,
            fallbackReason: success ? undefined : fallbackReason,
        });
    }

    /**
     * 3️⃣ Google Vision OCR 결과 로깅 헬퍼
     */
    logGoogleVision(success: boolean, textLength: number, errorMessage?: string): void {
        this.logStage({
            stage: 'google_vision',
            stageOrder: 3,
            success,
            textLength,
            errorMessage,
        });
    }

    /**
     * 4️⃣ OpenAI Vision (이미지 직접 분석) 결과 로깅 헬퍼
     */
    logOpenAiVision(success: boolean, resultType?: string, errorMessage?: string): void {
        this.logStage({
            stage: 'openai_vision',
            stageOrder: 4,
            success,
            resultType,
            errorMessage,
        });
    }

    /**
     * 세션 종료 시 모든 로그를 Supabase에 전송
     */
    async flush(): Promise<void> {
        if (this.logs.length === 0) return;

        const records = this.logs.map(log => ({
            session_id: this.sessionId,
            user_id: this.userId,
            stage: log.stage,
            stage_order: log.stageOrder,
            success: log.success,
            fallback_reason: log.fallbackReason,
            text_length: log.textLength,
            result_type: log.resultType,
            processing_time_ms: log.processingTimeMs,
            error_message: log.errorMessage,
            raw_metadata: log.metadata ? JSON.stringify(log.metadata) : null,
        }));

        try {
            const { error } = await supabase
                .from('ocr_pipeline_logs')
                .insert(records);

            if (error) {
                console.warn('[OcrLogger] Failed to save logs:', error.message);
            } else {
                console.log(`[OcrLogger] Saved ${records.length} log entries`);
            }
        } catch (e) {
            console.warn('[OcrLogger] Exception saving logs:', e);
        }
    }

    /**
     * 현재 세션 ID 반환
     */
    getSessionId(): string {
        return this.sessionId;
    }
}

// 싱글톤 인스턴스 (선택적 사용)
let currentLogger: OcrLogger | null = null;

export function createOcrLogger(): OcrLogger {
    currentLogger = new OcrLogger();
    return currentLogger;
}

export function getCurrentOcrLogger(): OcrLogger | null {
    return currentLogger;
}
