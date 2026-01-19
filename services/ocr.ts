import { Platform, InteractionManager, Image } from 'react-native';
import TextRecognition, { TextRecognitionScript, TextRecognitionResult } from '@react-native-ml-kit/text-recognition';
import { getOcrCache, setOcrCache } from './ocrCache';
import { isPreprocessEnabled } from './ocrSettings';
import { showError } from './errorHandler';
import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';
import { extractTextWithGoogleVision } from './GoogleVisionService';
import { createOcrLogger, getCurrentOcrLogger } from './OcrLogger';
import { getImageHash } from './imageHash';
import { ImageType } from './ImageClassifier';

const MIN_TEXT_LEN = 15;

// ==========================================
// 1. Adaptive Preprocessing
// ==========================================
async function preprocessImage(uri: string, targetWidth: number): Promise<string> {
    try {
        const manipResult = await ImageManipulator.manipulateAsync(
            uri,
            [{ resize: { width: targetWidth } }],
            { compress: 0.9, format: ImageManipulator.SaveFormat.JPEG }
        );
        return manipResult.uri;
    } catch (e) {
        console.warn('[OCR] Preprocessing failed, using original:', e);
        return uri;
    }
}

async function buildAdaptiveVariants(uri: string): Promise<string[]> {
    if (!isPreprocessEnabled()) return [uri];

    return new Promise<{ width: number, height: number }>((resolve) => {
        Image.getSize(uri, (w, h) => resolve({ width: w, height: h }), () => resolve({ width: 0, height: 0 }));
    }).then(async ({ width }) => {
        const variants: string[] = [];

        // Strategy: Try 1280px (optimized) FIRST. 
        // ML Kit works best/fastest around this size.
        // Original is often too large (12MP+), causing timeouts.

        let resized1280: string | null = null;
        let resized2048: string | null = null;

        if (width > 0) {
            if (Math.abs(width - 1280) > 200) {
                console.log('[OCR] Preparing 1280px variant');
                resized1280 = await preprocessImage(uri, 1280);
            }
            if (Math.abs(width - 2048) > 200) {
                console.log('[OCR] Preparing 2048px variant');
                resized2048 = await preprocessImage(uri, 2048);
            }
        }

        // Order: 1280 -> Original -> 2048
        if (resized1280) variants.push(resized1280);
        variants.push(uri);
        if (resized2048) variants.push(resized2048);

        return variants;
    });
}


// ==========================================
// 2. Advanced Scoring Algorithm
// ==========================================
export function scoreOcrText(text: string): number {
    const trimmed = text.trim();
    if (!trimmed) return 0;

    let score = 0;
    const length = trimmed.length;

    // 1. Text Length (Base score, max 30)
    // Give 30 points if roughly 20 chars or more
    score += Math.min(length / 20, 1) * 30;

    // 2. Critical Patterns (Date/Time/Amount) (Max 40)
    const hasDate = /(\d{4}[./-]\d{1,2}[./-]\d{1,2})|(\d{1,2}\/\d{1,2})|(\d{1,2}월\s*\d{1,2}일)/.test(trimmed);
    const hasAmount = /(\d{1,3}(,\d{3})+)|(\d+\s*원)|(KRW)/i.test(trimmed);

    if (hasDate) score += 20;
    if (hasAmount) score += 20;

    // 3. Keywords (Max 30)
    // Transaction or Event keywords
    if (/(승인|결제|입금|출금|잔액|유효기간|주문|합계|예약|일정|장소|문의|초대|결혼|부고|돌잔치)/.test(trimmed)) {
        score += 30;
    }

    // 4. Noise Penalty
    const specialChars = (trimmed.match(/[^a-zA-Z0-9가-힣\s]/g) || []).length;
    if (length > 0) {
        const noiseRatio = specialChars / length;
        // If too much noise (special chars), cut score in half
        if (noiseRatio > 0.4) score *= 0.5;
    }

    return Math.min(Math.round(score), 100);
}

// ==========================================
// 3. Conditional Typo Correction
// ==========================================
export function correctOcrTypos(text: string): string {
    if (!text) return text;
    const parts = text.split(/(\s+|(?=[,.])|(?<=[,.]))/);

    return parts.map((token) => {
        const hasDigit = /\d/.test(token);
        const hasSuspicious = /[SOIBZl]/.test(token);

        if (hasDigit && hasSuspicious) {
            return token
                .replace(/[O]/g, '0')
                .replace(/[o]/g, '0')
                .replace(/[Il]/g, '1')
                .replace(/S/g, '5')
                .replace(/B/g, '8')
                .replace(/Z/g, '2');
        }

        if (/^[SOIBZ]\d+/.test(token)) {
            return token
                .replace(/^S/, '5')
                .replace(/^O/, '0')
                .replace(/^I/, '1')
                .replace(/^l/, '1')
                .replace(/^B/, '8');
        }

        return token;
    }).join('');
}

// ==========================================
// 4. ANCHOR-Based Relative Date Parsing
// ==========================================

type Anchor = {
    date: Date;        // anchor date (local)
    lineIndex: number; // where it was found (within block)
    colIndex: number;  // approximate position in line
    raw: string;       // "01/10" or "2026-01-10"
};

type Block = {
    lines: string[];
    startLine: number; // original index in whole text
};

type Options = {
    now?: Date;                 // scan time (fallback anchor)
    defaultYear?: number;       // if MM/DD only
    maxLineDistance?: number;   // anchor propagation window by lines
    maxCharDistance?: number;   // anchor propagation window by chars (same line)
    preferPast?: boolean;       // if year ambiguous, prefer past date vs future
};

const DEFAULT_OPTS = {
    maxLineDistance: 3,
    maxCharDistance: 60,
    preferPast: true
};

/**
 * Entry point
 */
export function preprocessRelativeDates(rawText: string, opts?: Options): string {
    if (!rawText) return rawText;

    const now = opts?.now ?? new Date();
    const o: Required<Options> = {
        now,
        defaultYear: opts?.defaultYear ?? now.getFullYear(),
        maxLineDistance: opts?.maxLineDistance ?? DEFAULT_OPTS.maxLineDistance,
        maxCharDistance: opts?.maxCharDistance ?? DEFAULT_OPTS.maxCharDistance,
        preferPast: opts?.preferPast ?? DEFAULT_OPTS.preferPast
    };

    const allLines = normalizeLines(rawText);
    const blocks = splitIntoBlocks(allLines);

    const outLines = [...allLines];

    for (const block of blocks) {
        const anchors = findAnchorsInBlock(block, o);
        const fallbackAnchor: Anchor = {
            date: stripTime(o.now),
            lineIndex: Math.floor(block.lines.length / 2),
            colIndex: 0,
            raw: 'NOW'
        };
        const blockAnchors = anchors.length ? anchors : [fallbackAnchor];

        const processed = block.lines.map((line, i) => {
            return replaceRelativeWordsWithAnchors(line, i, blockAnchors, o);
        });

        for (let i = 0; i < processed.length; i++) {
            outLines[block.startLine + i] = processed[i];
        }
    }

    return outLines.join('\n');
}

/* ------------------------- Helpers ------------------------- */

function normalizeLines(text: string): string[] {
    return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
}

/**
 * Block split strategy:
 * - empty line => new block
 * - certain headers can start new block
 */
function splitIntoBlocks(lines: string[]): Block[] {
    const blocks: Block[] = [];
    let buf: string[] = [];
    let start = 0;

    const isBoundary = (line: string) => {
        const t = line.trim();
        if (!t) return true;
        if (/^(토스|토스뱅크|카카오|KB|신한|우리|하나)\b/.test(t)) return true;
        if (/^\[Web발신\]/.test(t)) return false;
        if (/^[-=]{3,}$/.test(t)) return true;
        return false;
    };

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        if (buf.length === 0) start = i;
        buf.push(line);

        if (line.trim() === '') {
            blocks.push({ lines: buf.slice(0, -1), startLine: start });
            buf = [];
            continue;
        }

        const next = i + 1 < lines.length ? lines[i + 1] : null;
        if (next !== null && isBoundary(next) && buf.length > 0) {
            blocks.push({ lines: buf, startLine: start });
            buf = [];
        }
    }

    if (buf.length) blocks.push({ lines: buf, startLine: start });
    return blocks.filter(b => b.lines.some(l => l.trim().length > 0));
}

/**
 * Find explicit dates inside block: supports
 * - YYYY-MM-DD
 * - YYYY/MM/DD
 * - YYYY년 M월 D일
 * - MM/DD or MM.DD (uses defaultYear with preferPast correction)
 * - M월 D일 (uses defaultYear with preferPast correction)
 */
function findAnchorsInBlock(block: Block, o: Required<Options>): Anchor[] {
    const anchors: Anchor[] = [];

    const ymd = /\b(20\d{2})[.\-\/](\d{1,2})[.\-\/](\d{1,2})\b/g;
    const yyMd = /\b(\d{2})[.\-\/](\d{1,2})[.\-\/](\d{1,2})\b/g; // New: 26/01/14 support
    const ymdKorean = /\b(20\d{2})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일\b/g;
    const md = /\b(\d{1,2})[\/.](\d{1,2})\b/g;
    const mdKorean = /\b(\d{1,2})\s*월\s*(\d{1,2})\s*일\b/g;

    block.lines.forEach((line, lineIndex) => {
        const blocked: Array<[number, number]> = [];
        const isBlocked = (idx: number) => blocked.some(([s, e]) => idx >= s && idx < e);

        // 1. YYYY-MM-DD
        for (const m of line.matchAll(ymd)) {
            const year = toInt(m[1]);
            const month = toInt(m[2]);
            const day = toInt(m[3]);
            const d = safeDate(year, month, day);
            if (!d) continue;

            anchors.push({
                date: stripTime(d),
                lineIndex,
                colIndex: m.index ?? 0,
                raw: m[0]
            });

            if (m.index !== undefined) {
                blocked.push([m.index, m.index + m[0].length]);
            }
        }

        // 2. YY-MM-DD (New)
        for (const m of line.matchAll(yyMd)) {
            if (m.index !== undefined && isBlocked(m.index)) continue;

            let year = toInt(m[1]);
            const month = toInt(m[2]);
            const day = toInt(m[3]);

            // Assume 20xx context for receipt dates
            year += 2000;

            const d = safeDate(year, month, day);
            if (!d) continue;

            anchors.push({
                date: stripTime(d),
                lineIndex,
                colIndex: m.index ?? 0,
                raw: m[0]
            });

            if (m.index !== undefined) {
                blocked.push([m.index, m.index + m[0].length]);
            }
        }

        for (const m of line.matchAll(ymdKorean)) {
            const year = toInt(m[1]);
            const month = toInt(m[2]);
            const day = toInt(m[3]);
            const d = safeDate(year, month, day);
            if (!d) continue;

            anchors.push({
                date: stripTime(d),
                lineIndex,
                colIndex: m.index ?? 0,
                raw: m[0]
            });

            if (m.index !== undefined) {
                blocked.push([m.index, m.index + m[0].length]);
            }
        }

        for (const m of line.matchAll(md)) {
            if (m.index !== undefined && isBlocked(m.index)) continue;

            const month = toInt(m[1]);
            const day = toInt(m[2]);
            let year = o.defaultYear;
            let d = safeDate(year, month, day);
            if (!d) continue;

            if (o.preferPast) {
                const nowDate = stripTime(o.now);
                const diffDays = daysBetween(nowDate, stripTime(d));
                if (diffDays > 30) {
                    const d2 = safeDate(year - 1, month, day);
                    if (d2) d = d2;
                }
            }

            anchors.push({
                date: stripTime(d),
                lineIndex,
                colIndex: m.index ?? 0,
                raw: m[0]
            });
        }

        for (const m of line.matchAll(mdKorean)) {
            if (m.index !== undefined && isBlocked(m.index)) continue;

            const month = toInt(m[1]);
            const day = toInt(m[2]);
            let year = o.defaultYear;
            let d = safeDate(year, month, day);
            if (!d) continue;

            if (o.preferPast) {
                const nowDate = stripTime(o.now);
                const diffDays = daysBetween(nowDate, stripTime(d));
                if (diffDays > 30) {
                    const d2 = safeDate(year - 1, month, day);
                    if (d2) d = d2;
                }
            }

            anchors.push({
                date: stripTime(d),
                lineIndex,
                colIndex: m.index ?? 0,
                raw: m[0]
            });
        }
    });

    const key = (a: Anchor) => `${a.lineIndex}:${a.colIndex}:${a.date.toISOString().slice(0, 10)}`;
    const seen = new Set<string>();
    return anchors.filter(a => {
        const k = key(a);
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
    });
}

/**
 * Replace relative words with computed absolute date string like 2026-01-08
 */
function replaceRelativeWordsWithAnchors(
    line: string,
    lineIndex: number,
    anchors: Anchor[],
    o: Required<Options>
): string {
    const patterns: Array<{ re: RegExp; offsetDays: number }> = [
        { re: /그저께|그제/g, offsetDays: -2 },
        { re: /어제|작일/g, offsetDays: -1 },
        { re: /오늘/g, offsetDays: 0 },
        { re: /내일/g, offsetDays: 1 },
        { re: /낼모레/g, offsetDays: 2 },
        { re: /모레/g, offsetDays: 2 },
        { re: /글피|사흘\s*후|사흘뒤/g, offsetDays: 3 },
        { re: /다음주/g, offsetDays: 7 }
    ];

    let result = line;

    for (const p of patterns) {
        result = result.replace(p.re, (match, ...args) => {
            const offset = args[args.length - 2] as number;
            const best = pickBestAnchor(lineIndex, offset, anchors, o);
            const target = addDays(best.date, p.offsetDays);
            const iso = toISODate(target);
            return iso;
        });
    }

    return result;
}

/**
 * Choose the closest anchor (multi-anchor support) with propagation limits.
 */
function pickBestAnchor(
    targetLine: number,
    targetCol: number,
    anchors: Anchor[],
    o: Required<Options>
): Anchor {
    let best = anchors[0];
    let bestScore = Number.POSITIVE_INFINITY;

    for (const a of anchors) {
        const lineDist = Math.abs(a.lineIndex - targetLine);
        const linePenalty = lineDist <= o.maxLineDistance ? 0 : 1000 + (lineDist - o.maxLineDistance) * 10;

        let charPenalty = 0;
        if (a.lineIndex === targetLine) {
            const charDist = Math.abs(a.colIndex - targetCol);
            charPenalty = charDist <= o.maxCharDistance ? charDist : 500 + (charDist - o.maxCharDistance);
        } else {
            charPenalty = 200;
        }

        const score = lineDist * 50 + charPenalty + linePenalty;

        if (score < bestScore) {
            bestScore = score;
            best = a;
        }
    }

    return best;
}

/* ------------------------- Date utils ------------------------- */

function stripTime(d: Date): Date {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addDays(d: Date, days: number): Date {
    const nd = new Date(d);
    nd.setDate(nd.getDate() + days);
    return stripTime(nd);
}

function toISODate(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function safeDate(y: number, m: number, d: number): Date | null {
    if (m < 1 || m > 12 || d < 1 || d > 31) return null;
    const dt = new Date(y, m - 1, d);
    if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
    return dt;
}

function toInt(s: string): number {
    return parseInt(s, 10);
}

function daysBetween(a: Date, b: Date): number {
    const ms = stripTime(b).getTime() - stripTime(a).getTime();
    return Math.round(ms / (24 * 60 * 60 * 1000));
}

// ==========================================
// Main Pipeline
// ==========================================

async function getImageSizeKb(uri: string): Promise<number | undefined> {
    try {
        const info = await FileSystem.getInfoAsync(uri);
        if (info.exists && typeof info.size === 'number') return Math.round(info.size / 1024);
    } catch (e) { /* ignore */ }
    return undefined;
}

export function filterByConfidence(result: any, threshold: number): string {
    if (!result?.blocks) return result?.text || '';
    const filtered = result.blocks.filter((block: any) => {
        const txt = block.text || '';
        const isVital = /\d/.test(txt) || /[원$]/.test(txt);
        if (typeof block.confidence === 'number' && block.confidence < threshold) {
            return isVital;
        }
        return true;
    });
    return filtered.map((b: any) => b.text).join('\n').trim();
}

/**
 * UPDATED: Returns Object { text, score } instead of just string
 */
export async function extractTextFromImage(uri: string, classification: ImageType = ImageType.UNKNOWN): Promise<{ text: string; score: number }> {
    try {
        let logger = getCurrentOcrLogger();
        if (!logger) logger = createOcrLogger();

        const imageSizeKb = await getImageSizeKb(uri);
        const imageHash = await getImageHash(uri);

        if (logger) await logger.startSession(imageHash, imageSizeKb);

        if (Platform.OS !== 'web') {
            await new Promise<void>(resolve => InteractionManager.runAfterInteractions(() => resolve()));
        }

        const cached = await getOcrCache(imageHash);
        if (cached) {
            console.log('[OCR] Local Cache HIT');
            logger?.logStage({
                stage: 'ml_kit',
                stageOrder: 1,
                success: true,
                fallbackReason: 'local_cache_hit',
                textLength: String(cached).length
            });
            // Approximate score for cached item (assume good quality if cached)
            return { text: cached as string, score: 80 };
        }

        const variants = await buildAdaptiveVariants(uri);
        console.log(`[OCR] Variants generated: ${variants.length}`);

        let bestText = "";
        let bestScore = -1;

        for (const [index, variantUri] of variants.entries()) {
            try {
                const res = await TextRecognition.recognize(variantUri, TextRecognitionScript.KOREAN);

                const rawText = filterByConfidence(res, 0.4);
                // ✅ 상대 날짜 전처리 제거 - OpenAI가 컨텍스트(명시적 날짜)를 보고 직접 판단
                const processedText = correctOcrTypos(rawText);
                const score = scoreOcrText(processedText);

                console.log(`[OCR] Variant ${index} Score: ${score}`);

                if (score > bestScore) {
                    bestScore = score;
                    bestText = processedText;
                }

                if (bestScore > 80) break;

            } catch (err) {
                console.warn(`[OCR] Variant ${index} failed:`, err);
            }
        }

        if (bestScore < 50) {
            console.log('[OCR] Quality low (<50), attempting Google Vision (Stage 3)...');
            try {
                const visionText = await extractTextWithGoogleVision(uri);
                const visionScore = scoreOcrText(visionText);
                if (visionScore > bestScore) {
                    bestText = correctOcrTypos(visionText);
                    bestScore = visionScore;
                    logger?.logGoogleVision(true, bestText.length);
                }
            } catch (e) {
                console.warn('[OCR] Vision fallback failed');
            }
        }

        // ✅ 사양서 기준 임계값 조정 (10 → 15) - 저품질 텍스트 필터링 강화
        const usable = bestScore >= 15;

        logger?.logStage({
            stage: 'ml_kit',
            stageOrder: 1,
            success: usable,
            textLength: bestText.length,
            confidence: bestScore / 100,
            metadata: { score: bestScore, variants: variants.length }
        });

        if (usable) {
            await setOcrCache(imageHash, bestText);
        }

        return { text: bestText, score: bestScore };

    } catch (e: any) {
        showError(e.message ?? 'OCR Failed');
        return { text: '', score: 0 };
    }
}

// ==========================================
// 5. Chat Screenshot Preprocessing (Stage 1)
// ==========================================

export type RelativeWord = '오늘' | '어제' | '그저께' | '모레';

export type ChatBlock = {
    idx: number;
    lines: string[];
    raw: string;

    // header like "(그저께) 15:32" that belongs to this block (propagated)
    headerRel?: { word: RelativeWord; time: string; sourceLine: string };

    // explicit anchor in the block, e.g. "01/10 16:11"
    anchorAbs?: { mm: number; dd: number; time?: string; sourceLine: string };

    // resolved absolute datetime strings for OpenAI to follow
    resolved?: {
        headerDateTime?: string; // YYYY-MM-DD HH:mm
        anchorDateTime?: string; // YYYY-MM-DD HH:mm (if time exists) or YYYY-MM-DD
    };
};

function pad2(n: number) { return String(n).padStart(2, '0'); }

function formatYmd(y: number, m: number, d: number) {
    return `${y}-${pad2(m)}-${pad2(d)}`;
}

// Helper to add days to a date accurately
function addDaysDate(date: Date, deltaDays: number) {
    const d = new Date(date);
    d.setDate(d.getDate() + deltaDays);
    return d;
}

function parseRelativeHeaderLine(line: string): { word: RelativeWord; time: string } | null {
    const m = line.match(/^\((오늘|어제|그저께|모레)\)\s*(\d{1,2}:\d{2})\s*$/);
    if (!m) return null;
    return { word: m[1] as RelativeWord, time: m[2] };
}

function parseAnchorAbsLine(line: string): { year?: number; mm: number; dd: number; time?: string } | null {
    // 1. Try YYYY/MM/DD or YY/MM/DD
    // Matches: 2026/01/14, 26/01/14, 2026-01-14, 26-01-14
    const ymdMatch = line.match(/(?:^|\s)(20\d{2}|\d{2})[.\-\/](\d{1,2})[.\-\/](\d{1,2})(?:\s+(\d{1,2}:\d{2}))?/);
    if (ymdMatch) {
        let y = Number(ymdMatch[1]);
        if (y < 100) y += 2000; // 26 -> 2026
        return { year: y, mm: Number(ymdMatch[2]), dd: Number(ymdMatch[3]), time: ymdMatch[4] };
    }

    // 2. Fallback to MM/DD
    // supports: 01/10 16:11  |  1/10 16:11  |  01/10
    const m = line.match(/(?:^|\s)(\d{1,2})[\/.-](\d{1,2})(?:\s+(\d{1,2}:\d{2}))?/);
    if (!m) return null;
    return { mm: Number(m[1]), dd: Number(m[2]), time: m[3] };
}

function guessYearFor(mm: number, dd: number, today: Date, explicitYear?: number) {
    if (explicitYear) return explicitYear;
    // Simple & safe: assume same year; if date looks "in future" too far, roll back year.
    const y = today.getFullYear();
    const candidate = new Date(y, mm - 1, dd);
    const diffDays = (candidate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24);
    if (diffDays > 30) return y - 1; // e.g., January screenshot scanned in Feb etc.
    return y;
}

function resolveRelative(word: RelativeWord): number {
    if (word === '오늘') return 0;
    if (word === '어제') return -1;
    if (word === '그저께') return -2;
    if (word === '모레') return 2;
    return 0;
}

/**
 * 핵심 전처리:
 * - 말풍선(블록) 분리
 * - "(그저께) 15:32" 같은 헤더 상대시간을 "이전 블록들"에 전파
 * - "01/10 16:11" 같은 명시 앵커를 찾아, 헤더 상대시간을 앵커 기준으로 절대값으로 변환
 * - OpenAI에 전달할 텍스트를 BLOCK 단위로 재구성
 */
export function preprocessChatScreenshotOcrText(
    ocrText: string,
    scanNow: Date = new Date()
): string {
    const lines = (ocrText || '')
        .split('\n')
        .map(l => l.trim())
        .filter(l => l.length > 0);

    // 1) 블록 분리 (휴리스틱)
    const blocks: ChatBlock[] = [];
    let cur: string[] = [];

    const startNewBlock = () => {
        if (cur.length) {
            const raw = cur.join('\n');
            blocks.push({ idx: blocks.length + 1, lines: cur, raw });
            cur = [];
        }
    };

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // (a) 헤더 상대시간 라인은 블록에 넣지 않고 따로 처리 (레이아웃 손실 대응)
        if (parseRelativeHeaderLine(line)) {
            // 먼저 현재 블록은 닫아준다(대부분 헤더는 블록 사이에 존재)
            startNewBlock();
            // 헤더 라인은 별도 배열에 저장하기 위해 blocks에 "marker"로 넣지 않고,
            // 아래 단계에서 line list를 다시 훑기 어렵기 때문에, blocks에 special block으로 넣을 수도 있지만,
            // 여기서는 간단히 "header-only block"으로 넣는다.
            blocks.push({
                idx: blocks.length + 1,
                lines: [line],
                raw: line
            });
            continue;
        }

        // (b) 새로운 말풍선 시작 패턴들
        const isWeb = /^\[Web발신\]\s*$/.test(line);
        const looksLikeNewCardMsg =
            /결제\s*\|/.test(line) || // "8,000원 결제 | ..."
            /잔액\s*\d{1,3}(?:,\d{3})*원/.test(line);

        const looksLikeBankTitle =
            /(토스뱅크|모임통장|카카오뱅크|KB|국민|신한|우리|하나)/.test(line) &&
            !/원/.test(line); // 금액줄과 구분

        // web발신이 다시 나오면 새 블록으로 보는 게 안전
        // Exception: 직전 줄이 "은행/서비스 제목줄"이었다면 같은 말풍선으로 간주 (e.g. 토스뱅크 모임통장 \n [Web발신])
        if (isWeb && cur.length) {
            const lastLine = cur[cur.length - 1];
            const isPrevBankTitle = /(토스뱅크|모임통장|카카오뱅크|KB|국민|신한|우리|하나)/.test(lastLine) && !/원/.test(lastLine);

            if (!isPrevBankTitle) {
                startNewBlock();
            }
        }

        // 은행/서비스 제목줄이 나오면 새 블록으로 보는 게 안전
        if (looksLikeBankTitle && cur.length) startNewBlock();

        cur.push(line);

        // 카드결제 메시지처럼 한 덩어리 끝났다고 판단되는 지점에서 블록 닫기(너무 공격적이면 주석)
        // if (looksLikeNewCardMsg && i + 1 < lines.length && /^\[Web발신\]/.test(lines[i + 1])) {
        //   startNewBlock();
        // }
    }
    startNewBlock();

    // 2) header-only block을 실제 header 이벤트로 추출 (레이아웃 복원용)
    // header-only blocks: raw == "(그저께) 15:32"
    const headerEvents: { atIndex: number; word: RelativeWord; time: string; sourceLine: string }[] = [];
    const realBlocks: ChatBlock[] = [];

    for (let i = 0; i < blocks.length; i++) {
        const b = blocks[i];
        if (b.lines.length === 1) {
            const rel = parseRelativeHeaderLine(b.lines[0]);
            if (rel) {
                headerEvents.push({ atIndex: realBlocks.length, word: rel.word, time: rel.time, sourceLine: b.lines[0] });
                continue;
            }
        }
        realBlocks.push(b);
    }

    // 3) 각 블록에서 명시 앵커(01/10 16:11) 찾기
    for (const b of realBlocks) {
        for (const line of b.lines) {
            const abs = parseAnchorAbsLine(line);
            if (abs) {
                b.anchorAbs = { ...abs, sourceLine: line };
                break;
            }
        }
    }

    // 4) 헤더 전파 규칙:
    // - headerEvents는 "블록 사이에 있던 헤더"로 보고, 그 헤더는 "이전 블록들"에 적용
    // - 적용 범위: 직전 블록부터 거슬러 올라가며, '이미 header가 있거나' '명시 anchor가 있는 블록'을 만나면 멈춤
    for (const ev of headerEvents) {
        let j = ev.atIndex - 1;
        while (j >= 0) {
            const b = realBlocks[j];
            if (b.headerRel) break;
            if (b.anchorAbs) break; // 명시 anchor 있는 블록은 자기 기준이 있으니 header 전파 중단
            b.headerRel = { word: ev.word, time: ev.time, sourceLine: ev.sourceLine };
            j--;
        }
    }

    // 5) 헤더 상대시간을 절대시간으로 해석하기 위한 "기준 앵커" 선택:
    // - 헤더가 있는 블록은: (1) 같은 스크린샷 내 "가장 가까운 명시 앵커"를 우선 사용
    //   우선순위: "앞으로(다음 블록들)에서 처음 나오는 anchor" > "뒤로(이전 블록들) 마지막 anchor" > TODAY
    const findNearestAnchorDate = (fromIndex: number): Date => {
        // forward
        for (let k = fromIndex; k < realBlocks.length; k++) {
            const a = realBlocks[k].anchorAbs;
            if (a) {
                // @ts-ignore - year added to parseAnchorAbsLine
                const y = guessYearFor(a.mm, a.dd, scanNow, a.year);
                return new Date(y, a.mm - 1, a.dd);
            }
        }
        // backward
        for (let k = fromIndex - 1; k >= 0; k--) {
            const a = realBlocks[k].anchorAbs;
            if (a) {
                // @ts-ignore - year added to parseAnchorAbsLine
                const y = guessYearFor(a.mm, a.dd, scanNow, a.year);
                return new Date(y, a.mm - 1, a.dd);
            }
        }
        return scanNow;
    };

    // 6) resolved 값 채우기
    for (let i = 0; i < realBlocks.length; i++) {
        const b = realBlocks[i];
        b.resolved = b.resolved || {};

        if (b.anchorAbs) {
            const y = guessYearFor(b.anchorAbs.mm, b.anchorAbs.dd, scanNow);
            const date = formatYmd(y, b.anchorAbs.mm, b.anchorAbs.dd);
            b.resolved.anchorDateTime = b.anchorAbs.time ? `${date} ${b.anchorAbs.time}` : date;
        }

        if (b.headerRel) {
            const anchorDate = findNearestAnchorDate(i);
            const delta = resolveRelative(b.headerRel.word);
            const resolvedDate = addDaysDate(anchorDate, delta);
            const y = resolvedDate.getFullYear();
            const m = resolvedDate.getMonth() + 1;
            const d = resolvedDate.getDate();
            b.resolved.headerDateTime = `${formatYmd(y, m, d)} ${b.headerRel.time}`;
        }
    }

    // 7) OpenAI에 넘길 텍스트 재구성 (BLOCK 라벨 + resolved 힌트)
    const out: string[] = [];
    out.push(`OCR_SOURCE: CHAT_SCREENSHOT`);
    out.push(`SCAN_TODAY: ${formatYmd(scanNow.getFullYear(), scanNow.getMonth() + 1, scanNow.getDate())}`);
    out.push(`RULE: Use BLOCK-local ANCHOR/HEADER resolution. NEVER use SCAN_TODAY if an ANCHOR exists in screenshot.\n`);

    for (const b of realBlocks) {
        out.push(`[BLOCK_${b.idx}]`);

        if (b.resolved?.headerDateTime) out.push(`HEADER_RESOLVED_DATETIME: ${b.resolved.headerDateTime}`);
        if (b.resolved?.anchorDateTime) out.push(`ANCHOR_ABSOLUTE_DATETIME: ${b.resolved.anchorDateTime}`);

        out.push(`TEXT:`);
        out.push(b.raw);
        out.push(''); // spacer
    }

    return out.join('\n');
}
