
import { maskPII, maskPIIInObject } from '../../services/piiMasking';

describe('PII Masking Utilities', () => {

    describe('maskPII', () => {
        it('masks phone numbers correctly', () => {
            expect(maskPII('My phone is 010-1234-5678')).toBe('My phone is 010-****-****');
            expect(maskPII('Call me at 01098765432')).toBe('Call me at 010********');
            expect(maskPII('010-1234-5678, 010-9876-5432')).toBe('010-****-****, 010-****-****');
        });

        it('masks generic account numbers', () => {
            // Hyphenated
            expect(maskPII('Account: 123-456-789012')).toBe('Account: 123-***-******');
            // Long number
            expect(maskPII('Account: 110222333444')).toBe('Account: 110******44');
        });

        it('masks Korean names (2-4 chars)', () => {
            expect(maskPII('홍길동')).toBe('홍*동');
            expect(maskPII('남궁민수')).toBe('남*수'); // 4글자
            // NOTE: 문맥 없는 이름 마스킹은 완벽하지 않을 수 있음
        });

        it('masks addresses', () => {
            expect(maskPII('101동 1202호')).toBe('***동 ***호');
        });

        it('masks emails', () => {
            expect(maskPII('test@example.com')).toBe('te***@example.com');
        });
    });

    describe('maskPIIInObject', () => {
        it('recursively masks object properties', () => {
            const input = {
                user: {
                    name: '홍길동',
                    phone: '010-1234-5678'
                },
                memo: '계좌 110-222-333333 로 입금'
            };

            const expected = {
                user: {
                    name: '홍*동',
                    phone: '010-****-****'
                },
                memo: '계좌 110-***-****** 로 입금'
            };

            const result = maskPIIInObject(input);
            expect(result).toEqual(expected);
        });

        it('handles arrays', () => {
            const input = ['010-1111-2222', { note: '김철수' }];
            const result = maskPIIInObject(input);
            expect(result[0]).toBe('010-****-****');
            expect(result[1].note).toBe('김*수');
        });

        it('handles null/undefined gracefully', () => {
            expect(maskPIIInObject(null)).toBeNull();
            expect(maskPIIInObject(undefined)).toBeUndefined();
        });
    });
});
