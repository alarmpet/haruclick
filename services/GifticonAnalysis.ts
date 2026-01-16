import { analyzeImageText, ScannedData } from './ai/OpenAIService';

export class GifticonAnalysisService {
    /**
     * Parse raw OCR text to extract gifticon details.
     * Simple regex-based parsing for demonstration.
     */
    analyzeFromText(text: string): {
        productName: string;
        senderName: string;
        expiryDate: string;
        estimatedPrice: number;
        barcodeNumber?: string;
    } {
        // 1. Find Date (YYYY.MM.DD or YYYY-MM-DD)
        // Improved logic: Look for "유효기간" or "까지" context, or find all dates and take the latest one.
        const dateRegex = /(\d{4})[\.\-](\d{2})[\.\-](\d{2})/g;
        const allMatches = [...text.matchAll(dateRegex)];

        let expiryDate = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]; // Default: +60 days

        if (allMatches.length > 0) {
            // Sort dates and take the latest one (usually expiry is later than issue date)
            const sortedDates = allMatches.map(m => `${m[1]}-${m[2]}-${m[3]}`).sort();

            // Try to find a date specifically after "유효기간" or "까지"
            const validityKeywords = ['유효기간', '기간', '까지', 'Date'];
            let foundSpecific = false;

            for (const keyword of validityKeywords) {
                const index = text.indexOf(keyword);
                if (index !== -1) {
                    // Look for a date AFTER this keyword
                    const textAfter = text.substring(index);
                    const match = textAfter.match(/(\d{4})[\.\-](\d{2})[\.\-](\d{2})/);
                    if (match) {
                        expiryDate = `${match[1]}-${match[2]}-${match[3]}`;
                        foundSpecific = true;
                        break;
                    }
                }
            }

            // If no specific keyword link found, use the latest date (heuristic)
            if (!foundSpecific) {
                expiryDate = sortedDates[sortedDates.length - 1]; // Max date
            }
        }

        // 2. Find Sender (e.g., "From. 홍길동")
        const senderRegex = /(From|보낸사람|보낸분)[:\s]*([가-힣]+)/i;
        const senderMatch = text.match(senderRegex);
        const senderName = senderMatch ? senderMatch[2] : "알 수 없음";

        // 3. Find Product Name (Basic heuristic: First non-date, non-sender line, or hardcoded for demo)
        // For now, let's look for common keywords or just return a default if not found
        // Real implementation would use more sophisticated NLP or layout analysis
        const lines = text.split('\n').filter(line => line.trim().length > 0);
        let productName = "기프티콘 상품";
        // Simple heuristic: Try to find a line that looks like a product (not a date, not a label)
        for (const line of lines) {
            if (!line.match(dateRegex) && !line.includes('교환처') && !line.includes('주문번호')) {
                productName = line.trim();
                break; // Take the first valid-looking line
            }
        }

        // 4. Find Barcode Number (12-16 digits, possibly with spaces)
        // Look for sequences of digits that are at least 12 long (ignoring spaces)
        const barcodeRegex = /(\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{0,4})/;
        const barcodeMatch = text.match(barcodeRegex);
        let barcodeNumber = "";

        if (barcodeMatch) {
            // Validate length (at least 12 digits)
            const nums = barcodeMatch[0].replace(/[\s-]/g, '');
            if (nums.length >= 12) {
                barcodeNumber = barcodeMatch[0]; // Keep original formatting or create new one
            }
        }

        // Simple heuristic for price
        let estimatedPrice = 4500;
        if (productName.includes('케이크') || productName.includes('하우스') || productName.includes('세트')) {
            estimatedPrice = 30000;
        } else if (productName.includes('치킨') || productName.includes('피자')) {
            estimatedPrice = 20000;
        } else if (productName.includes('버거')) {
            estimatedPrice = 8000;
        }

        return {
            productName: productName.substring(0, 20), // Truncate
            senderName: senderName,
            expiryDate: expiryDate,
            estimatedPrice: estimatedPrice, // Improved default
            barcodeNumber: barcodeNumber
        };
    }

    /**
     * Parse raw OCR text using GPT-4o-mini for better accuracy.
     */
    /**
     * Parse raw OCR text using GPT-4o-mini for better accuracy.
     */
    async analyzeWithAI(text: string): Promise<ScannedData> {
        console.log('[GifticonAnalysis] analyzeWithAI started');
        try {
            // 15초 타임아웃 설정
            const timeoutPromise = new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error('AI Request Timeout')), 15000)
            );

            const aiResult = await Promise.race([
                analyzeImageText(text),
                timeoutPromise
            ]);

            console.log('[GifticonAnalysis] AI Result success', aiResult.length);
            return aiResult[0]; // Return first item
        } catch (error) {
            console.error("AI Analysis failed or timed out, falling back to regex", error);
            // Fallback to regex
            const regexResult = this.analyzeFromText(text);
            return {
                type: 'GIFTICON', // Regex fallback assumes Gifticon for now
                ...regexResult,
                brandName: undefined
            };
        }
    }

    async analyzeGuestImage(imageUri: string): Promise<{
        productName: string;
        senderName: string;
        expiryDate: string;
        estimatedPrice: number;
    }> {
        // Fallback for non-text based analysis (or just mock)
        await new Promise(resolve => setTimeout(resolve, 2000));
        return {
            productName: "스타벅스 아이스 아메리카노 T",
            senderName: "홍길동",
            expiryDate: "2026-06-30",
            estimatedPrice: 4500
        };
    }
}
