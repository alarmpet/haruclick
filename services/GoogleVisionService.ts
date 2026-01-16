/**
 * GoogleVisionService.ts
 * Google Cloud Vision API를 사용한 OCR 서비스
 * 
 * ML Kit OCR 실패 시 폴백으로 사용
 * 월 1,000건 무료, 이후 1,000건당 $1.50
 * 한글 지원 우수
 * 
 * 필요 환경변수: EXPO_PUBLIC_GOOGLE_CLOUD_API_KEY
 */

import Constants from 'expo-constants';

const GOOGLE_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_CLOUD_API_KEY ??
    Constants.expoConfig?.extra?.EXPO_PUBLIC_GOOGLE_CLOUD_API_KEY;

const VISION_API_URL = 'https://vision.googleapis.com/v1/images:annotate';

interface VisionAPIResponse {
    responses: Array<{
        textAnnotations?: Array<{
            description: string;
            locale?: string;
        }>;
        fullTextAnnotation?: {
            text: string;
        };
        error?: {
            code: number;
            message: string;
        };
    }>;
}

/**
 * 이미지 URI를 base64로 변환
 */
async function imageToBase64(uri: string): Promise<string> {
    try {
        // React Native에서 fetch를 사용하여 이미지를 blob으로 가져온 후 base64 변환
        const response = await fetch(uri);
        const blob = await response.blob();

        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
                const base64data = reader.result as string;
                // data:image/jpeg;base64, 부분 제거
                const base64 = base64data.split(',')[1] || base64data;
                resolve(base64);
            };
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    } catch (error) {
        console.error('Image to base64 conversion error:', error);
        throw error;
    }
}

/**
 * Google Cloud Vision API를 사용하여 이미지에서 텍스트 추출
 * 
 * @param imageUri 이미지 파일 URI (file:// 또는 http://)
 * @returns 추출된 텍스트
 */
export async function extractTextWithGoogleVision(imageUri: string): Promise<string> {
    if (!GOOGLE_API_KEY) {
        throw new Error('Google Cloud API Key is missing. Please set EXPO_PUBLIC_GOOGLE_CLOUD_API_KEY in .env');
    }

    try {
        console.log('[GoogleVision] Starting OCR for:', imageUri.substring(0, 50) + '...');

        // 이미지를 base64로 변환
        const base64Image = await imageToBase64(imageUri);

        // Vision API 요청 본문
        const requestBody = {
            requests: [
                {
                    image: {
                        content: base64Image
                    },
                    features: [
                        {
                            type: 'TEXT_DETECTION', // 일반 텍스트
                            maxResults: 10
                        },
                        {
                            type: 'DOCUMENT_TEXT_DETECTION' // 문서 레이아웃 인식
                        }
                    ],
                    imageContext: {
                        languageHints: ['ko', 'en'] // 한국어, 영어 우선
                    }
                }
            ]
        };

        const response = await fetch(`${VISION_API_URL}?key=${GOOGLE_API_KEY}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('[GoogleVision] API error:', response.status, errorText);
            throw new Error(`Google Vision API error: ${response.status}`);
        }

        const data: VisionAPIResponse = await response.json();

        // 에러 체크
        if (data.responses[0]?.error) {
            throw new Error(`Vision API: ${data.responses[0].error.message}`);
        }

        // 전체 텍스트 추출 (DOCUMENT_TEXT_DETECTION 우선)
        const fullText = data.responses[0]?.fullTextAnnotation?.text;
        if (fullText) {
            console.log('[GoogleVision] Extracted text length:', fullText.length);
            return fullText;
        }

        // TEXT_DETECTION 결과 사용 (첫 번째 annotation이 전체 텍스트)
        const textAnnotations = data.responses[0]?.textAnnotations;
        if (textAnnotations && textAnnotations.length > 0) {
            const extractedText = textAnnotations[0].description;
            console.log('[GoogleVision] Extracted text length:', extractedText.length);
            return extractedText;
        }

        console.log('[GoogleVision] No text found in image');
        return '';
    } catch (error) {
        console.error('[GoogleVision] OCR Error:', error);
        throw error;
    }
}

/**
 * Google Vision API 연결 테스트
 */
export async function testGoogleVisionConnection(): Promise<boolean> {
    if (!GOOGLE_API_KEY) {
        console.log('[GoogleVision] API key not configured');
        return false;
    }

    try {
        // 간단한 API 테스트 (빈 이미지로 요청)
        const response = await fetch(`${VISION_API_URL}?key=${GOOGLE_API_KEY}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                requests: []
            })
        });

        // 200이면 API 키가 유효함 (빈 요청이므로 에러 응답이 오지만 인증은 성공)
        return response.status === 200 || response.status === 400;
    } catch (error) {
        console.error('[GoogleVision] Connection test failed:', error);
        return false;
    }
}
