export enum OcrErrorType {
    NETWORK_ERROR = 'network_error',
    TIMEOUT = 'timeout',
    API_KEY_ERROR = 'missing_api_key',
    QUOTA_EXCEEDED = 'quota_exceeded',
    PARSING_ERROR = 'json_parse_error',
    LOW_QUALITY = 'low_quality_image',
    USER_CANCELLED = 'user_cancelled',
    UNKNOWN_ERROR = 'unknown_error'
}

export class OcrError extends Error {
    public type: OcrErrorType;
    public stage?: string;
    public userMessage: string;
    public code?: string;

    constructor(type: OcrErrorType, message?: string, stage?: string, code?: string) {
        super(message || type);
        this.name = 'OcrError';
        this.type = type;
        this.stage = stage;
        this.code = code;
        this.userMessage = this.getUserMessage();
    }

    private getUserMessage(): string {
        switch (this.type) {
            case OcrErrorType.NETWORK_ERROR:
                return "지금 연결이 잠시 불안정해요.\n네트워크가 안정되면 다시 시도해 주세요.";
            case OcrErrorType.TIMEOUT:
                return "분석 시간이 조금 길어졌어요.\n다시 시도하거나 직접 입력할 수 있어요.";
            case OcrErrorType.API_KEY_ERROR:
            case OcrErrorType.QUOTA_EXCEEDED:
                return "일시적으로 분석을 진행할 수 없어요.\n잠시 후 다시 시도해 주세요.";
            case OcrErrorType.PARSING_ERROR:
                return "내용을 완벽하게 읽지 못했어요.\n남은 내용을 확인해 주세요."; // Partial success hint
            case OcrErrorType.LOW_QUALITY:
                return "사진이 너무 흐리거나 어두워요.\n다시 찍어주시겠어요?";
            case OcrErrorType.USER_CANCELLED:
                return "분석이 취소되었습니다.";
            default:
                return "알 수 없는 오류가 발생했습니다.\n잠시 후 다시 시도해 주세요.";
        }
    }
}
